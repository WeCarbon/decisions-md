#!/bin/sh
# Drives the real window end to end against a throwaway project and decs home.
#   npx tauri build --debug --bundles app && sh e2e/run.sh [screenshot-dir]
# Needs a screen session; screenshots also need Screen Recording permission for the terminal.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
app="$here/../src-tauri/target/debug/bundle/macos/decs.app/Contents/MacOS/decs-app"
shots=${1:-}
work=$(mktemp -d "${TMPDIR:-/tmp}/decs-e2e.XXXXXX")
trap '[ -n "$shots" ] && cp "$work/log" "$shots/app.log"; rm -rf "$work"' EXIT

export DECS_HOME="$work/home" DECS_APP_DATA="$work/app" DECS_LANG=en
export DECS_BIN="$repo/bin/decs" DECS_APP_PICK="$work/shop" DECS_APP_SCRIPT="$here/walkthrough.js"
mkdir -p "$DECS_HOME" "$DECS_APP_PICK"
decs() { (cd "$DECS_APP_PICK" && DECS_AUTHOR="lane-db · schema" CLAUDECODE=1 "$DECS_BIN" "$@" >/dev/null); }
decs init --no-register
decs add "Pick a database" -o 1=SQLite 2=Postgres --body "Both work for the first year."
decs add "Write the schema" --task
decs start 2
decs add "Announce the launch" -o default:1="Post it" 2="Wait a week"
decs add "Tidy the logs" --task
decs add "Rename the bucket" -o 1=Yes 2=No
decs add "Rotate the keys" -o 1=Now 2=Later
decs add "Weekly report is ready" --body "Nothing unusual this week."

"$app" > "$work/log" 2>&1 &
pid=$!
seen=0
status=1
for _ in $(seq 1 600); do
  sleep 0.2
  lines=$(grep -c . "$work/log" || true)
  [ "$lines" -gt "$seen" ] || continue
  sed -n "$((seen + 1)),${lines}p" "$work/log" | while IFS= read -r line; do
    echo "$line"
    case "$line" in
      *"SHOT "*)
        if [ -n "$shots" ]; then
          set -- $(echo "$line" | sed 's/.*SHOT //')
          mkdir -p "$shots"
          screencapture -x -R "$2,$3,$4,$5" "$shots/$1.png" || true
        fi ;;
    esac
  done
  seen=$lines
  if grep -q "decs-app: DONE" "$work/log"; then status=0; break; fi
  if grep -q "decs-app: FAIL" "$work/log"; then sleep 2; break; fi
done
kill "$pid" 2>/dev/null || true

if [ "$status" -eq 0 ]; then
  cd "$DECS_APP_PICK"
  check() { "$DECS_BIN" get "$1" --json | CHECK="$2" node -e 'const d = JSON.parse(require("fs").readFileSync(0)); if (!eval(process.env.CHECK)) { console.error("check failed on " + process.argv[1] + ": " + process.env.CHECK + " — " + JSON.stringify({ title: d.title, status: d.status, pin: d.pin, notes: d.notes.map((n) => n.kind) })); process.exit(1) }' "$1"; }
  check 1 "d.answer.choice==='2' && /JSON columns/.test(d.answer.note) && d.answer.by==='owner'"
  check 3 "d.answer.choice==='1'"
  check 2 "d.notes.some(n=>n.role==='human' && /索引/.test(n.text))"
  check 4 "d.deferred_at"
  check 5 "d.pin === 'top'"
  check 6 "d.status === 'closed' && d.close_reason === 'merged into X5'"
  check 7 "d.status === 'completed'"
  [ -f "$DECS_HOME/config.json" ] && grep -q shop "$DECS_HOME/config.json"
  echo "e2e: all checks passed"
fi
exit "$status"
