## decs：这个项目的任务和决策都记在 decisions/ 里（MUST FOLLOW）

owner 不会在对话里问「现在什么状态、在做什么、有什么要决、进度如何、接下来做什么」——这些都在 `decs bench` 里看。
没记进 decs 的工作，owner 就看不到。用法细节见 `decs --help`，或加载 decs skill。

- **节点**：任务和决策是同一种东西。你自己知道怎么做的用 `--task`，需要 owner 回答才能继续的带 `-o` 选项。
  项目根还没有 `decisions/` 就先 `decs init`。
- **只用 decs 命令读写**：`decisions/` 里的文件一律通过 `decs` 改（add / note / ask / attach / start / done / close / retitle / move …），
  不要用编辑器、sed 或重定向直接改，也不要手动挪文件、改 front matter、删 `.ids/`。
  命令做不到的事，记一个节点说清楚缺什么，别绕过去。
- **开工先建节点**：接到一件事，第一步 `decs add --task "<≤16 字标题>" --author "<agent> · <在做什么>"`，
  `decs start <id>`，然后 `export DECS_NODE=<id>`。lead 派 lane 时，lane 的节点建在 lead 节点下面（`--parent`）。
- **计划就是子节点**：拆步骤时把还没做的写成子节点（`--parent`），有先后的写 `--after`，能估的写 `--est 30m`。
  中途发现新事项，加子节点，不要只在对话里说。
- **进度要能自己走**：长跑的命令接到 `decs progress`（`pytest … | decs progress --parse pytest`），
  多步流程用 `decs steps` / `decs step`。超过 30 分钟不更新会被标成卡住。
- **等外部**：卡在同事、客户、供应商或某个服务上，`decs hold <id> --on "<谁/什么>"`（状态「等待」，不算卡住）；等到了 `decs start <id>`。
- **要 owner 拍板**：在当前节点上 `decs ask <id> -o …`，或新建带选项的子节点；答复会从 decs monitor 来（见下）。
- **收尾**：做完 `decs done <id> --note "<结果>"`；不做了 `decs close <id> --reason obsolete|superseded|merged-into:<id>`。
  取走 owner 的答复用 `decs read`，问题解决了或不需要再解决才 `done`。
- **要发出去的内容**：发之前 `decs attach <id> 草稿 --approval-content --approve-on <选项>`，发送前 `decs approved <id> --check 草稿` 必须通过。
  不要用 `--human` 替 owner 批准。
- **外部来源**：项目有 issue 跟踪、邮箱、反馈表单要跟的，lead 用 `decs source register` 登记，写后台同步脚本只同步 id 和标题，
  新条目会从 decs monitor 来（见下），处理完 `decs source ack`。
- **延迟**：owner 可以把节点延迟（bench 里按 d / `decs defer`）：它从可用/活动/待决里消失，状态不变；你收到「owner 延迟」就先停手，解除前别动它。
- **owner 在对话里说的话要转记**：owner 对某个节点（W305、X4 这类编号，或你知道它指哪个节点）给答复、回复、反馈，
  回复之前先 `decs note <id> --human --by "owner（对话里说，<你> 转记）" "<原话>"`，截图用 `decs attach`；
  然后 `decs read <id>` 取走，处理完用 `--agent` 记一条做了什么。owner 回复过的节点就轮到你了。
  要 owner 再看时用 `decs ask <id>`。

## 接通知：decs monitor（MUST FOLLOW）

- **主 session / lead 不用自己挂**：decs plugin 在每个 session 开始时自动启动 `decs monitor --here`（只盯当前项目，整个 session 有效，不会 30 分钟到期）。
  每一行就是一件要处理的事：owner 的答复/回复 → `decs read` 取走去做；`DECS-UNCLAIMED` → 有答复没人取，去取；
  外部来源新条目 → 处理后 `decs source ack`；`DECS-ERROR` → 看一眼，monitor 会继续。
- **`DECS-IDLE`**：连续 2 小时没有事件，monitor 自己下线了。之后又有要等 owner 回复的事，自己挂：
  `Monitor({ command: "decs monitor", description: "decs", timeout_ms: 1800000 })`，到期原样重挂（它自己记得看到哪）。
- **子 agent / teammate 只管自己的节点，必须用 `--mine`**：自己挂 monitor 时一律 `decs monitor --mine`；
  teammate 会话里 plugin 自动启动的 monitor 会认出自己是 teammate、自动只推自己提的节点。
  收到不是自己的节点，不处理，那是 lead 的事。plugin 的 monitor 不一定在进程内的子 agent 里跑，开工就自己挂，到期原样重挂。
- lead / 主 session 一律不加 `--mine`（替子 agent 提的节点署的是子 agent 的名字，加了就收不到）。
- 不要用后台 shell 跑 `decs wait`、不要自己写轮询脚本、不要用 `decs watch`（那是给人看的）。
