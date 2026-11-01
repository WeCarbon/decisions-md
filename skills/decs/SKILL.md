---
name: decs
description: nod 的完整用法（`decs` 仍是别名）——建节点/子节点、依赖与时序、nod progress/steps 汇报进度、nod ask 请 owner 拍板、子问题、发出去之前的内容批准（--approval-content/--approve-on/approved --check）、外部来源（nod source）、附件、迁移。要写 nod 节点、要 owner 决定或验收、要汇报进度、要接外部通知时加载。
---

规则（每个 session 开头已经注入）是底线；这里是完整用法。`decs` 仍然可以用，是 `nod` 的别名。先读：

- `${CLAUDE_PLUGIN_ROOT}/AGENTS.md` —— 给 agent 的全部规矩和示例
- `${CLAUDE_PLUGIN_ROOT}/adapters/README.md` —— 外部来源的同步脚本怎么写
- 任何子命令都可以 `nod <命令> --help`

**只用 nod 命令写。** `decisions/` 下的任何文件——节点、附件、`.ids/`、`queue.json`——都不要用编辑器、sed
或重定向直接改，也不要手动移动、重命名、删除。编号分配、文件锁、队列、状态迁移、附件历史全靠命令维持，手改会悄悄
弄坏它们（另一个 lane 的写入丢失、答复不唤醒、bench 显示错状态）。要改什么就找对应的命令：

| 想做的事 | 命令 |
|---|---|
| 新建节点 / 子节点 | `nod add "<标题>" [--task] [--parent <id>] [--after <id>]` |
| 补一条记录 / 转记 owner 的话 | `nod note <id> --agent "…"` / `nod note <id> --human --by "owner（对话里说，<你> 转记）" "…"` |
| 开始 / 做完 / 不做了 | `nod start` / `nod done --note` / `nod close --reason` |
| 要 owner 拍板 / 再看一眼 | `nod ask <id> -o 1="…" 2="…"` / `nod ask <id>` |
| 等外部（同事、客户、供应商、服务恢复） | `nod hold <id> --on "<谁/什么>"`，恢复用 `nod start` |
| owner 延迟了 / 解除 | owner 可以把节点延迟（bench 里按 d / `nod defer`）：它从可用/活动/待决里消失，状态不变；你收到「owner 延迟」就先停手，解除前别动它（`nod undefer` 解除，`nod show deferred` 列出） |
| 进度 | `nod progress <pct> "…"` / `nod steps` / `nod step` |
| 等 owner 答复、等外部来源 | 主 session：plugin 自动启动的 decs monitor；DECS-IDLE 之后或子 agent：用 Monitor 挂 `nod monitor`（子 agent 加 --mine） |
| 附件 / 改标题 / 挪位置 | `nod attach` / `nod retitle` / `nod move` |

命令做不到的，记一个节点说清楚缺什么（或者到 noddit 仓库提 issue）——不要绕过去手改。

## 接通知：nod monitor（MUST FOLLOW）

- **主 session / lead 不用自己挂**：decs plugin 在每个 session 开始时自动启动 `nod monitor --here`（只盯当前项目，整个 session 有效，不会 30 分钟到期）。
  每一行就是一件要处理的事：owner 的答复/回复 → `nod read` 取走去做；`DECS-UNCLAIMED` → 有答复没人取，去取；
  外部来源新条目 → 处理后 `nod source ack`；`DECS-ERROR` → 看一眼，monitor 会继续。
- **`DECS-IDLE`**：连续 2 小时没有事件，monitor 自己下线了。之后又有要等 owner 回复的事，自己挂：
  `Monitor({ command: "nod monitor", description: "nod", timeout_ms: 1800000 })`，到期原样重挂（它自己记得看到哪）。
- **子 agent / teammate 只管自己的节点，必须用 `--mine`**：自己挂 monitor 时一律 `nod monitor --mine`；
  teammate 会话里 plugin 自动启动的 monitor 会认出自己是 teammate、自动只推自己提的节点。
  收到不是自己的节点，不处理，那是 lead 的事。plugin 的 monitor 不一定在进程内的子 agent 里跑，开工就自己挂，到期原样重挂。
- lead / 主 session 一律不加 `--mine`（替子 agent 提的节点署的是子 agent 的名字，加了就收不到）。
- 不要用后台 shell 跑 `nod wait`、不要自己写轮询脚本、不要用 `nod watch`（那是给人看的）。

几个最容易错的：

- **做完自己标完成，不要等别人**：活合进去、检查（测试/gate）通过，当场 `nod done <id> --note "<结果、提交>"`。
  核对的人发现不对，用 `nod start <id>` 重新打开——核对不等于收尾。派子 agent 时**不要**写「做完别标完成、等我核对」；
  lead 合并前用 `nod tree <上层节点>` 把每个子节点的状态对一遍，子 agent 自己建的子节点也要关掉。
- 标题 ≤ 32 列（约 16 个汉字），只写「要决什么 / 要做什么」，细节放正文。
- 正文用 heredoc 喂给 `nod add`；正文里写了 `## 选项` 就要和 `-o` 一致。
- owner 在对话里的话，回复前先 `nod note <id> --human --by "owner（对话里说，<你> 转记）"`。
- 只有 owner 本人的答复算批准要发出去的内容；不要用 `--human` 替 owner 批准。
- 不要在后台跑 `nod watch`，它不退出，是给人看的。
