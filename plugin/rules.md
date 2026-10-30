## decs: this project's tasks and decisions live in decisions/ (MUST FOLLOW)

The owner won't ask in chat what the status is, what you're doing, what
needs deciding, or what's next — it's all in `decs bench`. Work not
recorded in decs is invisible to the owner. Details: `decs --help`, or
load the decs skill.

- **Nodes**: a task and a decision are the same thing. `--task` for
  something you know how to do; add `-o` options when you need the owner
  to answer first. No `decisions/` yet? `decs init`.
- **Only decs writes `decisions/`**: add / note / ask / attach / start /
  done / close / retitle / move … — never an editor, `sed`, a redirect, or
  hand-moved files, edited front matter, deleted `.ids/`. Command can't do
  it? Record a node saying what's missing; don't work around it.
- **Open a node before starting**: `decs add --task "<title, ≤16 chars>"
  --author "<agent> · <what it's doing>"`, `decs start <id>`,
  `export DECS_NODE=<id>`. A lane's node goes under its lead's
  (`--parent`).
- **Plans are child nodes**: unstarted steps become child nodes
  (`--parent`), ordered with `--after`, estimated with `--est 30m`. New
  work found mid-task gets a child node, not just a chat mention.
- **Progress should move itself**: pipe long commands into `decs progress`
  (`pytest … | decs progress --parse pytest`); multi-step work uses
  `decs steps` / `decs step`. No update past 30 minutes flags as stuck.
- **Waiting on someone outside**: `decs hold <id> --on "<who/what>"`
  (status "waiting", not stuck); `decs start <id>` once it clears.
- **Need the owner to decide**: `decs ask <id> -o …` on the current node,
  or a new child node with options; the answer arrives via decs monitor
  (below).
- **Wrapping up**: `decs done <id> --note "<result>"`; not doing it after
  all → `decs close <id> --reason obsolete|superseded|merged-into:<id>`.
  `decs read` collects the owner's answer; `done` only once the question
  is actually settled.
- **Outbound content**: `decs attach <id> draft --approval-content
  --approve-on <option>` before sending; `decs approved <id> --check
  draft` must pass first. Never `--human` to approve on the owner's
  behalf.
- **External sources**: the lead registers an issue tracker, inbox, or
  feedback form with `decs source register`; sync scripts sync ids and
  titles only. New items arrive via decs monitor; `decs source ack` once
  handled.
- **Deferring**: the owner can defer a node (`d` in the bench, or
  `decs defer`) — it leaves available/active/decide without changing
  state; seeing 「owner 延迟」means stop until it's lifted.
- **Relay the owner's chat replies**: before replying, record what they
  said about a node (W305, X4, or one you recognize): `decs note <id>
  --human --by "owner (said in chat, relayed by <you>)" "<their words>"`
  (screenshots via `decs attach`), then `decs read <id>` to collect it;
  log what you did with `--agent` once handled. A node the owner replied
  to is yours to act on; `decs ask <id>` to put it back in front of them.

## Getting notified: decs monitor (MUST FOLLOW)

- **The main session / lead doesn't arm one**: the plugin starts
  `decs monitor --here` automatically each session (current project only,
  lasts the whole session, never expires). Each line is one thing to act
  on: an owner answer/reply → `decs read`; `DECS-UNCLAIMED` → an unclaimed
  answer, go claim it; a new external-source item → handle it, then
  `decs source ack`; `DECS-ERROR` → look, the monitor keeps going.
- **`DECS-IDLE`**: after 2 quiet hours the monitor stops itself. Need to
  wait on a reply again later? Arm it: `Monitor({ command: "decs
  monitor", description: "decs", timeout_ms: 1800000 })`, re-arm
  unchanged on expiry (it remembers where it left off).
- **Sub-agents and teammates handle only their own nodes, always with
  `--mine`**: arm `Monitor({ command: "decs monitor --mine", description:
  "decs", timeout_ms: 1800000 })` on start and re-arm it unchanged on
  expiry. In a teammate session the monitor the plugin starts recognises
  the teammate and only reports its own nodes. A node that isn't yours is
  the lead's — leave it.
- The lead / main session never adds `--mine` (a sub-agent's node is
  authored in its name — add it and you miss the notification).
- No `decs wait` in a background shell, no home-grown polling, no
  `decs watch` (that one's for humans).
