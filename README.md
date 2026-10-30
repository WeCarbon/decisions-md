**English** · [Simplified Chinese](README.zh-Hans.md) · [Traditional Chinese](README.zh-Hant.md) · [French](README.fr.md) · [Arabic](README.ar.md)

# decisions-md

**`decs` is a task & decision hub for long-running AI agents.**
Every piece of work an agent does — and every question it needs *you* to answer —
is a plain markdown file in your repo. You watch it all on one live terminal
screen, the **bench**, and answer with a keystroke.

No database. No daemon. No server. Just `decisions/` in git.

![Demo: add a task, watch its progress stream in from a piped command, turn a node into a decision, then answer it with a keystroke on the bench](docs/demo.gif)

![The decs bench: a tree of running work with progress bars on the left, a pending decision with its options on the right](docs/screenshot.en.png)

---

## The problem

You hand an agent a two-hour job — or five agents, one each. Then:

- **"Should I…?"** Agents stop and ask in the chat. If you're not looking, the
  question sits there. If you answer, the answer scrolls away and the next
  session never saw it.
- **Progress vanishes.** A test run takes an hour. What's it doing? You can only
  ask — and interrupt it to find out.
- **Parallel agents collide.** Five lanes editing one `TODO.md` pick the same
  number, overwrite each other's lines, archive the wrong entry.
- **Nobody knows what's outstanding.** Is the issue tracker cleared? Did the
  support inbox get handled? Which lane is stuck, which is waiting on a person?

## The idea

One kind of thing — a **node** — and one id space.

A node is something the AI does. When the agent knows how, it just does it.
When it needs the owner first, the node becomes **needs decision**, with
options, a default, and what happens if nobody answers. A running node that
hits a question doesn't spawn a second entry; it turns into a question itself,
and goes back to running when you answer.

```
decisions/
  decs.json                                  # {"letter": "W"} → refs read W12
  active/12-ship-v2-4.md                     # a root node still in play
  active/12-ship-v2-4/13-run-test-suite.md   # its children live in its folder
  archived/9-rotate-api-keys.md              # done or closed, kept forever
  attachments/12/after.png
  .ids/12                                    # zero-byte reservation (O_EXCL)
```

Because every node is its own file and ids are reserved with `O_EXCL`, any number
of agents can write at once without colliding. Because it's markdown in git, you
get history, diffs, review and grep for free.

## What you get

**For the human — the bench.** `decs bench` is a live terminal UI over every
project you've registered. Five tabs:

| tab | shows |
|---|---|
| **Available** | what can move now: running, waiting on someone, ready to start, needs you, answered |
| **Active** | what's happening: running and needs-decision only |
| **Decide** | just the questions for you, per project, the ones blocking an agent first |
| **All** | everything, finished nodes folded into a `✓ Completed N` row |
| **Waiting** | held up outside — a colleague, a customer, a service — longest wait first |

The left pane is the node tree with progress bars and staleness (grey past 30
minutes without an update, red past an hour). The right pane is the selected
node: status, urgency, *"if you don't answer"*, parent, dependencies, body,
attachments. Press `1`–`9` to answer, `Enter` for the default. Screenshots
render inline in the terminal (iTerm2, kitty, Ghostty, WezTerm).

**For the agent — a CLI and a contract.** Agents create nodes, break them into
child nodes, report progress, ask questions, and get notified of your answers:

```sh
decs add "Ship v2.4" --task --author "lead · release"          # → W12
decs add "Run full test suite" --task --parent W12 --after W14
decs start W13
pytest | decs progress --parse pytest                           # bar moves by itself

decs ask W15 -o 1="Short & playful" 2="Plain & direct" --default 2 <<'EOF'
**What.** The first screen new users see after sign-up …
EOF
```

**Notifications without polling.** `decs monitor` prints one line per thing an
agent must act on — an owner answer, a reply, a new item from an external
source, an answer nobody has picked up for five minutes — and remembers where
each session left off. The Claude Code plugin starts it for the whole session
(`decs monitor --here`, watching the current project); it goes offline by itself
after two quiet hours with a `DECS-IDLE` line. Sub-agents, or a session after
`DECS-IDLE`, arm it with Claude Code's Monitor tool:

```
Monitor({ command: "decs monitor --mine", description: "decs", timeout_ms: 1800000 })
```

**Dependencies and order.** `--after W13` holds a node back until W13 is done.
You can still answer a question early; the node then waits as **to do** and
starts when its turn comes.

**External sources.** Point a tiny adapter at GitHub issues, a support inbox or
a feedback form. It syncs *references only* (id + title, optional url/state/from),
never bodies, never credentials. The bench header tells you, per source,
whether it's cleared and who holds what:

```
Sources github-issues ✗ unhandled 2 W7 1   support-inbox ✓ clear
```

**Approval gates for anything that leaves the building.** Attach a draft with
`--approval-content`; decs records its sha256. Before sending, the agent runs
`decs approved W20 --check draft.html` — it fails unless *you* picked the
approving option *for exactly that content*. An agent relaying "send it" from
the chat can't approve on your behalf.

**Defer.** Press `d` on anything you want out of sight. It leaves the working
views without changing state, and the agent on it is told it was deferred and stops
until you lift it.

## Quickstart

Requires Node 22.18+ (TypeScript runs directly; there is no build step).

```sh
git clone https://github.com/wecarbon/decisions-md.git
cd decisions-md && npm install
export PATH="$PWD/bin:$PATH"          # add to your shell profile

cd ~/code/your-project
decs init --letter W                  # creates decisions/, registers the project
decs add "Try decs" --task --author "me · kicking the tyres"
decs                                  # the bench (same as decs bench); q to quit
```

### With Claude Code

The repo is also a Claude Code plugin marketplace. The plugin injects the usage
rules at the start of every session (plus the project's open nodes, so a
resumed session picks its work back up), starts `decs monitor` for the session
so your answers reach the agent without it polling, and reminds the agent to
record what you say about a node in chat before replying.

```
/plugin marketplace add wecarbon/decisions-md
/plugin install decs@decisions-md
```

(`/plugin marketplace add /path/to/decisions-md` works for a local clone.)

The full agent guide is [`AGENTS.md`](AGENTS.md) — paste it into your own
`AGENTS.md` / `CLAUDE.md` if you use a different agent harness. The rules are
CLI calls, so any agent with a shell can follow them.

## Language

`decs` picks the UI language in this order:

1. `--lang <code>` on any command, e.g. `decs bench --lang fr`
2. the `DECS_LANG` environment variable
3. `decs config lang <code>` — stored per user in `~/.decs/config.json`
   (`$DECS_HOME/config.json`). `decs config lang` alone shows the current
   language and where it comes from; `decs config lang --off` removes it.
4. the system locale (`LC_ALL` / `LC_MESSAGES` / `LANG`, `C` / `POSIX`
   ignored): `zh_CN` → `zh-Hans`, `zh_TW` / `zh_HK` → `zh-Hant`, `fr_*` →
   `fr`, `ar_*` → `ar`
5. the OS display language, when none of those locale variables are set —
   plain Windows terminals (cmd, PowerShell) have none, so decs reads it the
   way Node's `Intl` reports it
6. otherwise, English — also where a locale decs has no translation for
   ends up

Codes: `en`, `zh-Hans`, `zh-Hant`, `fr`, `ar`. The plugin's
session-start rules and prompt reminder follow the same resolution
(`plugin/rules.<code>.md`).

Arabic is laid out right to left. `DECS_BIDI=visual|terminal` (or
`decs config bidi visual|terminal`, `--off` to remove) picks how: `visual`
(the default) has decs reorder each line itself with the Unicode
Bidirectional Algorithm, for terminals that draw strictly left to right
(e.g. macOS Terminal); `terminal` has decs write logical order and wrap
embedded left-to-right runs (refs like W12, numbers, commands, English
titles) in Unicode isolates, for terminals that apply bidi themselves
(iTerm2 with bidi enabled, kitty, VTE-based terminals). In Arabic the bench
also mirrors: the list sits on the right, details on the left. Output to
pipes and `--json` always stays in logical order, so scripts and agents
read it unchanged. Relative times ("3 days ago") follow the language too.

The on-disk file format never changes with the language: `decs` always
writes one fixed set of section headings, so a repo stays readable by every
teammate whatever language their CLI speaks. When you write a file by hand,
`## Options`, `## Attachments` and `## Questions` are accepted. See [The file format](#the-file-format) below.

## How a session goes

1. You give the lead agent a goal. It runs `decs add "Ship v2.4" --task`, starts
   it, and splits it into child nodes with `--after` dependencies.
2. It hands lanes (sub-agents) their own nodes. Each lane pipes its long
   commands into `decs progress`; the bench bars move on their own.
3. A lane hits a fork in the road. It runs `decs ask <id> -o …` with options,
   costs and a default. The node turns yellow `◆` in your bench.
4. You press `2`. `decs monitor` wakes the lane; it runs `decs read`, carries on,
   and finally `decs done <id> --note "412/412 passing"`.
5. You never had to ask "where are we?" — and next week, the whole story is
   still in `decisions/archived/`.

## CLI cheat sheet

| | |
|---|---|
| `decs init [--letter W]` | create `decisions/` here and register the project |
| `decs add <title> [--task] [-o 1=… 2=…]` | new node; with options it needs a decision. Body from stdin |
| `decs add <title> --parent W12 --after W13` | child node, ordered after another |
| `decs start / done / close <id>` | To do → In progress → Done / Closed (`--reason obsolete\|superseded\|merged-into:W15`) |
| `decs ask <id> -o 1=… 2=…` | a running node needs the owner |
| `decs hold <id> --on "Carol: icon set"` | waiting on someone outside; not counted as stuck |
| `decs progress <pct> "msg"` · `… \| decs progress --parse pytest` | report progress (or let a pipe report it) |
| `decs steps <id> "a" "b" "c"` · `decs step <id> 2` | multi-step work, percent computed for you |
| `decs note <id> "…"` | append a record (agent by default; `--human` for the owner) |
| `decs push <id> 2 [--note …]` | record an answer |
| `decs monitor [--mine] [--here] [--idle-exit 2h]` | the agent's notification stream |
| `decs read <id>` · `decs queue` | collect answers / see what's uncollected |
| `decs attach <id> file [--approval-content --approve-on 1]` | attach a file; gate it on approval |
| `decs approved <id> --check <file>` | exit 0 only if exactly this content was approved |
| `decs defer <id>` · `decs undefer <id>` | put off / bring back |
| `decs show [open\|active\|deferred\|…] [--stale]` · `decs tree` · `decs get <id>` | read the store |
| `decs search <words> [--all]` | titles, bodies, notes, attachment names |
| `decs source register/sync/push/list/items/ack` | external sources |
| `decs changes --since <t>` | everything after a cursor, for catching up |
| `decs bench [.\|<dir>…] [--view decide]` | the live screen |
| `decs` | on a terminal, the same as `decs bench`; piped or in a script, prints the usage |
| `decs config [<setting> [<value>\|--off]]` | your settings: lang, bidi, view, images, mouse, idle-exit, unclaimed-after (also in the bench: `,`) |

Ids are `305`, `W305` (project letter), `web:305` (project name), or legacy
`D305`. `decs <command> --help` has the rest.

## Bench keys

| key | |
|---|---|
| `↑` `↓` | move |
| `←` `→` · `-` `+` | fold / unfold (remembered across sessions) |
| `Tab` `Shift-Tab` | switch view |
| `1`–`9` · `Enter` | answer · take the default |
| `w` | jump to the next node an agent is stuck on |
| `g` or `:` | go to an id |
| `N` | reply without deciding (the node goes back to the agent) |
| `d` | defer / undefer |
| `X` · `A` | close with a reason · mark looked-at and archive |
| `T` `B` `U` | pin top / bottom / unpin |
| `i` · `o` | pick and view images · open an attachment |
| `j` `k` `Ctrl-F` `Ctrl-B` | scroll the detail pane |
| `Z` · `?` · `q` | condensed body · all keys · quit |
| `,` | settings (language, right-to-left text, mouse, …) |

The mouse works too: click a tab, a node, an option or an attachment; the wheel
scrolls the pane it's over.

## The file format

A node is markdown with YAML front matter. Humans can read it in any editor;
agents and the bench go through the CLI, which handles locking and history.

```markdown
---
id: 1
title: Choose a CDN
author: lane-perf · static assets
status: needs_decision
created: 2026-03-14T10:12:03+00:00
urgency: high
default: "1"
if_no_answer: stay; re-measure Friday
reversible: true
---

**What.** Static assets are served from one region.

**Why now.** APAC p95 doubled last week.

## Options

### 1 · Stay on current CDN

### 2 · Move to edge provider
```

Section headings are fixed tokens, not translated: see [Language](#language)
above for why, and how each person picks their own. Replies and notes are
appended as their own sections, each recording who wrote it and when.

Statuses: `not_started` To do · `in_progress` In progress · `waiting`
Waiting · `needs_decision` Needs decision · `decided` Answered, for AI ·
`completed` Done · `closed` Closed. Children live in a folder named like
their parent's file; ids stay flat, so moving a node is a rename and every
reference still holds.

## Design principles

- **Files, not a service.** Everything is in `decisions/`, versioned with your
  code, readable without decs installed.
- **The filesystem is the lock.** Ids come from `O_EXCL` files; each write
  re-reads the node under its own lock and lands via write-then-rename. Two dozen
  concurrent writers get consecutive ids and lose nothing — there's a test for it.
- **One kind of thing.** Tasks and decisions are the same node. Fewer concepts,
  one id space, one tree.
- **The human never has to ask.** Status, progress, staleness, what's waiting on
  whom — it's all on the bench, not in a chat thread.
- **Roles are explicit.** Every appended section says whether a human or an agent
  wrote it, who, and when. Only human answers approve outbound content.
- **References, not content, from outside.** External sources sync ids and
  titles; bodies and credentials stay where they live.

## FAQ

**Is this only for Claude Code?**
No. The CLI is agent-agnostic — anything with a shell can call it. The Claude
Code plugin adds session-start rules and uses `CLAUDECODE` /
`CLAUDE_SESSION_ID` to tell agent shells from yours and tag who wrote what.
Elsewhere, set `DECS_ROLE=agent` and `DECS_SESSION`.

**Does it work with git worktrees?**
Yes. `decs` always resolves to the main checkout's `decisions/`, so lanes in
worktrees share one store.

**Several repos at once?**
`decs init` registers each project; `decs bench` with no arguments opens all of
them, grouped by project letter.

**What if nobody answers?**
Every question carries a default and an `--if-no-answer`. `decs wait --timeout`
exits with code 2 and prints the default — the moment to proceed with it.

**Can I edit the files by hand?**
You can read them freely. For writes, use the CLI: it keeps ids, locks, the
answer queue and attachment history consistent.

**I have an old `DECISIONS.md`.**
`decs migrate --dir <project> --dry-run`, then without `--dry-run`.

## Development

```sh
npm test            # node --test
npm run typecheck   # tsc --noEmit
node scripts/render-screenshot.ts --out docs/screenshot.en   # regenerate docs/screenshot.<lng>.svg/.png (mock data)
```

## License

[MIT](LICENSE) © 2026 WeCarbon
