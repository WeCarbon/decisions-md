import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, readdirSync, rmSync } from 'node:fs'

import { initLayout } from '../src/core/paths.ts'
import { Store, optionDiff } from '../src/core/store.ts'
import { OPTION_LABEL } from '../src/core/format.ts'
import { setLang } from '../src/i18n/index.ts'
import { decs, decsResult, scratch } from './helpers.ts'

/** store.ts's "does not match -o" wrapper message is English in the source. */
function inEnglish<T>(fn: () => T): T {
  setLang('en')
  try {
    return fn()
  } finally {
    setLang('en')
  }
}

const BODY = [
  '**What it is.** Ship v2.4 or not.',
  '',
  '## 选项',
  '',
  '### 1 · ship it',
  'Tonight.',
  '',
  '### 2 · hold off（默认）',
  'Next week.',
  '',
  '### 3 · backend only',
  'Frontend next week.',
].join('\n')

function fresh(t: { after: (fn: () => void) => void }) {
  const root = scratch()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const layout = initLayout(root)
  return { root, layout, store: new Store([layout]) }
}

const ids = (dir: string) => readdirSync(dir).filter((f) => /^\d+$/.test(f)).map(Number).sort((a, b) => a - b)

// ---------------------------------------------------------------------------
// (a) a body that already has its options
// ---------------------------------------------------------------------------

test('no -o and a body with ## 选项: those are the options, the （默认） one is the default, nothing is appended', (t) => {
  const { store } = fresh(t)
  const d = store.create({ title: 'ship or not', author: 'a · x', body: BODY })
  assert.deepEqual(d.options.map((o) => [o.key, o.label]), [['1', 'ship it'], ['2', 'hold off（默认）'], ['3', 'backend only']])
  assert.equal(d.default, '2')
  assert.equal(d.kind, 'decision')
  assert.ok(!d.options.some((o) => o.label === OPTION_LABEL.accept), 'not turned into an acceptance node')
  assert.equal(d.body.match(/^## 选项/gm)?.length, 1, 'the block is not written twice')
  assert.equal(d.options[0].body, 'Tonight.', 'each option keeps its text')
})

test('no -o: --default wins over the body mark; a body with no mark has no default', (t) => {
  const { store } = fresh(t)
  assert.equal(store.create({ title: 'a', author: 'a · x', body: BODY, default: '3' }).default, '3')
  const unmarked = BODY.replace('（默认）', '')
  assert.equal(store.create({ title: 'b', author: 'a · x', body: unmarked }).default, undefined)
  assert.throws(() => store.create({ title: 'c', author: 'a · x', body: BODY, default: '9' }), /9/, 'a default the body does not have is still refused')
})

test('no -o and no options in the body is still the acceptance shape', (t) => {
  const { store } = fresh(t)
  const acc = store.create({ title: 'take a look', author: 'a · x', body: 'Where to look: …' })
  assert.deepEqual(acc.options.map((o) => o.label), [OPTION_LABEL.accept])
  assert.equal(acc.default, undefined)
})

test('decs add via the CLI: a body with its own options and no -o goes through', (t) => {
  const root = scratch()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  decs(root, ['init', '--no-register'])
  const out = JSON.parse(decs(root, ['add', 'ship or not', '--author', 'a · x', '--json'], {}, BODY))
  assert.deepEqual(out.options.map((o: { key: string }) => o.key), ['1', '2', '3'])
  assert.equal(out.default, '2')
  const out2 = JSON.parse(decs(root, ['add', 'one more time', '--author', 'a · x', '--default', '1', '--json'], {}, BODY))
  assert.equal(out2.default, '1')
})

test('with -o, a body block that disagrees is still refused, and the error says which labels differ', (t) => {
  const { store } = fresh(t)
  assert.throws(
    () => inEnglish(() => store.create({ title: 't', author: 'a · x', body: BODY, options: [{ key: '1', label: 'ship it' }, { key: '2', label: 'hold off' }] })),
    (e: Error) =>
      /does not match -o/.test(e.message) &&
      e.message.includes('2: body「hold off（默认）」≠ -o「hold off」') &&
      e.message.includes('3「backend only」only in the body') &&
      !e.message.includes('1:'),
  )
  // Matching -o exactly is fine, as before.
  const ok = store.create({
    title: 'u',
    author: 'a · x',
    body: BODY,
    options: [{ key: '1', label: 'ship it' }, { key: '2', label: 'hold off（默认）' }, { key: '3', label: 'backend only' }],
  })
  assert.equal(ok.options.length, 3)
})

test('optionDiff names label changes, extras on either side, and a reorder', () => {
  const body = [{ key: '1', label: 'A', body: '' }, { key: '2', label: 'B', body: '' }]
  assert.equal(optionDiff(body, [{ key: '1', label: 'A' }, { key: '2', label: 'C' }]), '2: body「B」≠ -o「C」')
  assert.equal(optionDiff(body, [{ key: '1', label: 'A' }]), '2「B」only in the body')
  assert.equal(optionDiff(body, [{ key: '1', label: 'A' }, { key: '2', label: 'B' }, { key: '3', label: 'D' }]), '3「D」only in -o')
  assert.equal(optionDiff(body, [{ key: '2', label: 'B' }, { key: '1', label: 'A' }]), 'order differs: body 1,2, -o 2,1')
})

// ---------------------------------------------------------------------------
// (b) a failed add does not burn an id
// ---------------------------------------------------------------------------

test('a create that fails validation reserves no id; the next one gets the number it would have', (t) => {
  const { store, layout } = fresh(t)
  assert.equal(store.create({ title: 'one', author: 'a · x', task: true }).id, 1)
  const failures: [string, () => unknown][] = [
    ['-o mismatch', () => store.create({ title: 'x', author: 'a · x', body: BODY, options: [{ key: '1', label: 'something else' }] })],
    ['unknown default', () => store.create({ title: 'x', author: 'a · x', options: [{ key: '1', label: 'A' }], default: '7' })],
    ['missing parent', () => store.create({ title: 'x', author: 'a · x', task: true, parent: '99' })],
    ['task with options', () => store.create({ title: 'x', author: 'a · x', task: true, options: [{ key: '1', label: 'A' }] })],
    ['no author', () => store.create({ title: 'x', author: ' ' })],
  ]
  for (const [why, f] of failures) {
    assert.throws(f, Error, why)
    assert.deepEqual(ids(layout.idsDir), [1], `${why}: no id reserved`)
  }
  assert.equal(store.create({ title: 'two', author: 'a · x', task: true }).id, 2, 'no gap')
})

test('a create whose file write fails gives its reserved id back', (t) => {
  const { store, layout } = fresh(t)
  store.create({ title: 'one', author: 'a · x', task: true })
  chmodSync(layout.activeDir, 0o500)
  t.after(() => {
    try {
      chmodSync(layout.activeDir, 0o755)
    } catch {
      /* already cleaned up */
    }
  })
  assert.throws(() => store.create({ title: 'blocked', author: 'a · x', task: true }), /EACCES|permission/i)
  assert.deepEqual(ids(layout.idsDir), [1], 'the number taken for the failed write was released')
  chmodSync(layout.activeDir, 0o755)
  assert.equal(store.create({ title: 'two', author: 'a · x', task: true }).id, 2)
})

test('decs add via the CLI: a refused add leaves no empty .ids entry behind', (t) => {
  const root = scratch()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  decs(root, ['init', '--no-register'])
  // decs add's error wraps store.ts's "does not match -o" message, English in the source.
  const r = decsResult(root, ['add', 't', '--author', 'a · x', '-o', '1=something else'], { DECS_LANG: 'en' }, BODY)
  assert.notEqual(r.code, 0)
  assert.match(r.stderr, /does not match -o/)
  assert.deepEqual(ids(`${root}/decisions/.ids`), [])
  const out = JSON.parse(decs(root, ['add', 'ok', '--author', 'a · x', '--task', '--json']))
  assert.equal(out.id, 1)
})
