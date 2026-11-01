#!/usr/bin/env python3
"""Reference adapter for `nod source` — a template, not a working integration.

Polls (or listens to) an external system and syncs *references* — id +
title, optionally a url/state/from — into `decisions/sources/<name>/`.
Never the full content, and never credentials: those stay in the project
that owns the adapter.

`fetch_items()` below returns a fixed list so the loop is runnable and
testable on its own. Copy this file into your project, replace
`fetch_items()` with a real one, and start it in the background (see
adapters/README.md).

Usage:
    python3 example_sync.py --name github-issues --interval 60

First run (once, or let this script do it — see `ensure_registered` below):
    nod source register github-issues --title "GitHub issues triage" \\
        --kind github --adapter "python3 adapters/example_sync.py --name github-issues" \\
        --stale-after 15m
"""

import argparse
import json
import subprocess
import sys
import time

# Replace this with a real fetcher, returning only id/title/url/state/from —
# never a body, comment, or anything else that could leak private content
# into a file other agents and the owner read.
#
#   Issues:   gh issue list --json number,title,url,state (or your tracker's
#             equivalent) — keep credentials out of this file
#   Mail:     your provider's list-messages call, filtered to unread/a label
#   Feedback: your form's "list new submissions" call; never the full
#             free-text submission, just a one-line summary
def fetch_items() -> list[dict]:
    """The complete current snapshot, not just new items — `nod source
    sync` diffs this against what nod already knows."""
    return [
        {"id": "12345", "title": "示例 issue 1", "url": "https://example.com/issues/12345", "state": "active"},
        {"id": "12346", "title": "示例 issue 2", "state": "new", "from": "someone@example.com"},
    ]


def ensure_registered(name: str, title: str, adapter_cmd: str, stale_after: str) -> None:
    """Idempotent and partial — safe to call on every start."""
    subprocess.run(
        [
            "nod", "source", "register", name,
            "--title", title,
            "--adapter", adapter_cmd,
            "--stale-after", stale_after,
        ],
        check=True,
    )


def sync_once(name: str) -> None:
    items = fetch_items()
    payload = "\n".join(json.dumps(item, ensure_ascii=False) for item in items) + "\n"
    result = subprocess.run(
        ["nod", "source", "sync", name],
        input=payload,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        # Loud and non-fatal: one bad poll shouldn't kill the loop or hide the error.
        print(f"[{name}] sync failed: {result.stderr.strip()}", file=sys.stderr)
        return
    print(f"[{name}] {result.stdout.strip()}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--name", required=True, help="the nod source name, e.g. github-issues")
    p.add_argument("--title", default=None, help="human title; defaults to --name")
    p.add_argument("--interval", type=int, default=60, help="seconds between polls")
    p.add_argument("--stale-after", default="15m")
    args = p.parse_args()

    adapter_cmd = " ".join(sys.argv)
    ensure_registered(args.name, args.title or args.name, adapter_cmd, args.stale_after)

    print(f"[{args.name}] polling every {args.interval}s — Ctrl-C to stop", file=sys.stderr)
    while True:
        sync_once(args.name)
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
