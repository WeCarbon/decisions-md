## decs：這個專案的任務和決策都記在 decisions/ 裡（MUST FOLLOW）

owner 不會在對話裡問「現在什麼狀態、在做什麼、有什麼要決、進度如何、接下來做什麼」——這些都在 `decs bench` 裡看。
沒記進 decs 的工作，owner 就看不到。用法細節見 `decs --help`，或載入 decs skill。

- **節點**：任務和決策是同一種東西。你自己知道怎麼做的用 `--task`，需要 owner 回答才能繼續的帶 `-o` 選項。
  專案根目錄還沒有 `decisions/` 就先 `decs init`。
- **只用 decs 指令讀寫**：`decisions/` 裡的檔案一律透過 `decs` 改（add / note / ask / attach / start / done / close / retitle / move …），
  不要用編輯器、sed 或重新導向直接改，也不要手動搬檔案、改 front matter、刪 `.ids/`。
  指令做不到的事，記一個節點說清楚缺什麼，別繞過去。
- **開工先建節點**：接到一件事，第一步 `decs add --task "<≤16 字標題>" --author "<agent> · <在做什麼>"`，
  `decs start <id>`，然後 `export DECS_NODE=<id>`。lead 派 lane 時，lane 的節點建在 lead 節點下面（`--parent`）。
- **計畫就是子節點**：拆步驟時把還沒做的寫成子節點（`--parent`），有先後的寫 `--after`，能估的寫 `--est 30m`。
  中途發現新事項，加子節點，不要只在對話裡說。
- **進度要能自己走**：長跑的指令接到 `decs progress`（`pytest … | decs progress --parse pytest`），
  多步流程用 `decs steps` / `decs step`。超過 30 分鐘不更新會被標成卡住。
- **等外部**：卡在同事、客戶、供應商或某個服務上，`decs hold <id> --on "<誰/什麼>"`（狀態「等待」，不算卡住）；等到了 `decs start <id>`。
- **要 owner 拍板**：在目前節點上 `decs ask <id> -o …`，或新建帶選項的子節點；回覆會從 decs monitor 來（見下）。
- **收尾**：做完 `decs done <id> --note "<結果>"`；不做了 `decs close <id> --reason obsolete|superseded|merged-into:<id>`。
  收走 owner 的回覆用 `decs read`，問題解決了或不需要再解決才 `done`。
- **要發出去的內容**：發之前 `decs attach <id> 草稿 --approval-content --approve-on <選項>`，發送前 `decs approved <id> --check 草稿` 必須通過。
  不要用 `--human` 替 owner 核准。
- **外部來源**：專案有 issue 追蹤、信箱、意見表單要跟的，lead 用 `decs source register` 登記，寫後端同步腳本只同步 id 和標題，
  新項目會從 decs monitor 來（見下），處理完 `decs source ack`。
- **延後**：owner 可以把節點延後（bench 裡按 d / `decs defer`）：它從可用/活動/待決裡消失，狀態不變；你收到「owner 延迟」就先停手，解除前別動它。
- **owner 在對話裡說的話要轉記**：owner 對某個節點（W305、X4 這類編號，或你知道它指哪個節點）給回覆、回應、意見，
  回覆之前先 `decs note <id> --human --by "owner（對話裡說，<你> 轉記）" "<原話>"`，截圖用 `decs attach`；
  然後 `decs read <id>` 收走，處理完用 `--agent` 記一筆做了什麼。owner 回覆過的節點就輪到你了。
  要 owner 再看時用 `decs ask <id>`。

## 接通知：decs monitor（MUST FOLLOW）

- **主 session / lead 不用自己掛**：decs plugin 在每個 session 開始時自動啟動 `decs monitor --here`（只盯目前專案，整個 session 有效，不會 30 分鐘到期）。
  每一行就是一件要處理的事：owner 的回覆/回應 → `decs read` 收走去做；`DECS-UNCLAIMED` → 有回覆沒人收，去收；
  外部來源新項目 → 處理後 `decs source ack`；`DECS-ERROR` → 看一眼，monitor 會繼續。
- **`DECS-IDLE`**：連續 2 小時沒有事件，monitor 自己下線了。之後又有要等 owner 回覆的事，自己掛：
  `Monitor({ command: "decs monitor", description: "decs", timeout_ms: 1800000 })`，到期原樣重掛（它自己記得看到哪）。
- **子 agent / teammate 只管自己的節點，必須用 `--mine`**：自己掛 monitor 時一律 `decs monitor --mine`；
  teammate 工作階段裡 plugin 自動啟動的 monitor 會認出自己是 teammate、自動只推自己提的節點。
  收到不是自己的節點，不處理，那是 lead 的事。plugin 的 monitor 不一定在行程內的子 agent 裡跑，開工就自己掛，到期原樣重掛。
- lead / 主 session 一律不加 `--mine`（替子 agent 提的節點署的是子 agent 的名字，加了就收不到）。
- 不要用背景 shell 跑 `decs wait`、不要自己寫輪詢腳本、不要用 `decs watch`（那是給人看的）。
