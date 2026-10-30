#!/usr/bin/env bash
# Builds a disposable mock project for recording docs/demo.tape.
# Source this, don't run it — it exports DECS_HOME and a `decs` function,
# and cd's into the mock project, all of which need to land in the caller's
# shell: `source scripts/demo-setup.sh`.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="${DECS_DEMO_ROOT:-/tmp/decs-demo}"

rm -rf "$ROOT"
mkdir -p "$ROOT/web"

export DECS_HOME="$ROOT/home"
export DECS_LANG=en

decs() { node "$REPO_ROOT/bin/decs.ts" "$@"; }
export -f decs

cd "$ROOT/web" || return 1
decs init >/dev/null
decs config letter W >/dev/null
decs config lang en >/dev/null
cp "$REPO_ROOT/scripts/demo-build.sh" ./build.sh
chmod +x ./build.sh
clear
