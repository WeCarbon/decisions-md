import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseLegacyActive, parseLegacyArchive, toDecision } from '../src/migrate/legacy.ts'
import { parseDecision } from '../src/core/parse.ts'
import { serializeDecision } from '../src/core/serialize.ts'
import { setLang } from '../src/i18n/index.ts'

// This file's expectations are written in English; legacy.ts's warnings are
// English in the source, so run this suite's in-process calls in English too.
setLang('en')

const BIN = fileURLToPath(new URL('../bin/decs.ts', import.meta.url))
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url))
const ENV_EN = { ...process.env, DECS_LANG: 'en' }

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8')
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'decs-migrate-test-'))
}

// --- active file: heading variants -----------------------------------------

test('parseLegacyActive skips the hand-written index and finds every ## D heading', () => {
  const entries = parseLegacyActive(fixture('active-sample.md'))
  assert.deepEqual(
    entries.map((e) => e.id),
    [10, 11, 12, 13, 14],
  )
})

test('full-width-paren heading splits into author + title on the first ）·', () => {
  const [d10] = parseLegacyActive(fixture('active-sample.md'))
  assert.equal(d10.title, 'should the deploy script connect to Foundry')
  // the 提出者 blockquote is the authoritative source, not the heading parens
  assert.equal(d10.author, 'sample-lane（lane）· a one-off, read-only look at the deploy config')
})

test('a heading with no parens splits on the bare · separator', () => {
  const [, d11] = parseLegacyActive(fixture('active-sample.md'))
  assert.equal(d11.title, 'a heading with no full-width parens — straight into the dot separator')
  assert.equal(d11.author, 'other-lane · a question picked up along the way')
})

test('parens with no trailing · are part of the title, not an author', () => {
  const [, , d12] = parseLegacyActive(fixture('active-sample.md'))
  assert.equal(d12.title, '（the title itself has parens, with no dot separator, so the whole thing becomes the title）')
})

test('a title containing its own · still splits on the first ）·', () => {
  const [, , , d13] = parseLegacyActive(fixture('active-sample.md'))
  assert.equal(d13.title, 'option A given in inline bold style —— the title itself also has a · separator')
})

test('legacy titles containing 验收 or 等你看一眼 are recognised as acceptance', () => {
  const [, , , , d14] = parseLegacyActive(fixture('active-sample.md'))
  assert.equal(d14.isAcceptance, true)
  assert.equal(d10Kind(), false)
  function d10Kind() {
    return parseLegacyActive(fixture('active-sample.md'))[0].isAcceptance
  }
})

// --- option styles -----------------------------------------------------

test('numbered option style (1. **label.** body)', () => {
  const [d10] = parseLegacyActive(fixture('active-sample.md'))
  assert.deepEqual(
    d10.options.map((o) => o.key),
    ['1', '2'],
  )
  assert.equal(d10.options[0].label, 'Keep it as is: stay on the direct connection')
  assert.equal(d10.default, '1')
})

test('bulleted option style (- **A：label.** body)', () => {
  const [, d11] = parseLegacyActive(fixture('active-sample.md'))
  assert.deepEqual(
    d11.options.map((o) => o.key),
    ['A', 'B'],
  )
  assert.equal(d11.default, 'A')
})

test('inline-bold option style (**选项 A —— label.** body)', () => {
  const [, , , d13] = parseLegacyActive(fixture('active-sample.md'))
  assert.deepEqual(
    d13.options.map((o) => o.key),
    ['A', 'B'],
  )
  assert.equal(d13.options[0].label, 'stay as is')
})

test('an entry with no options block extracts zero options and no warning about it', () => {
  const [, , d12] = parseLegacyActive(fixture('active-sample.md'))
  assert.deepEqual(d12.options, [])
  assert.deepEqual(d12.warnings, [])
})

// --- archive: heading suffix, answers, --- splitting ------------------------

test('archive heading with a trailing 已答「…」 suffix is stripped from the title', () => {
  const [d20] = parseLegacyArchive(fixture('archive-sample.md'))
  assert.equal(d20.title, 'how strict should the deploy gate be')
  assert.equal(d20.author, 'deploy-lane lane · moved the deploy script onto a local path')
})

test('a bold **已答（by，at）。** marker resolves status, note and choice', () => {
  const [d20] = parseLegacyArchive(fixture('archive-sample.md'))
  assert.ok(d20.answer)
  assert.equal(d20.answer?.choice, 'A')
  assert.match(d20.answer?.note ?? '', /Strict/)
})

test('--- on its own line splits archive entries', () => {
  const entries = parseLegacyArchive(fixture('archive-sample.md'))
  assert.deepEqual(
    entries.map((e) => e.id),
    [20, 21, 22],
  )
})

test('an answer note that never restates an option key leaves choice unset', () => {
  const [, d21] = parseLegacyArchive(fixture('archive-sample.md'))
  assert.ok(d21.answer)
  assert.equal(d21.answer?.choice, undefined)
  assert.match(d21.answer?.note ?? '', /backend search/)
})

test('an archived entry with no extractable answer marker is still marked answered (empty note), not left open', () => {
  // decisions/archived/ means resolved; `status: open` there would be
  // self-contradictory and would make `decs check`/`decs queue` lie.
  const [, , d22] = parseLegacyArchive(fixture('archive-sample.md'))
  assert.ok(d22.answer)
  assert.equal(d22.answer?.by, 'legacy')
  assert.equal(d22.answer?.note, undefined)
  assert.ok(d22.warnings.some((w) => w.includes('marked answered with an empty note')))
  assert.deepEqual(
    d22.options.map((o) => o.key),
    ['A', 'B'],
  )
})

// --- archive: a D<a>–D<b> batch heading stays ONE entry ---------------------
// one block = one file: the outer heading's id wins; a nested `## D<id>` heading stays verbatim in the body, flagged rather than split out

test('a D<a>–D<b> batch heading produces exactly one entry, under the outer id', () => {
  const entries = parseLegacyArchive(fixture('archive-batch.md'))
  assert.equal(entries.length, 1)
  assert.equal(entries[0].id, 5)
  assert.equal(entries[0].date, '2026-08-29')
})

test('the batch entry keeps the first nested heading\'s title/author and flags the rest', () => {
  const [d5] = parseLegacyArchive(fixture('archive-batch.md'))
  assert.equal(d5.title, 'the first entry carried over in the batch migration')
  assert.equal(d5.author, 'batch-a（lane）· migrating the old archive')
  assert.ok(d5.warnings.some((w) => w.includes('D6') && w.includes('kept as body text')))
})

test('the unsplit nested entry\'s full text survives verbatim in the body', () => {
  const [d5] = parseLegacyArchive(fixture('archive-batch.md'))
  assert.match(d5.body, /## D6 · the second entry carried over in the batch migration/)
  assert.match(d5.body, /try a different approach/)
})

test('a quoted "owner 的答复" right above the kept heading is attributed to the owner, not lead', () => {
  const [d5] = parseLegacyArchive(fixture('archive-batch.md'))
  assert.equal(d5.answer?.by, 'owner')
  assert.match(d5.answer?.note ?? '', /keep things as they are/)
})

// --- toDecision + round trip through the real serializer/parser -------------

test('toDecision output round-trips through serializeDecision/parseDecision', () => {
  const [d10] = parseLegacyActive(fixture('active-sample.md'))
  const decision = toDecision(d10, 'sample-project')
  const text = serializeDecision(decision)
  const reparsed = parseDecision(text, '/x/decisions/active/D10-x.md', false, 'sample-project')

  assert.equal(reparsed.id, 10)
  assert.equal(reparsed.title, d10.title)
  assert.equal(reparsed.author, d10.author)
  assert.equal(reparsed.status, 'open')
  assert.deepEqual(
    reparsed.options.map((o) => o.key),
    ['1', '2'],
  )
  assert.match(reparsed.body, /What it is\./)
})

test('an archived, answered legacy entry round-trips as status: answered', () => {
  const [d20] = parseLegacyArchive(fixture('archive-sample.md'))
  const decision = toDecision(d20, 'sample-project')
  const text = serializeDecision(decision)
  const reparsed = parseDecision(text, '/x/decisions/archived/D20-x.md', true, 'sample-project')

  assert.equal(reparsed.status, 'answered')
  assert.equal(reparsed.answer?.choice, 'A')
})

// --- CLI: decs migrate end to end -------------------------------------------

test('decs migrate --dry-run touches nothing and reports counts', () => {
  const dir = scratch()
  try {
    writeFileSync(join(dir, 'DECISIONS.md'), fixture('active-sample.md'))
    writeFileSync(join(dir, 'DECISIONS.old.md'), fixture('archive-sample.md'))

    const out = execFileSync('node', [BIN, 'migrate', '--dir', dir, '--dry-run'], { encoding: 'utf8', env: ENV_EN })
    assert.match(out, /active:\s+5 parsed/)
    assert.match(out, /archived:\s+3 parsed/)
    assert.match(out, /dry run — nothing was written\./)
    assert.equal(existsDecisionsDir(dir), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('decs migrate writes one file per entry, split active/archived, plus .ids reservations', () => {
  const dir = scratch()
  try {
    writeFileSync(join(dir, 'DECISIONS.md'), fixture('active-sample.md'))
    writeFileSync(join(dir, 'DECISIONS.old.md'), fixture('archive-sample.md'))

    execFileSync('node', [BIN, 'migrate', '--dir', dir], { encoding: 'utf8' })

    const active = readdirSync(join(dir, 'decisions', 'active'))
    const archived = readdirSync(join(dir, 'decisions', 'archived'))
    const ids = readdirSync(join(dir, 'decisions', '.ids'))
    assert.equal(active.length, 5)
    assert.equal(archived.length, 3)
    assert.deepEqual(ids.sort((a, b) => Number(a) - Number(b)), ['10', '11', '12', '13', '14', '20', '21', '22'])

    // legacy files are untouched
    assert.match(readFileSync(join(dir, 'DECISIONS.md'), 'utf8'), /## D10/)
    assert.match(readFileSync(join(dir, 'DECISIONS.old.md'), 'utf8'), /D20/)

    // re-parsing a written file through the real parser recovers id/title/author
    const d10File = active.find((f) => f.startsWith('D10-'))!
    const reparsed = parseDecision(readFileSync(join(dir, 'decisions', 'active', d10File), 'utf8'), d10File, false, 'x')
    assert.equal(reparsed.id, 10)
    assert.equal(reparsed.title, 'should the deploy script connect to Foundry')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('decs migrate refuses to overwrite an existing entry file without --force', () => {
  const dir = scratch()
  try {
    writeFileSync(join(dir, 'DECISIONS.md'), fixture('active-sample.md'))
    execFileSync('node', [BIN, 'migrate', '--dir', dir], { encoding: 'utf8' })

    const out = execFileSync('node', [BIN, 'migrate', '--dir', dir], { encoding: 'utf8', env: ENV_EN })
    assert.match(out, /skipped:\s+5/)

    const forced = execFileSync('node', [BIN, 'migrate', '--dir', dir, '--force'], { encoding: 'utf8', env: ENV_EN })
    assert.match(forced, /active:\s+5 parsed, 5 written/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

function existsDecisionsDir(dir: string): boolean {
  try {
    readdirSync(join(dir, 'decisions'))
    return true
  } catch {
    return false
  }
}
