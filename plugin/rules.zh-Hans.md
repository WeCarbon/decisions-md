## nod：这个项目的任务和决策都记在 decisions/ 里（MUST FOLLOW）

（`decs` 仍然可以用，是下面每条命令的别名。）

负责人不会在对话里问「现在什么状态、在做什么、有什么要决、进度如何、接下来做什么」——这些都在 `nod bench` 里看。
没记进 nod 的工作，负责人就看不到。用法细节见 `nod --help`，或加载 decs skill。

- **节点**：任务和决策是同一种东西。你自己知道怎么做的用 `--task`，需要负责人回答才能继续的带 `-o` 选项。
  项目根还没有 `decisions/` 就先 `nod init`。
- **只用 nod 命令读写**：`decisions/` 里的文件一律通过 `nod` 改（add / note / ask / attach / start / done / close / retitle / move …），
  不要用编辑器、sed 或重定向直接改，也不要手动挪文件、改文件头、删 `.ids/`。
  命令做不到的事，记一个节点说清楚缺什么，别绕过去。
- **开工先建节点**：接到一件事，第一步 `nod add --task "<≤16 字标题>" --author "<智能体> · <在做什么>"`，
  `nod start <id>`，然后 `export DECS_NODE=<id>`。主控会话派工作线时，工作线的节点建在主控会话节点下面（`--parent`）。
- **计划就是子节点**：拆步骤时把还没做的写成子节点（`--parent`），有先后的写 `--after`，能估的写 `--est 30m`。
  中途发现新事项，加子节点，不要只在对话里说。
- **进度要能自己走**：长跑的命令接到 `nod progress`（`pytest … | nod progress --parse pytest`），
  多步流程用 `nod steps` / `nod step`。超过 30 分钟不更新会被标成卡住。
- **等外部**：卡在同事、客户、供应商或某个服务上，`nod hold <id> --on "<谁/什么>"`（状态「等待」，不算卡住）；等到了 `nod start <id>`。
- **要负责人拍板**：在当前节点上 `nod ask <id> -o …`，或新建带选项的子节点；答复会从 nod monitor 来（见下）。
- **做完自己标完成，不要等别人**：活合进去、检查（测试、关卡）通过，当场 `nod done <id> --note "<结果、提交>"`。
  核对的人发现不对，用 `nod start <id>` 重新打开——核对不等于收尾。派子智能体时**不要**写「做完别标完成、等我核对」；
  主控会话合并前用 `nod tree <上层节点>` 把每个子节点的状态对一遍，子智能体自己建的子节点也要关掉。
- **收尾**：做完 `nod done <id> --note "<结果>"`；不做了 `nod close <id> --reason obsolete|superseded|merged-into:<id>`。
  取走负责人的答复用 `nod read`，问题解决了或不需要再解决才 `done`。
- **要发出去的内容**：发之前 `nod attach <id> 草稿 --approval-content --approve-on <选项>`，发送前 `nod approved <id> --check 草稿` 必须通过。
  不要用 `--human` 替负责人批准。
- **外部来源**：项目有 issue 跟踪、邮箱、反馈表单要跟的，主控会话用 `nod source register` 登记，写后台同步脚本只同步 id 和标题，
  新条目会从 nod monitor 来（见下），处理完 `nod source ack`。
- **延迟**：负责人可以把节点延迟（看板里按 d / `nod defer`）：它从可用/活动/待决里消失，状态不变；你收到「负责人延迟」就先停手，解除前别动它。
- **负责人在对话里说的话要转记**：负责人对某个节点（W305、X4 这类编号，或你知道它指哪个节点）给答复、回复、反馈，
  回复之前先 `nod note <id> --human --by "负责人（对话里说，<你> 转记）" "<原话>"`，截图用 `nod attach`；
  然后 `nod read <id>` 取走，处理完用 `--agent` 记一条做了什么。负责人回复过的节点就轮到你了。
  要负责人再看时用 `nod ask <id>`。

## 接通知：nod monitor（MUST FOLLOW）

- **主控会话不用自己挂**：decs plugin 在每个会话开始时自动启动 `nod monitor --here`（只盯当前项目，整个会话有效，不会 30 分钟到期）。
  每一行就是一件要处理的事：负责人的答复/回复 → `nod read` 取走去做；`DECS-UNCLAIMED` → 有答复没人取，去取；
  外部来源新条目 → 处理后 `nod source ack`；`DECS-ERROR` → 看一眼，监听会继续。
- **`DECS-IDLE`**：连续 2 小时没有事件，监听自己下线了。之后又有要等负责人回复的事，自己挂：
  `Monitor({ command: "nod monitor", description: "nod", timeout_ms: 1800000 })`，到期原样重挂（它自己记得看到哪）。
- **子智能体 / 队友只管自己的节点，必须用 `--mine`**：自己挂监听时一律 `nod monitor --mine`；
  队友会话里 plugin 自动启动的监听会认出自己是队友、自动只推自己提的节点。
  收到不是自己的节点，不处理，那是主控会话的事。plugin 的监听不一定在进程内的子智能体里跑，开工就自己挂，到期原样重挂。
- 主控会话一律不加 `--mine`（替子智能体提的节点署的是子智能体的名字，加了就收不到）。
- 不要用后台终端跑 `nod wait`、不要自己写轮询脚本、不要用 `nod watch`（那是给人看的）。
