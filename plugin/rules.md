## nod: this project's tasks and decisions live in decisions/ (MUST FOLLOW)

(`decs` still works as an alias for every command below.)

The owner won't ask in chat what the status is, what you're doing, what
needs deciding, or what's next — it's all in `nod bench`. Work not
recorded in nod is invisible to the owner. Details: `nod --help`, or
load the decs skill.

- **Nodes**: a task and a decision are the same thing. `--task` for
  something you know how to do; add `-o` options when you need the owner
  to answer first. No `decisions/` yet? `nod init`.
- **Only nod writes `decisions/`**: add / note / ask / attach / start /
  done / close / retitle / move … — never an editor, `sed`, a redirect, or
  hand-moved files, edited front matter, deleted `.ids/`. Command can't do
  it? Record a node saying what's missing; don't work around it.
- **Open a node before starting**: `nod add --task "<title, ≤16 chars>"
  --author "<agent> · <what it's doing>"`, `nod start <id>`,
  `export DECS_NODE=<id>`. A lane's node goes under its lead's
  (`--parent`).
- **Plans are child nodes**: unstarted steps become child nodes
  (`--parent`), ordered with `--after`, estimated with `--est 30m`. New
  work found mid-task gets a child node, not just a chat mention.
- **Progress should move itself**: pipe long commands into `nod progress`
  (`pytest … | nod progress --parse pytest`); multi-step work uses
  `nod steps` / `nod step`. No update past 30 minutes flags as stuck.
- **Waiting on someone outside**: `nod hold <id> --on "<who/what>"`
  (status "waiting", not stuck); `nod start <id>` once it clears.
- **Need the owner to decide**: `nod ask <id> -o …` on the current node,
  or a new child node with options; the answer arrives via nod monitor
  (below).
- **Whoever finishes a node closes it — don't wait for anyone**: once the work
  is merged and the checks (tests, gate) pass, run `nod done <id> --note
  "<result, commit>"` right away. A reviewer who finds a problem reopens it
  with `nod start <id>` — reviewing is not closing. When delegating, never
  tell a sub-agent "don't mark it done, wait for me". Before merging, the lead
  runs `nod tree <parent>` and checks every child node, including ones
  sub-agents created.
- **Wrapping up**: `nod done <id> --note "<result>"`; not doing it after
  all → `nod close <id> --reason obsolete|superseded|merged-into:<id>`.
  `nod read` collects the owner's answer; `done` only once the question
  is actually settled.
- **Outbound content**: `nod attach <id> draft --approval-content
  --approve-on <option>` before sending; `nod approved <id> --check
  draft` must pass first. Never `--human` to approve on the owner's
  behalf.
- **External sources**: the lead registers an issue tracker, inbox, or
  feedback form with `nod source register`; sync scripts sync ids and
  titles only. New items arrive via nod monitor; `nod source ack` once
  handled.
- **Deferring**: the owner can defer a node (`d` in the bench, or
  `nod defer`) — it leaves available/active/decide without changing
  state; seeing 「owner 延迟」means stop until it's lifted.
- **Relay the owner's chat replies**: before replying, record what they
  said about a node (W305, X4, or one you recognize): `nod note <id>
  --human --by "owner (said in chat, relayed by <you>)" "<their words>"`
  (screenshots via `nod attach`), then `nod read <id>` to collect it;
  log what you did with `--agent` once handled. A node the owner replied
  to is yours to act on; `nod ask <id>` to put it back in front of them.

## Getting notified: nod monitor (MUST FOLLOW)

- **The main session / lead doesn't arm one**: the plugin starts
  `nod monitor --here` automatically each session (current project only,
  lasts the whole session, never expires). Each line is one thing to act
  on: an owner answer/reply → `nod read`; `DECS-UNCLAIMED` → an unclaimed
  answer, go claim it; a new external-source item → handle it, then
  `nod source ack`; `DECS-ERROR` → look, the monitor keeps going.
- **`DECS-IDLE`**: after 2 quiet hours the monitor stops itself. Need to
  wait on a reply again later? Arm it: `Monitor({ command: "nod
  monitor", description: "nod", timeout_ms: 1800000 })`, re-arm
  unchanged on expiry (it remembers where it left off).
- **Sub-agents and teammates handle only their own nodes, always with
  `--mine`**: arm `Monitor({ command: "nod monitor --mine", description:
  "nod", timeout_ms: 1800000 })` on start and re-arm it unchanged on
  expiry. In a teammate session the monitor the plugin starts recognises
  the teammate and only reports its own nodes. A node that isn't yours is
  the lead's — leave it.
- The lead / main session never adds `--mine` (a sub-agent's node is
  authored in its name — add it and you miss the notification).
- No `nod wait` in a background shell, no home-grown polling, no
  `nod watch` (that one's for humans).
