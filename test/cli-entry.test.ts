import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commandFor } from '../src/cli/index.ts'
import { decsResult, scratch } from './helpers.ts'

test('a bare decs opens the bench on a terminal and prints the usage when piped', () => {
  assert.equal(commandFor(undefined, true), 'bench')
  assert.equal(commandFor(undefined, false), 'help')
})

test('--help, -h and help print the usage on a terminal too; any other word is the command', () => {
  for (const word of ['--help', '-h', 'help']) assert.equal(commandFor(word, true), 'help')
  assert.equal(commandFor('show', true), 'show')
  assert.equal(commandFor('bench', false), 'bench')
})

test('a bare decs in a pipe prints the usage, which mentions it, and exits 0', () => {
  const r = decsResult(scratch(), [], { DECS_LANG: 'en' })
  assert.equal(r.code, 0)
  assert.match(r.stdout, /^decs — /)
  assert.match(r.stdout, /on a terminal, the same as decs bench; piped, prints this help/)
})

test('the plugin entry runs a command once and exits 0 — regression: it imported bin/decs.ts, which runs main itself and exports nothing', async () => {
  const { spawnSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const entry = fileURLToPath(new URL('../plugin/run-cli.mjs', import.meta.url))
  const r = spawnSync(process.execPath, [entry, '--version'], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.trim().split('\n').length, 1)
  assert.match(r.stdout, /^decs \d/)
})
