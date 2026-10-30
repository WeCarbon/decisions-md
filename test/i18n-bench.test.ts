import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { initLayout } from '../src/core/paths.ts'
import { Store } from '../src/core/store.ts'
import { buildOverview } from '../src/core/overview.ts'
import { buildFrame, type FrameInput } from '../src/tui/app.ts'
import { isRtl, LANGUAGES, setLang, t, type Lang } from '../src/i18n/index.ts'
import { visualText } from '../src/i18n/bidi.ts'
import { nearestSelectable, rowsFor, VIEW_LABEL, VIEWS, type View } from '../src/tui/views.ts'
import { stringWidth } from '../src/tui/width.ts'
import { RESET } from '../src/tui/zoom.ts'

const text = (segs: { text: string }[]) => segs.map((s) => s.text).join('')
const frameText = (frame: { text: string }[][]) => frame.map(text).join('\n')

const A = 'lead · i18n test'
const WIDTHS = [80, 100, 140]

function tmpStore(t: { after: (fn: () => void) => void }): Store {
  const root = mkdtempSync(join(tmpdir(), 'decs-i18n-bench-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return new Store([initLayout(root)])
}

/** A small mix of states so every tab and most badges actually draw something. */
function fixture(store: Store) {
  const release = store.create({ title: 'Ship release 2.4', author: A, options: [{ key: '1', label: 'Ship it' }, { key: '2', label: 'Hold' }], default: '1' })
  const root = store.create({ title: 'Release 2.4 follow-up', author: A, task: true })
  const deploy = store.create({ title: 'Deploy to staging', author: A, task: true, parent: `${root.id}`, after: [`${release.id}`] })
  const review = store.create({ title: 'Review onboarding copy', author: A, task: true, parent: `${root.id}`, after: [`${deploy.id}`] })
  const gate = store.create({ title: 'Run the full test gate', author: 'gate-lane · gate', task: true, staleAfter: '10m' })
  store.start(gate)
  store.progress(store.get(gate.id)!, { progress: 42 })
  const held = store.hold(store.create({ title: 'Wait on vendor reply', author: A, task: true }), 'Alice', A)
  const done = store.create({ title: 'Already shipped', author: A, task: true })
  store.complete(done)
  return { release, root, deploy, review, gate, held, done }
}

function input(store: Store, over: Partial<FrameInput> = {}): FrameInput {
  const view: View = over.view ?? 'all'
  const items = over.items ?? store.all()
  const now = over.now ?? Date.now()
  const list = over.list ?? rowsFor(view, items)
  const index = over.index ?? nearestSelectable(list, 0, 1)
  return {
    view,
    list,
    index,
    current: index >= 0 ? list[index]?.node : undefined,
    items,
    overview: buildOverview(items, now),
    now,
    rows: 30,
    width: 100,
    offset: 0,
    condensed: false,
    mode: 'browse',
    draft: '',
    caret: 0,
    imageSel: 0,
    pendingKey: null,
    banner: null,
    zoom: RESET,
    zoomable: false,
    detailFocus: false,
    imageSize: null,
    ...over,
  }
}

/** Restores the suite's pinned language even if an assertion throws mid-test. */
function inLang<T>(lng: Lang, f: () => T): T {
  setLang(lng)
  try {
    return f()
  } finally {
    setLang('en')
  }
}

for (const lng of LANGUAGES) {
  test(`${lng}: the bench frame never overflows at 80/100/140 columns`, (t) => {
    const store = tmpStore(t)
    fixture(store)
    inLang(lng, () => {
      for (const width of WIDTHS) {
        const frame = buildFrame(input(store, { width, rows: 30 }))
        for (const line of frame) {
          assert.ok(stringWidth(text(line)) <= width, `${lng} at ${width}: a line overflowed — ${JSON.stringify(text(line))}`)
        }
        const whole = frameText(frame)
        assert.doesNotMatch(whole, /\{\{/, `${lng} at ${width}: an untranslated placeholder leaked`)
        assert.doesNotMatch(whole, /\bbench\.[a-zA-Z][\w.]*\b/, `${lng} at ${width}: a raw i18n key leaked`)
      }
    })
  })

  test(`${lng}: the header at 100 columns shows this language's tab names`, (t) => {
    const store = tmpStore(t)
    fixture(store)
    inLang(lng, () => {
      const frame = buildFrame(input(store, { width: 100, rows: 30 }))
      const header = text(frame[0])
      // Arabic (the only RTL language here) draws in visual bidi order by default:
      // the tab's own characters come back from the bidi algorithm, same as any
      // other right-to-left run — compare against that, not the logical string.
      for (const v of VIEWS) {
        const want = isRtl() ? visualText(VIEW_LABEL[v]) : VIEW_LABEL[v]
        assert.ok(header.includes(want), `${lng}: header is missing the ${v} tab (${JSON.stringify(header)})`)
      }
    })
  })

  test(`${lng}: the help screen renders within width at 80/100/140 columns`, (t) => {
    const store = tmpStore(t)
    fixture(store)
    inLang(lng, () => {
      for (const width of WIDTHS) {
        const frame = buildFrame(input(store, { width, rows: 40, mode: 'help' }))
        for (const line of frame) {
          assert.ok(stringWidth(text(line)) <= width, `${lng} help at ${width}: a line overflowed — ${JSON.stringify(text(line))}`)
        }
        const whole = frameText(frame)
        assert.doesNotMatch(whole, /\{\{/, `${lng} help at ${width}: an untranslated placeholder leaked`)
        assert.doesNotMatch(whole, /\bbench\.[a-zA-Z][\w.]*\b/, `${lng} help at ${width}: a raw i18n key leaked`)
      }
    })
  })
}

for (const lng of LANGUAGES) {
  test(`${lng}: the detail pane shows the options heading in the bench's language; the file keeps its own`, (ctx) => {
    const store = tmpStore(ctx)
    const d = store.create({ title: 'Pick a CDN', author: A, options: [{ key: '1', label: 'Stay' }, { key: '2', label: 'Move' }], default: '1' })
    setLang(lng)
    try {
      const s = input(store)
      const frame = buildFrame(s)
      const want = isRtl() ? visualText(t('bench.heading.options')) : t('bench.heading.options')
      assert.ok(frameText(frame).includes(want), `${lng}: ${want}`)
      if (lng !== 'zh-Hans') assert.ok(!frameText(frame).includes('选项'), `${lng}: the raw heading is not shown`)
    } finally {
      setLang('en')
    }
    assert.match(readFileSync(store.get(d.id)!.file, 'utf8'), /^## 选项$/m)
  })
}

test('ar: every list row draws its progress the same way, whether or not its title holds a Latin word', (t) => {
  const store = tmpStore(t)
  for (const title of ['نقل الفوترة إلى Stripe', 'كتابة مزدوجة للفواتير']) {
    const d = store.create({ title, author: A, task: true })
    store.start(d)
    store.progress(store.get(d.id)!, { progress: 50 })
  }
  setLang('ar')
  try {
    const frame = buildFrame(input(store, { view: 'active' }))
    const rows = frame.map(text).map((l) => l.split('│')[1] ?? '').filter((l) => /50/.test(l))
    assert.equal(rows.length, 2, frameText(frame))
    const around = rows.map((r) => /(\S*50\S*)/.exec(r)![1])
    assert.equal(around[0], around[1], `same percentage rendering: ${around.join(' vs ')}`)
    for (const line of frame.map(text)) assert.ok(stringWidth(line) <= 100)
  } finally {
    setLang('en')
  }
})
