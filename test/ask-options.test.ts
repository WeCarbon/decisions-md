import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { initLayout } from '../src/core/paths.ts'
import { collapseDuplicateOptions, findDuplicateOptions } from '../src/core/repair.ts'
import { Store } from '../src/core/store.ts'
import { decs, decsResult, scratch } from './helpers.ts'

/** What a lane pipes into `decs ask`: the question, with each option's cost under ## 选项. */
const TEXT = [
  '**What it is.** The sending domain might be landing in spam.',
  '',
  '## 选项',
  '',
  '### 1 · test it from an outside mailbox',
  'A few minutes; you paste back one email header.',
  '',
  '### 2 · have the admin run a trace',
  'Needs you to log in once.',
  '',
  '### 3 · ask the customer（默认）',
  'Outbound contact — wording needs separate sign-off.',
  '',
  '## If you don\'t answer',
  'Drop it, no further digging.',
].join('\n')

function fresh(t: { after: (fn: () => void) => void }) {
  const root = scratch()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, store: new Store([initLayout(root)]) }
}

const labels = (d: { options: { key: string; label: string }[] }) => d.options.map((o) => `${o.key} ${o.label}`)

// ---------------------------------------------------------------------------
// decs ask with a text that carries its own options
// ---------------------------------------------------------------------------

test('ask with -o matching the text: the text block is the options, nothing appended, bodies kept', (t) => {
  const { store } = fresh(t)
  const d = store.create({ title: 'check delivery', author: 'a · x', task: true, body: 'Look into it.' })
  const next = store.ask(d, {
    options: [{ key: '1', label: 'test it from an outside mailbox' }, { key: '2', label: 'have the admin run a trace' }, { key: '3', label: 'ask the customer（默认）' }],
    default: '1',
    text: TEXT,
    author: 'mail · x',
  })
  assert.deepEqual(labels(next), ['1 test it from an outside mailbox', '2 have the admin run a trace', '3 ask the customer（默认）'], 'three, not six')
  assert.equal(next.options[0].body, 'A few minutes; you paste back one email header.', 'the costs are the option bodies')
  assert.equal(next.body.match(/^## 选项/gm)?.length, 1, 'no second block')
  assert.equal(next.default, '1')
  assert.equal(findDuplicateOptions(next.body), null)
})

test('ask with no -o: the text block is adopted, with its （默认）', (t) => {
  const { store } = fresh(t)
  const d = store.create({ title: 'check delivery', author: 'a · x', task: true, body: 'Look into it.' })
  const next = store.ask(d, { options: [], text: TEXT, author: 'mail · x' })
  assert.deepEqual(next.options.map((o) => o.key), ['1', '2', '3'])
  assert.equal(next.default, '3')
  assert.equal(next.state, 'needs_decision')
})

test('ask on a node that already had options: the text block becomes the next round and wins', (t) => {
  const { store } = fresh(t)
  const d = store.create({ title: 'old question', author: 'a · x', options: [{ key: '1', label: 'old A' }, { key: '2', label: 'old B' }], default: '1' })
  const next = store.ask(d, { options: [], text: TEXT, author: 'mail · x' })
  assert.deepEqual(labels(next), ['1 test it from an outside mailbox', '2 have the admin run a trace', '3 ask the customer（默认）'])
  assert.match(next.body, /^## 选项（第 2 轮）$/m, 'renumbered so it outranks round 1')
  assert.match(next.body, /old A/, 'the old round stays as history')
})

test('ask with -o that disagrees with the text block is refused, naming the difference, and writes nothing', (t) => {
  const { store } = fresh(t)
  const d = store.create({ title: 'check delivery', author: 'a · x', task: true, body: 'Look into it.' })
  const before = readFileSync(d.file, 'utf8')
  assert.throws(
    () => store.ask(d, { options: [{ key: '1', label: 'test it from an outside mailbox' }, { key: '2', label: 'something else' }], text: TEXT, author: 'mail · x' }),
    (e: Error) => e.message.includes('2: body「have the admin run a trace」≠ -o「something else」') && e.message.includes('3「ask the customer（默认）」only in the body'),
  )
  assert.equal(readFileSync(d.file, 'utf8'), before)
})

test('ask without an options block in the text works as before: -o is appended as the next round', (t) => {
  const { store } = fresh(t)
  const d = store.create({ title: 'q', author: 'a · x', task: true })
  const next = store.ask(d, { options: [{ key: '1', label: 'A' }, { key: '2', label: 'B' }], default: '2', text: 'Just a quick check.', author: 'x' })
  assert.deepEqual(labels(next), ['1 A', '2 B'])
  assert.equal(next.default, '2')
})

test('decs ask via the CLI with the text on stdin: three options, no read-back warning', (t) => {
  const root = scratch()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  decs(root, ['init', '--no-register'])
  decs(root, ['add', 'check delivery', '--author', 'a · x', '--task'])
  const r = decsResult(root, ['ask', '1', '-o', '1=test it from an outside mailbox', '2=have the admin run a trace', '3=ask the customer（默认）', '--default', '1', '--author', 'a · x'], {}, TEXT)
  assert.equal(r.code, 0, r.stderr)
  assert.doesNotMatch(r.stdout + r.stderr, /did not read back/)
  const got = JSON.parse(decs(root, ['get', '1', '--json']))
  assert.equal(got.options.length, 3)
})

// ---------------------------------------------------------------------------
// Repair: nodes an older decs ask already doubled
// ---------------------------------------------------------------------------

/** A doubled options block: the text's block, a section, then an empty repeat, then 附件. */
function doubled(): string {
  return [
    '---',
    'id: 1',
    'title: check delivery',
    'author: a · x',
    'status: needs_decision',
    'created: 2026-10-28T14:17:40+08:00',
    'default: "1"',
    '---',
    '',
    'Look into it.',
    '',
    '## 新问题（agent · mail · x · 2026-10-28 14:41:26）',
    '',
    TEXT,
    '',
    '## 选项',
    '',
    '### 1 · test it from an outside mailbox',
    '',
    '### 2 · have the admin run a trace',
    '',
    '### 3 · ask the customer（默认）',
    '',
    '## 附件',
    '',
    '- ![facts.png](../attachments/1/facts.png)',
    '',
  ].join('\n')
}

test('findDuplicateOptions finds exactly the empty repeat, and collapsing leaves the rest intact', () => {
  const raw = doubled()
  const dup = findDuplicateOptions(raw)
  assert.ok(dup)
  const lines = raw.split('\n')
  assert.equal(lines[dup.toLine], '## 附件', 'stops at the next section')
  assert.equal(lines.slice(dup.fromLine - 1, dup.toLine).filter((l) => l.startsWith('## 选项')).length, 1)
  const { body, removed } = collapseDuplicateOptions(raw)
  assert.equal(removed.length, 1)
  assert.equal(body.match(/^## 选项/gm)?.length, 1)
  assert.match(body, /Drop it, no further digging\.\n\n## 附件/, 'the section before and 附件 after are joined by one blank line')
  assert.match(body, /facts\.png/)
  assert.equal(findDuplicateOptions(body), null, 'idempotent')
})

test('findDuplicateOptions leaves a deliberate re-ask alone (earlier block has no prose either) and differing labels alone', () => {
  const reask = ['## 选项', '', '### 1 · go', '', '### 2 · no go', '', '## 选项（第 2 轮）', '', '### 1 · go', '', '### 2 · no go', ''].join('\n')
  assert.equal(findDuplicateOptions(reask), null)
  const changed = ['## 选项', '', '### 1 · go', 'Costs money.', '', '## 选项（第 2 轮）', '', '### 1 · ship it', ''].join('\n')
  assert.equal(findDuplicateOptions(changed), null)
  const roundRepeat = ['## 选项', '', '### 1 · go', 'Costs money.', '', '## 选项（第 2 轮）', '', '### 1 · go', ''].join('\n')
  assert.ok(findDuplicateOptions(roundRepeat), 'an empty next round repeating the labels is the same bug')
})

test('decs check reports a doubled node; --fix --dry-run changes nothing; --fix repairs it to 3 options', (t) => {
  const root = scratch()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  decs(root, ['init', '--no-register'])
  const file = join(root, 'decisions', 'active', '1-check-delivery.md')
  writeFileSync(join(root, 'decisions', '.ids', '1'), '')
  writeFileSync(file, doubled())
  assert.equal(JSON.parse(decs(root, ['get', '1', '--json'])).options.length, 6, 'the bug: six options')

  const check = decsResult(root, ['check'])
  assert.equal(check.code, 1)
  assert.match(check.stdout, /repeats the one before it with empty bodies — reads as 6 options/)

  const before = readFileSync(file, 'utf8')
  const dry = decsResult(root, ['check', '--fix', '--dry-run'])
  assert.match(dry.stdout, /would fix .*1-check-delivery\.md: drop lines \d+–\d+/)
  assert.match(dry.stdout, /nothing changed/)
  assert.equal(readFileSync(file, 'utf8'), before, 'dry run wrote nothing')

  const fix = decsResult(root, ['check', '--fix'])
  assert.equal(fix.code, 0, fix.stdout)
  assert.match(fix.stdout, /fixed .*drop lines/)
  const got = JSON.parse(decs(root, ['get', '1', '--json']))
  assert.deepEqual(got.options.map((o: { key: string }) => o.key), ['1', '2', '3'])
  assert.equal(got.options[0].body, 'A few minutes; you paste back one email header.')
  assert.equal(decsResult(root, ['check']).code, 0, 'clean afterwards')
})
