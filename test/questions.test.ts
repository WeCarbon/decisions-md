import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'

import { parseArgs } from '../src/cli/args.ts'
import { initLayout } from '../src/core/paths.ts'
import { parseAnswerTokens, parseQuestions } from '../src/core/questions.ts'
import { Store } from '../src/core/store.ts'
import { decs, decsResult, scratch } from './helpers.ts'

const ADD = [
  'add', '3 open items in the PR review',
  '--question', 'Q1', 'asterisk in the header', '-o', 'Q1:A=keep the original', 'Q1:B=change it back to Amount [%]', '--default', 'Q1:A',
  '--question', 'Q2', 'exchange-rate case', '-o', 'Q2:1=switch', 'Q2:2=keep the skip', '--default', 'Q2:1',
  '--question', 'Q3=line items on the bill', '-o', "default:Q3:1=don't do it", 'Q3:2=do it',
]

test('args: --question takes two tokens or one, and Q1:A= is an option token', () => {
  const a = parseArgs(['--question', 'Q1', 'header', '-o', 'Q1:A=keep the original', 'Q1:B=change it', 'title'])
  assert.deepEqual(a.flags.question, ['Q1=header'])
  assert.deepEqual(a.flags.o, ['Q1:A=keep the original', 'Q1:B=change it'])
  assert.deepEqual(a._, ['title'])
})

test('add --question writes a readable 子问题 block that parses back; push Q1=B Q2=1 Q3=2', (t) => {
  const root = scratch()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  decs(root, ['init', '--no-register'])
  decs(root, ADD)

  const d = JSON.parse(decs(root, ['get', '1', '--json']))
  assert.deepEqual(d.questions.map((q: { key: string; default: string }) => [q.key, q.default]), [['Q1', 'A'], ['Q2', '1'], ['Q3', '1']])
  assert.deepEqual(d.options.map((o: { label: string }) => o.label), ['全部按默认（Q1=A Q2=1 Q3=1）', '逐条回复（Q1=… Q2=… Q3=…）'])
  assert.equal(d.default, '1')
  const text = readFileSync(d.file, 'utf8')
  assert.match(text, /## 子问题\n\n### Q1 · asterisk in the header\n\n#### A · keep the original/)
  assert.match(text, /question_defaults:\n  Q1: A/)

  assert.equal(decsResult(root, ['push', '1', 'Q1=B']).code, 1, 'strict: Q2 and Q3 not answered')
  assert.equal(decsResult(root, ['push', '1', 'Q1=Z', 'Q2=1', 'Q3=1']).code, 1, 'no option Z')
  decs(root, ['push', '1', 'Q1=B', 'Q2=1', 'Q3=2'])
  const answered = JSON.parse(decs(root, ['get', '1', '--json']))
  assert.deepEqual(answered.answers, { Q1: 'B', Q2: '1', Q3: '2' })
  assert.equal(answered.answer.choice, '2')
  assert.match(answered.body, /- Q1 = B —— change it back to Amount \[%\]\n- Q2 = 1 —— switch（默认）/)
})

test('push --defaults fills the rest; bench key 1 means all defaults; key 2 + note parses Qn=K', (t) => {
  const root = scratch()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  decs(root, ['init', '--no-register'])
  decs(root, ADD)
  decs(root, ADD)
  decs(root, ADD)

  decs(root, ['push', '1', '--defaults', 'Q2=2'])
  assert.deepEqual(JSON.parse(decs(root, ['get', '1', '--json'])).answers, { Q1: 'A', Q2: '2', Q3: '1' })

  const store = new Store([initLayout(root)])
  const viaBench = store.answer(store.get(2)!, { choice: '1', by: 'owner' })
  assert.deepEqual(viaBench.answer?.answers, { Q1: 'A', Q2: '1', Q3: '1' })
  assert.equal(viaBench.answer?.choice, '1')

  const byNote = store.answer(store.get(3)!, { choice: '2', note: 'Q1=B, Q3=2, rest unchanged', by: 'owner' })
  assert.deepEqual(byNote.answer?.answers, { Q1: 'B', Q2: '1', Q3: '2' })
})

test('--review-item: 通过 / 不通过 / 改 with the change text carried per item', (t) => {
  const root = scratch()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  decs(root, ['init', '--no-register'])
  decs(root, ['add', 'batch review of draft replies', '--review-item', 'R1', 'reply to Dave', '--review-item', 'R2', 'reply to Carol', '--default', 'R1:1'])
  const d = JSON.parse(decs(root, ['get', '1', '--json']))
  assert.deepEqual(d.questions[0].options.map((o: { label: string }) => o.label), ['通过', '不通过', '改（答复里写改法）'])
  assert.equal(d.questions[1].default, '2', 'not sending is the default for an unreviewed draft')

  decs(root, ['push', '1', 'R1=1', 'R2=3:delete the second paragraph'])
  const a = JSON.parse(decs(root, ['get', '1', '--json']))
  assert.deepEqual(a.answers, { R1: '1', R2: '3' })
  assert.deepEqual(a.answer_notes, { R2: 'delete the second paragraph' })
  assert.match(a.body, /R2 = 3 —— 改（答复里写改法）：delete the second paragraph/)
})

test('answer tokens only count when the key and option exist', () => {
  const qs = parseQuestions(['## 子问题', '', '### Q1 · x', '', '#### A · a', '#### B · b', ''].join('\n'))
  assert.deepEqual(parseAnswerTokens("F1=A doesn't count; Q1=C doesn't count; Q1=B is what counts", qs).answers, { Q1: 'B' })
})

test('a body with questions as prose ## Q1： headings is left alone', () => {
  const body = ["## Q1：the bill header's Amount*", '', 'body text', '', '## 选项', '', '### 1 · all per the recommendation', '', '### 2 · reply item by item'].join('\n')
  assert.deepEqual(parseQuestions(body), [])
})
