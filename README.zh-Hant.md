[English](README.md) · [简体中文](README.zh-Hans.md) · **繁體中文** · [Français](README.fr.md) · [العربية](README.ar.md)

# decisions-md

**`decs` 是給長時間運行的 AI agent 用的任務與決策中樞。**
agent 做的每一件事——以及每一個需要*你*回答的問題——都是專案裡的一個純文字
markdown 檔案。你在一個常駐的終端畫面上看到全部，這就是 **bench**，按一個鍵
就能回覆。

沒有資料庫、沒有常駐程式、沒有伺服器，只有 git 裡的 `decisions/`。

![decs 的 bench：左邊是一棵帶進度條的任務樹，右邊是一個待決策節點和它的選項](docs/screenshot.zh-Hant.png)

<sub>範例資料，用真實的 bench 程式碼透過 `node scripts/render-screenshot.ts` 渲染而成。</sub>

---

## 問題

你把一件兩小時的工作交給一個 agent——或者五個 agent，各做一塊。接下來會發生：

- **「要不要……？」** agent 在對話裡停下來問。你沒在看，問題就一直晾著；你答了，
  答案捲走了，下一個 session 根本沒看到。
- **進度看不見。** 一個測試要跑一小時，它在做什麼？你只能去問——打斷它才知道。
- **並行的 agent 互相打架。** 五條 lane 同時改一個 `TODO.md`，挑中同一個編號，
  蓋掉彼此的行，歸檔錯了項目。
- **沒人知道還剩什麼。** issue 追蹤器清空了嗎？客服信箱處理了嗎？哪條 lane 卡住了，
  哪條在等人？

## 想法

一種東西——**節點**——一個編號空間。

節點是 AI 要做的一件事。agent 自己知道怎麼做，就直接做。需要先問 owner 的，
節點就變成**待決策**，帶著選項、預設值，以及沒人回答會怎樣。一個正在執行的
節點碰到問題，不會另開一筆新記錄，它自己就變成一個問題，回答之後再變回執行中。

```
decisions/
  decs.json                                  # {"letter": "W"} → refs 讀作 W12
  active/12-ship-v2-4.md                     # 一個還在進行的根節點
  active/12-ship-v2-4/13-run-test-suite.md   # 子節點住在父節點的資料夾裡
  archived/9-rotate-api-keys.md              # 完成或關閉的，永久保留
  attachments/12/after.png
  .ids/12                                    # 零位元組的占位檔（O_EXCL）
```

每個節點都是獨立檔案，編號用 `O_EXCL` 占位，所以任意數量的 agent 都能同時寫，
不會互相覆蓋。因為全是 git 裡的 markdown，歷史、diff、review、grep 全部不用
額外花力氣。

## 你會得到什麼

**給人用的——bench。** `decs bench` 是一個涵蓋你註冊過的所有專案的即時終端
UI。五個分頁：

| 分頁 | 顯示什麼 |
|---|---|
| **可用** | 現在能動的：執行中、在等人、可以開始、需要你決定、已經回答了 |
| **活動** | 正在發生的：只有執行中和待決策的 |
| **待決** | 只看需要你決定的問題，按專案分，先列卡住 agent 的那些 |
| **全部** | 全部節點，完成的折進一行 `✓ 已完成 N` |
| **等待** | 卡在外部的：同事、客戶、某個服務，等得最久的排最前面 |

左邊是帶進度條和「多久沒動」標記的節點樹（超過 30 分鐘沒更新變灰，超過一小時
變紅）。右邊是選中節點的詳情：狀態、緊急程度、*「你不回的話會怎樣」*、父節點、
依賴、正文、附件。按 `1`–`9` 回覆，`Enter` 取預設值。截圖在終端裡直接渲染
（iTerm2、kitty、Ghostty、WezTerm）。

**給 agent 用的——一套 CLI 和一份約定。** agent 建節點、拆成子節點、回報進度、
問問題，也會收到你回覆的通知：

```sh
decs add "Ship v2.4" --task --author "lead · release"          # → W12
decs add "Run full test suite" --task --parent W12 --after W14
decs start W13
pytest | decs progress --parse pytest                           # 進度條自己走
decs ask W15 -o 1="Short & playful" 2="Plain & direct" --default 2 <<'EOF'
**What.** The first screen new users see after sign-up …
EOF
```

**不用輪詢的通知。** `decs monitor` 每行印出一件 agent 要處理的事——owner 的
回答、一則回覆、外部來源的新項目、五分鐘沒人收走的答案——而且記得每個
session 看到哪裡了。Claude Code 外掛會在整個 session 期間自動啟動一個
（`decs monitor --here`，只盯目前的專案）；連續兩小時沒事件會自己下線，印出
一行 `DECS-IDLE`。子 agent，或是 `DECS-IDLE` 之後的 session，用 Claude Code
的 Monitor 工具自己掛一個：

```
Monitor({ command: "decs monitor --mine", description: "decs", timeout_ms: 1800000 })
```

**依賴與順序。** `--after W13` 會把一個節點擋住，直到 W13 完成。你還是可以
提前回答問題；節點會以**待開始**的狀態等著，輪到它才開始。

**外部來源。** 把一個很薄的 adapter 接到 GitHub issue、客服信箱或意見表單上。
它只同步*參照*（編號 + 標題，可選 url / 狀態 / 來源），絕不同步正文，絕不同步
憑證。bench 的標題列會按來源告訴你清了沒、卡在誰手上：

```
外部來源 github-issues ✗ 未處理 2 等 W7 1   support-inbox ✓清了
```

**替任何要發出去的東西加上核准關卡。** 用 `--approval-content` 附上一份草稿，
decs 會記下它的 sha256。送出前，agent 跑 `decs approved W20 --check draft.html`
——除非*你*專門為*這份內容*選過核准選項，否則就不會通過。agent 把對話裡的
「發吧」當成你的核准是行不通的。

**延後。** 在任何東西上按 `d` 讓它從眼前消失。它會離開各個工作檢視，但狀態
不變；正在做它的 agent 會收到「owner 延迟」，解除之前先別動它。

## 快速開始

需要 Node 22.18+（TypeScript 直接執行，沒有建置步驟）。

```sh
git clone https://github.com/wecarbon/decisions-md.git
cd decisions-md && npm install
export PATH="$PWD/bin:$PATH"          # add to your shell profile

cd ~/code/your-project
decs init --letter W                  # creates decisions/, registers the project
decs add "Try decs" --task --author "me · kicking the tyres"
decs                                  # the bench (same as decs bench); q to quit
```

### 搭配 Claude Code

這個專案同時是一個 Claude Code 外掛市集。外掛會在每個 session 開頭注入使用
規則（外加專案裡還開著的節點，讓恢復的 session 能接著自己的工作做下去），
替整個 session 啟動一個 `decs monitor`，讓你的回覆不用輪詢就能傳到 agent，
還會提醒 agent 在回覆之前，先把你在對話裡說的話記到對應節點上。

```
/plugin marketplace add wecarbon/decisions-md
/plugin install decs@decisions-md
```

（`/plugin marketplace add /path/to/decisions-md` 對本機的複本也適用。）

完整的 agent 用法在 [`AGENTS.md`](AGENTS.md)——如果你用別的 agent 框架，直接
把它貼進你自己的 `AGENTS.md` / `CLAUDE.md`。這些規則都是 CLI 呼叫，任何能跑
shell 的 agent 都能照著做。

## 語言

`decs` 會說英語、簡體中文、繁體中文、Français 和 العربية。它按下面的順序選一個：

1. 任何指令上的 `--lang <code>`，比如 `decs bench --lang fr`
2. `DECS_LANG` 環境變數
3. `decs config lang <code>`——按使用者存在 `~/.decs/config.json`（也就是
   `$DECS_HOME/config.json`）。單獨跑 `decs config lang` 會顯示目前的語言和
   它從哪裡來；`decs config lang --off` 會移除這項設定。
4. 系統語言設定（`LC_ALL` / `LC_MESSAGES` / `LANG`，忽略 `C` / `POSIX`）：
   `zh_CN` → `zh-Hans`，`zh_TW` / `zh_HK` → `zh-Hant`，`fr_*` → `fr`，
   `ar_*` → `ar`
5. 這些環境變數都沒設的時候，用作業系統的顯示語言——純 Windows 終端（cmd、
   PowerShell）就沒有這些變數，decs 會依 Node 的 `Intl` 讀到的結果來決定
6. 否則就是英語——decs 沒有對應翻譯的語言，也會落到英語

可用代碼：`en`、`zh-Hans`、`zh-Hant`、`fr`、`ar`。外掛在 session
開頭注入的規則和提示提醒，遵循同一套解析邏輯（`plugin/rules.<code>.md`）。

阿拉伯語是從右往左排的。`DECS_BIDI=visual|terminal`（或
`decs config bidi visual|terminal`，`--off` 移除）決定怎麼排：`visual`
（預設）是 decs 自己用 Unicode 雙向演算法重新排每一行，給那些只會嚴格從左往右
畫面的終端用（例如 macOS 內建的 Terminal）；`terminal` 是 decs 按邏輯順序寫，
把嵌在裡面的從左到右片段（像 W12 這樣的參照、數字、指令、英文標題）包進
Unicode 隔離符，給自己處理雙向排版的終端用（開了 bidi 的 iTerm2、kitty、
基於 VTE 的終端）。阿拉伯語下 bench 本身也會鏡像：清單在右邊，詳情在左邊。
輸出到管線和 `--json` 永遠是邏輯順序，腳本和 agent 讀到的不受影響。相對時間
（「3 天前」這種）也跟著語言走。

磁碟上的檔案格式不會跟著語言變：decs 永遠寫同一批標題和詞（`## 选项`、
`### 1 · …`、`## 已答（…）`、`## 回复（…）`、`## 补充（…）`、`## 附件`、
`## 子问题`、`验收通过`……），這樣不管團隊裡每個人的 CLI 說什麼語言，專案都能
讀。手動寫檔案時，剖析器也認得 `## Options`、`## Attachments`、`## Questions`
這幾個英文寫法。見下面的[檔案格式](#檔案格式)。

## 一次工作階段是怎樣的

1. 你給 lead agent 一個目標。它跑 `decs add "Ship v2.4" --task`，啟動它，再拆成
   帶 `--after` 依賴關係的子節點。
2. 它把各條 lane（子 agent）分出去，各帶自己的節點。每條 lane 把長指令接進
   `decs progress`，bench 上的進度條自己走。
3. 一條 lane 走到分岔口。它跑 `decs ask <id> -o …`，帶著選項、代價和預設值。
   節點在你的 bench 上變成黃色的 `◆`。
4. 你按 `2`。`decs monitor` 叫醒那條 lane，它跑 `decs read`，接著做，最後
   `decs done <id> --note "412/412 passing"`。
5. 你從來不用問「現在到哪了」——下週，整個故事還在 `decisions/archived/` 裡。

## CLI 速查表

| | |
|---|---|
| `decs init [--letter W]` | 在這裡建 `decisions/` 並註冊專案 |
| `decs add <title> [--task] [-o 1=… 2=…]` | 新建節點；帶選項就是待決策。正文來自 stdin |
| `decs add <title> --parent W12 --after W13` | 子節點，排在另一個之後 |
| `decs start / done / close <id>` | 待開始 → 執行中 → 已完成 / 已關閉（`--reason obsolete\|superseded\|merged-into:W15`） |
| `decs ask <id> -o 1=… 2=…` | 執行中的節點需要 owner 拍板 |
| `decs hold <id> --on "Carol: icon set"` | 卡在外部某人身上；不算卡住 |
| `decs progress <pct> "msg"` · `… \| decs progress --parse pytest` | 回報進度（或者讓管線自己回報） |
| `decs steps <id> "a" "b" "c"` · `decs step <id> 2` | 多步驟的工作，百分比幫你算好 |
| `decs note <id> "…"` | 追加一筆記錄（預設是 agent；`--human` 給 owner 用） |
| `decs push <id> 2 [--note …]` | 記一筆回答 |
| `decs monitor [--mine] [--here] [--idle-exit 2h]` | agent 的通知串流 |
| `decs read <id>` · `decs queue` | 收走回答 / 看還有哪些沒收 |
| `decs attach <id> file [--approval-content --approve-on 1]` | 附上一個檔案；可以掛上核准關卡 |
| `decs approved <id> --check <file>` | 只有這份內容被核准過才會退出 0 |
| `decs defer <id>` · `decs undefer <id>` | 延後 / 解除延後 |
| `decs show [open\|active\|deferred\|…] [--stale]` · `decs tree` · `decs get <id>` | 讀這個儲存區 |
| `decs search <words> [--all]` | 標題、正文、記錄、附件名稱 |
| `decs source register/sync/push/list/items/ack` | 外部來源 |
| `decs changes --since <t>` | 游標之後的一切，方便接上進度 |
| `decs bench [.\|<dir>…] [--view decide]` | 即時畫面 |
| `decs` | 在終端機裡等於 `decs bench`；接管線或在腳本裡時印出用法 |
| `decs config [<設定> [<值>\|--off]]` | 你的設定：lang、bidi、view、images、mouse、idle-exit、unclaimed-after（bench 裡按 `,` 也能改） |

編號可以寫成 `305`、`W305`（專案字母）、`web:305`（專案名稱），或是舊式的
`D305`。`decs <command> --help` 有其他細節。

## Bench 快捷鍵

| 鍵 | |
|---|---|
| `↑` `↓` | 移動 |
| `←` `→` · `-` `+` | 折疊 / 展開（跨 session 記住） |
| `Tab` `Shift-Tab` | 切換檢視 |
| `1`–`9` · `Enter` | 回覆 · 取預設值 |
| `w` | 跳到下一個卡住 agent 的節點 |
| `g` 或 `:` | 跳到一個編號 |
| `N` | 回覆但不決定（節點回到 agent 手上） |
| `d` | 延後 / 解除延後 |
| `X` · `A` | 帶理由關閉 · 標記看過並歸檔 |
| `T` `B` `U` | 置頂 / 置底 / 取消置頂 |
| `i` · `o` | 挑選並檢視圖片 · 開啟一個附件 |
| `j` `k` `Ctrl-F` `Ctrl-B` | 滾動詳情面板 |
| `Z` · `?` · `q` | 精簡正文 · 所有快捷鍵 · 離開 |
| `,` | 設定（語言、從右到左文字、滑鼠等） |

滑鼠也能用：點分頁、節點、選項或附件；滾輪滾動滑鼠所在的那個面板。

## 檔案格式

節點是帶 YAML front matter 的 markdown。人可以在任何編輯器裡讀它；agent 和
bench 都走 CLI，由它處理鎖定和歷史。

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

## 选项

### 1 · Stay on current CDN

### 2 · Move to edge provider

## 补充（agent · lane-perf · static assets · 2026-03-14 10:20:41）

Measured again: 1.9 s p95 from Singapore.
```

這些標題——`## 选项`、`## 补充（…）`，以及其他幾個——都是固定的詞，不會被
翻譯：為什麼，以及每個人怎麼選自己的語言，見上面的[語言](#語言)。

狀態：`not_started` 待開始 · `in_progress` 執行中 · `waiting` 等待 ·
`needs_decision` 待決策 · `decided` 已決策待 AI 取走 · `completed` 已完成 ·
`closed` 已關閉。子節點住在一個和父節點檔案同名的資料夾裡；編號是扁平的，
所以搬動一個節點只是改個檔名，所有參照照樣成立。

## 設計原則

- **是檔案，不是服務。** 一切都在 `decisions/` 裡，跟你的程式碼一起進版本
  控制，不裝 decs 也能讀。
- **檔案系統就是鎖。** 編號來自 `O_EXCL` 檔案；每次寫入都在自己的鎖下重新讀
  節點，透過先寫入再改名落地。二十幾個並發寫入者會拿到連續的編號，誰都不會
  丟——這點有測試保證。
- **只有一種東西。** 任務和決策是同一個節點。概念更少，一個編號空間，一棵樹。
- **人從來不用問。** 狀態、進度、多久沒動、卡在誰手上——全在 bench 上，不在
  對話裡。
- **角色寫清楚。** 每一段附加的內容都說明是人還是 agent 寫的、誰寫的、什麼
  時候寫的。只有人的回答才能核准要發出去的內容。
- **從外面來的是參照，不是內容。** 外部來源只同步編號和標題；正文和憑證留在
  它們原來的地方。

## 常見問題

**這只是給 Claude Code 用的嗎？**
不是。CLI 跟 agent 無關——任何能跑 shell 的東西都能呼叫它。Claude Code 外掛
加了 session 開頭的規則，並用 `CLAUDECODE` / `CLAUDE_SESSION_ID` 區分 agent
的 shell 和你自己的，順便標記是誰寫的。其他地方，自己設 `DECS_ROLE=agent`
和 `DECS_SESSION`。

**為什麼介面是中文的？**
現在不是了——`decs` 預設說英語，另外還會簡體中文、繁體中文、Français 和
العربية，見上面的[語言](#語言)。指令、flag 和磁碟上的檔案格式在每種語言裡都
是同一批固定的中文詞，這樣混語言的團隊寫出來的專案照樣能解析。標題和正文還是
能用任何語言寫，跟以前一樣。

**能用 git worktree 嗎？**
能。`decs` 永遠解析到主要工作目錄的 `decisions/`，所以各條 lane 的 worktree
共用同一個儲存區。

**同時管理好幾個專案？**
`decs init` 替每個專案註冊一下；不帶參數的 `decs bench` 會按專案字母分組，
開啟全部專案。

**沒人回答怎麼辦？**
每個問題都帶一個預設值和一個 `--if-no-answer`。`decs wait --timeout` 會以
退出碼 2 結束並印出預設值——這就是該照它繼續的時候。

**可以手動改檔案嗎？**
讀是自由的。要寫，用 CLI：它負責保持編號、鎖、回答佇列和附件歷史的一致性。

**我有一份舊的 `DECISIONS.md`。**
`decs migrate --dir <project> --dry-run`，確認沒問題後拿掉 `--dry-run` 再跑
一次。

## 開發

```sh
npm test            # node --test
npm run typecheck   # tsc --noEmit
node scripts/render-screenshot.ts --out docs/screenshot.zh-Hant   # regenerate docs/screenshot.<lng>.svg/.png (mock data)
```

## 授權

[MIT](LICENSE) © 2026 WeCarbon
