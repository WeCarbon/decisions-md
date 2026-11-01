#!/usr/bin/env bash
# Builds a disposable mock project for recording docs/demo.tape, with a
# ready-made tree so the bench opens on something worth looking at: a task
# in progress, one already done, a pending decision, and a node waiting on
# someone outside the team.
# Source this, don't run it — it exports NODDIT_HOME and a `nod` function,
# and cd's into the mock project, all of which need to land in the caller's
# shell: `source scripts/demo-setup.sh`.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="${NODDIT_DEMO_ROOT:-/tmp/nod-demo}"

rm -rf "$ROOT"
mkdir -p "$ROOT/web"

export NODDIT_HOME="$ROOT/home"
export NODDIT_LANG=en
export NODDIT_AUTHOR="demo-setup · mock data"

nod() { node "$REPO_ROOT/bin/nod.ts" "$@"; }
export -f nod

cd "$ROOT/web" || return 1
nod init >/dev/null
nod config letter W >/dev/null
nod config lang en >/dev/null

nod add "Ship v2.4" --task --author "lead · release v2.4" >/dev/null
nod start W1 >/dev/null
nod steps W1 "Merge feature branches" "Full test suite" "Pick onboarding copy" "Dark mode polish" >/dev/null
nod step W1 1 >/dev/null

nod add "Merge feature branches" --task --parent W1 --author "Alice · release" >/dev/null
nod start W2 >/dev/null
nod done W2 --note "6 branches merged, no conflicts left" >/dev/null

nod add "Run full test suite" --task --parent W1 --author "Bob · ci" >/dev/null
nod start W3 >/dev/null
nod progress --node W3 62 "e2e 248/400 passing" >/dev/null

nod add "Pick onboarding copy" --parent W1 --author "Carol · ux" \
  -o 1="Short & playful" 2="Plain & direct" 3="Keep the v2.3 text" \
  --default 1 --urgency high --if-no-answer "ship with option 1" >/dev/null <<'EOF'
**What.** The first screen new users see after sign-up. Two rewrites are ready; the current text is from v2.3.

**Why now.** The changelog and the release screenshots both quote it.

## Options

### 1 · Short & playful
"Let's get you set up — this takes a minute." Tested well with the beta group (14 of 20 preferred it), but reads casual for enterprise trials.

### 2 · Plain & direct
"Create your first project." Matches the docs tone; no translation changes.

### 3 · Keep the v2.3 text
No work. The text still mentions the old pricing page.

**Measured:** beta survey results attached; both drafts fit the 2-line layout on mobile.
EOF

nod add "Dark mode polish" --task --parent W1 --author "Carol · theming" >/dev/null
nod start W5 >/dev/null
nod hold W5 --on "Carol: final icon set" >/dev/null

clear
