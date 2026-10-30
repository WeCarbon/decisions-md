import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BIDI_CONTROLS, bidiLine, installBidi, isolateLtr, MACHINE_PREFIX, reorderRuns, visualText } from '../src/i18n/bidi.ts'
import { stringWidth } from '../src/tui/width.ts'
import { decs } from './helpers.ts'

const MIXED = 'العقدة W12 Ship v2 جاهزة (نعم)'

test('visual mode reorders a mixed line: Arabic reversed, W12 and the English title kept in reading order', () => {
  assert.equal(visualText(MIXED), '(معن) ةزهاج W12 Ship v2 ةدقعلا')
})

test('lines without right-to-left text are left alone', () => {
  for (const line of ['W12 Ship v2 · 3 days ago', '待决策 · W5 选新手引导文案', 'À décider : W5']) {
    assert.equal(visualText(line), line)
    assert.equal(isolateLtr(line), line)
  }
})

test('styles travel with their characters when a line is reordered', () => {
  const runs = reorderRuns([
    { text: 'W12 ', style: 'ref' },
    { text: 'عقدة', style: 'title' },
  ])
  assert.deepEqual(runs, [
    { text: 'ةدقع', style: 'title' },
    { text: ' W12', style: 'ref' },
  ])
})

test('terminal mode writes logical order and isolates the left-to-right runs', () => {
  assert.equal(isolateLtr(MIXED), 'العقدة ⁦W12 Ship v2⁩ جاهزة (نعم)')
  assert.equal(bidiLine(MIXED, 'terminal'), isolateLtr(MIXED))
})

test('an isolated string is as wide as the string without isolates', () => {
  const isolated = isolateLtr(MIXED)
  assert.notEqual(isolated, MIXED)
  assert.equal(stringWidth(isolated), stringWidth(MIXED))
  assert.equal(isolated.replace(BIDI_CONTROLS, ''), MIXED)
})

test('machine prefixes stay first and left-to-right; indentation stays put', () => {
  assert.equal(bidiLine('DECS-IDLE لا أحداث W12', 'visual', MACHINE_PREFIX), 'DECS-IDLE W12 ثادحأ ال')
  assert.equal(bidiLine('since=2026-01-10T12:00:00Z رد', 'visual', MACHINE_PREFIX), 'since=2026-01-10T12:00:00Z در')
  assert.equal(bidiLine('    ابدأ decs add', 'visual'), '    decs add أدبا')
})

test('ANSI colours survive reordering', () => {
  const out = bidiLine('\x1b[36mW5\x1b[0m \x1b[2mبانتظار قرار\x1b[0m', 'visual')
  assert.equal(out.replace(/\x1b\[[0-9;]*m/g, ''), 'رارق راظتناب W5')
  assert.match(out, /\x1b\[2mرارق راظتناب\x1b\[0m/)
})

test('installBidi reorders what a terminal stream is given, line by line', () => {
  const written: string[] = []
  const stream = { write: (s: string) => (written.push(s), true), isTTY: true } as unknown as NodeJS.WriteStream
  installBidi(stream, 'visual')
  stream.write('W5 عقدة\nplain line\n')
  assert.equal(written[0], 'ةدقع W5\nplain line\n')
})

test('pipes get logical order even in Arabic, and decs config bidi is stored per user', () => {
  const home = mkdtempSync(join(tmpdir(), 'decs-home-'))
  const env = { DECS_HOME: home, DECS_LANG: 'ar', DECS_BIDI: '' }
  decs(home, ['config', 'bidi', 'terminal'], env)
  assert.equal(JSON.parse(readFileSync(join(home, 'config.json'), 'utf8')).bidi, 'terminal')
  const shown = decs(home, ['config', 'bidi'], env)
  assert.match(shown, /^terminal، من decs config bidi/)
  assert.doesNotMatch(shown, /[⁦-⁩]/)
  assert.match(decs(home, ['config', 'bidi'], { ...env, DECS_BIDI: 'visual' }), /^visual، من DECS_BIDI/)
})
