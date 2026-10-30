import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { initLayout } from '../src/core/paths.ts'
import { Store } from '../src/core/store.ts'
import { listTopFor, scrollList } from '../src/tui/app.ts'
import { rowsFor } from '../src/tui/views.ts'
import { KEY, bench, has } from './tui-harness.ts'

// ---------------------------------------------------------------------------
// Pure: the list viewport
// ---------------------------------------------------------------------------

test('scrollList moves the viewport by the delta and clamps at both ends', () => {
  assert.equal(scrollList(0, 1, 10, 40), 1)
  assert.equal(scrollList(5, -3, 10, 40), 2)
  assert.equal(scrollList(29, 5, 10, 40), 30, 'stops with the last row at the bottom')
  assert.equal(scrollList(1, -5, 10, 40), 0)
  assert.equal(scrollList(99, -1, 10, 40), 29, 'a stale top past the end is clamped before stepping')
  assert.equal(scrollList(0, 3, 10, 6), 0, 'a list that fits never scrolls')
})

test('listTopFor scrolls minimally, never re-centres, and keeps the cursor off the "more" marker rows', () => {
  // 40 rows, 10 visible.
  assert.equal(listTopFor(0, 0, 10, 40), 0)
  assert.equal(listTopFor(8, 0, 10, 40), 0, 'row 8 is the last node row above the ↓ marker')
  assert.equal(listTopFor(9, 0, 10, 40), 1, 'row 9 would sit under the ↓ marker: scroll one')
  assert.equal(listTopFor(15, 0, 10, 40), 7, 'lands one above the marker, not centred')
  assert.equal(listTopFor(12, 7, 10, 40), 7, 'already visible: hold still')
  assert.equal(listTopFor(8, 7, 10, 40), 7, 'first node row under the ↑ marker')
  assert.equal(listTopFor(7, 7, 10, 40), 6, 'under the ↑ marker: scroll one up')
  assert.equal(listTopFor(1, 20, 10, 40), 0, 'row 1 needs the top, since row 0 would be a marker otherwise')
  assert.equal(listTopFor(39, 0, 10, 40), 30, 'the last row: scrolled to the end, no ↓ marker any more')
  assert.equal(listTopFor(38, 0, 10, 40), 30)
  assert.equal(listTopFor(-1, 12, 10, 40), 12, 'no cursor: leave the viewport')
  assert.equal(listTopFor(3, 0, 10, 5), 0, 'fits: never scrolls')
})

// ---------------------------------------------------------------------------
// The real App
// ---------------------------------------------------------------------------

function many(t: { after: (fn: () => void) => void }, n = 40) {
  const root = mkdtempSync(join(tmpdir(), 'decs-scroll-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const store = new Store([initLayout(root)])
  for (let i = 1; i <= n; i++) store.create({ title: `node ${String(i).padStart(2, '0')}`, author: 'a · x', task: true, body: LONG })
  const order = rowsFor('all', store.all()).map((r) => r.node!.title)
  return { store, order }
}

const LONG = Array.from({ length: 60 }, (_, i) => `line ${i} of the body`).join('\n')

/** Titles in the left pane, top to bottom, and the node the detail pane shows. */
function panes(lines: string[]): { left: string[]; detail: string | undefined } {
  const left: string[] = []
  let detail: string | undefined
  for (const l of lines) {
    const [l0, ...rest] = l.split('│')
    const m = /node \d\d/.exec(l0)
    if (m) left.push(m[0])
    const r = /^ (node \d\d)\s*$/.exec(rest.join('│'))
    if (r && !detail) detail = r[1]
  }
  return { left, detail }
}

const wheel = (dir: 'up' | 'down', x: number, y = 8) => `\x1b[<${dir === 'down' ? 65 : 64};${x};${y}M`

test('App: wheel over the list scrolls it a row per event; the cursor and the detail pane stay put; both ends clamp', async (t) => {
  const { store, order } = many(t)
  const b = bench(t, store, { columns: 120, rows: 30 })
  await b.until(() => panes(b.frame()).detail === order[0])
  const before = panes(b.frame())
  assert.equal(before.left[0], order[0])

  await b.press(...Array.from({ length: 5 }, () => wheel('down', 3)))
  // The ↑ more above marker takes the top row, so the first title is order[top + 1].
  await b.until(() => panes(b.frame()).left[0] === order[6])
  let now = panes(b.frame())
  assert.equal(now.left[0], order[6], 'five events, five rows')
  assert.equal(now.detail, order[0], 'the detail pane still shows the cursor node')

  // A trackpad flick: a burst of reports arriving in one read.
  await b.press(Array.from({ length: 4 }, () => wheel('down', 3)).join(''))
  await b.until(() => panes(b.frame()).left[0] === order[10])
  assert.equal(panes(b.frame()).left[0], order[10], 'a burst in one chunk still counts every event')
  assert.equal(panes(b.frame()).detail, order[0])

  await b.press(...Array.from({ length: 60 }, () => wheel('down', 3)))
  await b.until(() => panes(b.frame()).left.at(-1) === order.at(-1))
  await b.quiet()
  now = panes(b.frame())
  assert.equal(now.left.at(-1), order.at(-1), 'clamped: the last node on the last row')
  assert.ok(!b.frame().join('\n').includes('more below'))

  await b.press(wheel('up', 3))
  await b.until(() => panes(b.frame()).left.at(-1) !== order.at(-1))
  assert.notEqual(panes(b.frame()).left.at(-1), order.at(-1), 'coming back from the end moves at once')

  await b.press(...Array.from({ length: 60 }, () => wheel('up', 3)))
  await b.until(() => panes(b.frame()).left[0] === order[0])
  await b.quiet()
  assert.equal(panes(b.frame()).left[0], order[0], 'clamped at the top')
  assert.ok(!b.frame().join('\n').includes('more above'))
  assert.equal(panes(b.frame()).detail, order[0], 'cursor never moved')
})

test('App: ↓ after a wheel scroll brings the cursor back into view minimally; ↓ never re-centres', async (t) => {
  const { store, order } = many(t, 80)
  const b = bench(t, store, { columns: 120, rows: 30 })
  await b.until(() => panes(b.frame()).detail === order[0])
  const shown = panes(b.frame()).left.length

  // Cursor walks down the visible rows: the list holds still.
  await b.press(...Array.from({ length: shown - 2 }, () => KEY.down))
  await b.until(() => panes(b.frame()).detail === order[shown - 2])
  assert.equal(panes(b.frame()).left[0], order[0], 'no re-centring while the cursor is on screen')
  // One more: the list moves the minimum to keep it visible.
  await b.press(KEY.down)
  await b.until(() => panes(b.frame()).detail === order[shown - 1])
  assert.equal(panes(b.frame()).left.at(-1), order[shown - 1], 'the cursor row is now the last node row')

  // Wheel the cursor far out of view, then ↓: back just far enough.
  await b.press(...Array.from({ length: 40 }, () => wheel('down', 3)))
  await b.until(() => !panes(b.frame()).left.includes(order[shown - 1]))
  await b.quiet()
  assert.ok(!panes(b.frame()).left.includes(order[shown - 1]), 'cursor scrolled out of view above')
  assert.equal(panes(b.frame()).detail, order[shown - 1])
  await b.press(KEY.down)
  await b.until(() => panes(b.frame()).detail === order[shown])
  const left = panes(b.frame()).left
  assert.ok(left.includes(order[shown]), 'cursor visible again')
  assert.equal(left[0], order[shown], 'it was above the viewport: now the first node row, not centred')
})

test('App: a click after a wheel scroll selects the row under the pointer', async (t) => {
  const { store, order } = many(t)
  const b = bench(t, store, { columns: 120, rows: 30 })
  await b.until(() => panes(b.frame()).detail === order[0])
  await b.press(...Array.from({ length: 12 }, () => wheel('down', 3)))
  await b.until(() => panes(b.frame()).left[0] === order[13])
  const lines = b.frame()
  const y = lines.findIndex((l) => l.split('│')[0].includes(order[16]))
  assert.ok(y > 0)
  await b.press(`\x1b[<0;6;${y + 1}M`)
  await b.until(() => panes(b.frame()).detail === order[16])
  assert.equal(panes(b.frame()).detail, order[16])
  assert.equal(panes(b.frame()).left[0], order[13], 'selecting a visible row does not scroll')
})

test('App: the wheel over the detail pane scrolls its body a line per event and clamps, without touching the list', async (t) => {
  const { store, order } = many(t)
  const b = bench(t, store, { columns: 120, rows: 30 })
  await b.until(() => panes(b.frame()).detail === order[0])
  const bodyLine = (n: number) => new RegExp(`│ line ${n} of the body`)
  const rowOf = (n: number) => b.frame().findIndex((l) => bodyLine(n).test(l))
  const at = rowOf(10)
  assert.ok(at > 0)
  await b.press(...Array.from({ length: 4 }, () => wheel('down', 100)))
  await b.until(() => rowOf(10) <= at - 4)
  await b.quiet()
  assert.equal(rowOf(10), at - 4, 'four events, four lines (not twelve)')
  assert.equal(panes(b.frame()).left[0], order[0], 'list untouched')

  await b.press(...Array.from({ length: 200 }, () => wheel('down', 100)))
  await b.until(has(b, bodyLine(59)))
  await b.quiet()
  await b.press(wheel('up', 100))
  await b.until(() => !has(b, bodyLine(59))())
  assert.ok(!has(b, bodyLine(59))(), 'past the end, one event up already moves')
})
