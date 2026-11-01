# 适配器（adapter）怎么写

`nod source` 是一个通知系统，agent 接进来用的。适配器是你为自己项目写的一小段
后台进程（通常是 python，跑在后台 shell 里），负责把一个外部系统的「有什么」同步
进 `nod` —— 只有 id + title（可选 url/state/from），**绝不同步正文**，也**绝不
把凭证交给 nod**。凭证留在你项目自己的代码/环境变量里；nod 从来不直接访问 issue 跟踪、
邮箱或任何外部系统，它只看你喂给它的那几行 JSON。

拿 `example_sync.py` 当模板：复制到你项目里，把 `fetch_items()` 换成真的抓取逻辑，
其余不用动。

## 三步

1. **注册**（一次，或者让适配器每次启动时调用——`register` 是幂等的，不给的字段
   不会被清空）：

   ```sh
   nod source register github-issues --title "GitHub issues（v2.4 里程碑）" \
       --kind github --adapter "python3 adapters/github_sync.py --name github-issues" \
       --stale-after 15m
   ```

   `--stale-after` 是「心跳超过多久没来，就认为 adapter 可能挂了」——默认 15 分钟，
   轮询间隔比这个短得多，才不会一直显示「可能挂了」。

2. **同步**。两种方式，选一种：

   - **全量快照**（大多数情况用这个）：每次把你现在能看到的*全部*条目喂给
     `nod source sync <name>`，nod 自己 diff 出新增/变化/消失：

     ```sh
     nod source sync github-issues <<'EOF'
     {"id":"12345","title":"示例 issue 1","url":"https://example.com/issues/12345","state":"active"}
     {"id":"12346","title":"示例 issue 2","state":"new","from":"someone@example.com"}
     EOF
     ```

     JSON-lines 协议：一行一个对象，只有 `id`/`title` 必填，`url`/`state`/`from`
     可选。空行跳过。

   - **增量推送**：只知道一条变了，不想重新拉全量：

     ```sh
     nod source push github-issues --id 12345 --title "示例 issue 1（已解决）" --state resolved
     ```

   两个命令都会顺带更新心跳——不用再单独调 `nod source heartbeat`，除非你这轮
   确实没有新数据，只想证明自己还活着。

3. **后台跑起来**。轮询循环（`while True: sync(); sleep(interval)`），丢进后台
   shell。agent 这边另起一个后台 shell 跑 `nod source wait <name>`（和
   `nod wait` 一个哲学：不是常驻 watch，等到有未处理的 new/changed 条目就打印
   然后退出），退出就去处理，处理完 `nod source ack`，再重新 `nod source wait`。

## 处理掉一条

```sh
nod source items github-issues --unhandled     # 看有哪些还没处理
nod source ack github-issues 12345 --note "已经在 PR #42 里修了"
nod source ack github-issues 12346 --waiting-on Bob   # 转给人，不是挂起
nod source ack github-issues 12347 --waiting-on owner   # 建了个决策，等 owner
```

`--waiting-on` 的值原样存下来，nod 不解析也不改写：

- `owner` / `us`：还没真的了结，`nod source list` 的 cleared 会算上它们。
- 一个人的名字：交出去了，不算挡着 cleared。
- 一个节点编号（如 `W304`，nod 里决策和任务统一叫「节点」，共用一套编号，前缀
  是项目字母；裸的 `D304`/`304` 也认，当老格式）：说明这条外部通知催生了一个还
  开着的节点，同样算挡着 cleared。

## agent 怎么用它

```sh
nod source wait github-issues    # 放后台 shell；阻塞到有未处理的新/变化条目
nod source list                     # 心跳、未处理数、卡在谁手上，一眼看完
nod source events --since <ISO>     # wait 退出时会打印一个 since 游标，接着看
```

"清空"（cleared）= 这个来源没有未处理的条目，也没有条目卡在 `owner`/`us`/一个
还开着的节点上。owner 问「issues/邮箱/反馈是不是都清了」，`nod source list`
直接给答案，不用再问 agent。

## 规矩

- **只同步 id/title（+ 可选 url/state/from），不同步正文。** 外部系统的全文、
  邮件正文、反馈原文都不要喂给 `nod source sync`/`push` —— nod 的文件是一堆
  agent 和 owner 都能读的 markdown/JSON，正文该留在原系统里，需要时附一个 url。
- **凭证留在你项目的代码/环境变量里，绝不传给 nod。** `--adapter` 字段只是给人
  看的一行命令描述，不要把 token/密码写进去。
- **适配器挂了要看得出来。** 心跳是免费的（sync/push 自动带），别写一个
  「静默失败就不心跳」的循环——catch 住异常、打一行 stderr、照常进入下一轮
  sleep，让 `nod source list` 的 stale 检测能抓到「进程直接死了」。
