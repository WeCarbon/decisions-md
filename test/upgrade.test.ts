import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'

import { initLayout } from '../src/core/paths.ts'
import { Store } from '../src/core/store.ts'
import { rewriteOptionList } from '../src/core/upgrade.ts'
import { parseOptions } from '../src/core/parse.ts'
import { decs, decsResult, scratch } from './helpers.ts'

const entry = (id: number, status: string, link = '') =>
  `---\nid: ${id}\ntitle: t${id}\nauthor: a\nstatus: ${status}\ncreated: 2026-10-01T00:00:00+08:00\n${
    status === 'answered' ? 'answer:\n  choice: "1"\n  by: owner\n  at: 2026-10-02T00:00:00+08:00\n' : ''
  }---\n\nbody text\n\n## 选项\n\n### 1 · a\n${link ? `\n## 附件\n\n- ![x.png](${link})\n` : ''}`

/** A legacy repo: D-prefixed files, a D-prefixed child folder, D-prefixed attachments. */
function legacyRepo(root: string) {
  const l = initLayout(root)
  writeFileSync(join(l.activeDir, 'D1-root.md'), entry(1, 'open', '../attachments/D1/x.png'))
  mkdirSync(join(l.activeDir, 'D1-root'), { recursive: true })
  writeFileSync(join(l.activeDir, 'D1-root', 'D2-kid.md'), entry(2, 'answered', '../../attachments/D2/x.png'))
  writeFileSync(join(l.archivedDir, 'D3-old.md'), entry(3, 'answered'))
  for (const id of [1, 2]) {
    mkdirSync(join(l.root, 'attachments', `D${id}`), { recursive: true })
    writeFileSync(join(l.root, 'attachments', `D${id}`, 'x.png'), 'png')
  }
  for (const id of [1, 2, 3]) writeFileSync(join(l.idsDir, String(id)), '')
  return l
}

test('migrate --strip-prefix renames files, child folders and attachments, and keeps links working', (t) => {
  const root = scratch()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const l = legacyRepo(root)

  const dry = decs(root, ['migrate', '--strip-prefix', '--dry-run'])
  // The dry-run line carries a full, host-native path — on Windows that's
  // `active\D1-root.md`, not `active/D1-root.md`.
  const s = sep === '\\' ? '\\\\' : '/'
  assert.match(dry, new RegExp(`would rename  active${s}D1-root\\.md → active${s}1-root\\.md`))
  assert.ok(existsSync(join(l.activeDir, 'D1-root.md')), 'dry run touches nothing')

  decs(root, ['migrate', '--strip-prefix'])
  assert.deepEqual(readdirSync(l.activeDir).sort(), ['1-root', '1-root.md'])
  assert.deepEqual(readdirSync(join(l.activeDir, '1-root')), ['2-kid.md'])
  assert.deepEqual(readdirSync(l.archivedDir), ['3-old.md'])
  assert.deepEqual(readdirSync(join(l.root, 'attachments')).sort(), ['1', '2'])

  const store = new Store([l])
  for (const id of [1, 2]) {
    const d = store.get(id)!
    assert.ok(existsSync(join(d.file, '..', d.attachments[0].target)), `X${id}'s attachment link resolves`)
  }
  assert.equal(store.get(2)!.parent, 1)
  assert.match(decs(root, ['migrate', '--strip-prefix']), /already the latest format/, 'idempotent')
})

test('migrate --strip-prefix refuses when an id exists in both forms', (t) => {
  const root = scratch()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const l = legacyRepo(root)
  writeFileSync(join(l.activeDir, '1-dup.md'), entry(1, 'open'))
  const r = decsResult(root, ['migrate', '--strip-prefix'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /both filename styles/)
  assert.ok(existsSync(join(l.activeDir, 'D1-root.md')), 'nothing was renamed')
})

test('migrate --upgrade writes the read-time status mapping back to disk, once', (t) => {
  const root = scratch()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const l = legacyRepo(root)
  writeFileSync(join(l.root, 'queue.json'), '{"queue":[2]}')
  const before = new Store([l]).all().map((d) => [d.id, d.state])

  const dry = decs(root, ['migrate', '--upgrade', '--dry-run'])
  assert.match(dry, /status open → needs_decision/)
  assert.match(readFileSync(join(l.activeDir, 'D1-root.md'), 'utf8'), /status: open/)

  decs(root, ['migrate', '--upgrade'])
  const text = (p: string) => readFileSync(p, 'utf8')
  assert.match(text(join(l.activeDir, 'D1-root.md')), /status: needs_decision/)
  assert.match(text(join(l.activeDir, 'D1-root', 'D2-kid.md')), /status: decided/, 'answered + queued')
  assert.match(text(join(l.archivedDir, 'D3-old.md')), /status: completed/)
  assert.deepEqual(new Store([l]).all().map((d) => [d.id, d.state]), before, 'nothing anyone sees changed')
  assert.match(decs(root, ['migrate', '--upgrade']), /already the latest format/)
})

test('migrate --strip-prefix keeps --replace history and --approval-content records attached to the renamed folder', (t) => {
  const root = scratch()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const l = initLayout(root)
  // attachments already live in the legacy D folder; new attaches keep writing there until migration renames it
  writeFileSync(join(l.activeDir, 'D7-mail.md'), entry(7, 'open'))
  writeFileSync(join(l.idsDir, '7'), '')
  mkdirSync(join(l.root, 'attachments', 'D7'), { recursive: true })
  const src = join(root, 'draft.html')
  writeFileSync(src, '<p>v1</p>')
  let store = new Store([l])
  store.attach(store.get(7)!, [src], { approvalContent: true })
  writeFileSync(src, '<p>v2</p>')
  store.attach(store.get(7)!, [src], { replace: true, approvalContent: true })
  const before = store.get(7)!
  assert.equal(before.attachments[0].target, '../attachments/D7/draft.html', 'the existing legacy folder is reused')
  assert.equal(store.historyCount(before, before.attachments[0]), 1)

  decs(root, ['migrate', '--strip-prefix'])
  store = new Store([l])
  const after = store.get(7)!
  assert.equal(after.attachments[0].target, '../attachments/7/draft.html')
  assert.ok(existsSync(join(after.file, '..', after.attachments[0].target)), 'the link resolves')
  assert.equal(store.historyCount(after, after.attachments[0]), 1, 'history moved with the folder')
  assert.deepEqual(after.approvals.map((a) => a.target), ['../attachments/7/draft.html'], 'the approval record follows the link')
  assert.doesNotMatch(decs(root, ['check']), /approval record/, 'check sees no orphaned approval')

  // A later --replace updates that same record instead of starting a second one.
  writeFileSync(src, '<p>v3</p>')
  const v3 = store.attach(after, [src], { replace: true, approvalContent: true })
  assert.equal(v3.approvals.length, 1)
  assert.equal(store.historyCount(v3, v3.attachments[0]), 2)
})

// rewriteOptionList's own heading detector (src/core/upgrade.ts LIST_HEADING) is a hardcoded,
// non-localized regex matching only 选项/方案/代价 — a source-level i18n gap, same kind as
// condense()'s. The two headings below must keep those literal trigger words to actually
// exercise it; everything else here is translated.
test('rewriteOptionList turns an early numbered-list options block into ### headings, keeping every word', () => {
  const text = [
    '---', 'id: 2', 'default: "1"', '---', '', '## 选项对比', '', '| a | b |', '|---|---|', '', '## 三个方案的代价',
    '1. **Alibaba Cloud**: cheapest; cost: tight on memory.', '2. Azure B1ls: same account; cost: pricier.', '', "## If you don't answer", 'Go with 1.', '',
  ].join('\n')
  const out = rewriteOptionList(text)!
  assert.ok(out)
  const opts = parseOptions(out.split('---').slice(2).join('---'))
  assert.deepEqual(opts.map((o) => [o.key, o.label, o.body]), [
    ['1', 'Alibaba Cloud', 'cheapest; cost: tight on memory.'],
    ['2', 'Azure B1ls', 'same account; cost: pricier.'],
  ])
  assert.match(out, /## 选项对比\n\n\| a \| b \|/, 'the table heading before it is left alone')
  assert.match(out, /## If you don't answer\nGo with 1\./)
  assert.equal(rewriteOptionList('## What\n\nNo list here.\n'), null)
  assert.equal(rewriteOptionList('## 选项\n\n1. just one item: x\n'), null, 'one item is not an options list')
})
