# 2026-09-11 · D20（deploy-lane · lane）· how strict should the deploy gate be · 已答「strict」

> 提出者：deploy-lane lane · moved the deploy script onto a local path

**What it is.** A placeholder paragraph.

**选项：**

- **A（already shipped, default）· Strict: the tree must match.** Blocks part of the last few runs.
- **B · Only look at files that will ship.** Introduces a new check that might be wrong.
- **C · Warn only, don't block.** No longer a real gate.

**如果你不回**：stick with A.

**已答（owner，2026-09-11 00:30）。** Strict (A): the tree must match what the gate last ran against.

**执行记录（lead）。** Shipped.

---

# 2026-09-10 · D21（batch-lane · lane）· should inbox search hit the backend · 已答「B」

> 提出者：batch-lane lane · trimmed the heavy fields off the list endpoint

**What it is.** Now that the list got lighter, inbox full-text search needs to hit the backend.

**选项：**
- **A: accept the downgrade, search only the preview.** Cost: no full-text search.
- **B: wire it to the backend's `?search=`.** Cost: typing now round-trips over the network.

**已答（owner，2026-09-10 23:00）。** Wire it to backend search, not plain front-end filtering.

---

# 2026-09-08 · D22（unanswered-lane · lane）· this one never got a clear reply

> 提出者：unanswered-lane（lane）· a one-off read-only recheck

**What it is.** The body has no 「已答」 or 「已办」 marker anywhere, and no `> 已答「…」` blockquote either, so status should stay open even though this is sitting in the archive file.

**选项：**
- **A: leave it alone for now.** Do nothing.
- **B: fix it now.** Needs a one-off migration.

**如果你不回：** go with A.
