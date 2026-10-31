import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { BIN, decs, scratch } from './helpers.ts'

interface Seg { text: string; color?: string; bold?: boolean; dim?: boolean }
interface JsonRow { key: string; kind: string; depth: number; fold: string | null; node?: string; ref?: string; glyph?: Seg; badge?: Seg[]; collapsed?: boolean; text?: string; count?: number }
interface BenchJson {
  lang: string
  projects: { project: string; letter: string; root: string }[]
  views: { view: string; count: number | null; rows: JsonRow[] }[]
  nodes: Record<string, { ref: string; options: { key: string }[]; status: string; status_line: Seg[]; meta: Seg[][]; body_rows: { text: string; image?: number; style?: Seg }[]; images: { name: string; path: string }[]; can_default: boolean; backlinks: string[] }>
}

function project(t: { after: (fn: () => void) => void }): string {
  const root = scratch()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  decs(root, ['init', '--no-register'])
  return root
}

const benchJson = (root: string): BenchJson => JSON.parse(decs(root, ['bench', '--json', '--dir', root]))
const view = (j: BenchJson, name: string) => j.views.find((v) => v.view === name)!

test('decs bench --json: every view with its rows, glyphs and badges, without a terminal', (t) => {
  const root = project(t)
  decs(root, ['add', 'ship the docs', '--task'])
  decs(root, ['start', '1'])
  decs(root, ['progress', '40', '--node', '1'])
  decs(root, ['add', 'which cdn', '-o', 'default:1=keep the current one', '2=switch', '--parent', '1'])
  decs(root, ['add', 'later thing', '--task'])

  const j = benchJson(root)
  assert.equal(j.lang, 'en')
  assert.equal(j.projects.length, 1)
  assert.deepEqual(j.views.map((v) => v.view), ['available', 'active', 'decide', 'all', 'waiting'])
  assert.equal(view(j, 'decide').count, 1)

  const rows = view(j, 'available').rows
  const parent = rows.find((r) => r.ref === 'X1')!
  const child = rows.find((r) => r.ref === 'X2')!
  assert.equal(parent.glyph!.text, '◐')
  assert.equal(child.glyph!.text, '◆')
  assert.equal(child.depth, parent.depth + 1)
  assert.ok(parent.badge!.some((s) => s.text.includes('40%')), JSON.stringify(parent.badge))
  assert.ok(child.badge!.some((s) => s.text === 'Decide'), JSON.stringify(child.badge))

  const d = j.nodes[child.node!]
  assert.equal(d.status, 'needs_decision')
  assert.equal(d.can_default, true)
  assert.equal(d.status_line[0].text, '◆')
  assert.deepEqual(d.options.map((o) => o.key), ['1', '2'])
  assert.ok(!d.body_rows.some((r) => r.text === 'Options'), 'the live options come as data, not as body text')
})

test('decs bench --json: finished children sit under their fold row in All; attachments come with an absolute path', (t) => {
  const root = project(t)
  decs(root, ['add', 'parent', '--task'])
  decs(root, ['add', 'done kid', '--task', '--parent', '1'])
  decs(root, ['add', 'open kid', '--task', '--parent', '1'])
  decs(root, ['start', '2'])
  decs(root, ['done', '2'])
  const png = join(root, 'shot.png')
  writeFileSync(png, Buffer.from('89504e470d0a1a0a', 'hex'))
  decs(root, ['attach', '3', png])
  decs(root, ['add', 'old work', '--task'])
  decs(root, ['start', '4'])
  decs(root, ['done', '4'])

  const j = benchJson(root)
  const all = view(j, 'all').rows
  const fold = all.find((r) => r.kind === 'fold')!
  assert.equal(fold.count, 1)
  assert.doesNotMatch(fold.text!, /expand/i)
  assert.equal(all.find((r) => r.ref === 'X2')!.fold, fold.key)
  assert.equal(all.find((r) => r.ref === 'X3')!.fold, null)

  const kid = j.nodes[all.find((r) => r.ref === 'X3')!.node!]
  assert.equal(kid.images.length, 1)
  assert.ok(kid.images[0].path.startsWith('/'), kid.images[0].path)

  assert.ok(all.some((r) => r.ref === 'X4'))
  assert.equal(j.nodes[all.find((r) => r.ref === 'X4')!.node!], undefined, 'archived nodes are listed, not detailed')
  const done = JSON.parse(decs(root, ['bench', '--json', '--node', '4', '--dir', root]))
  assert.equal(done.ref, 'X4')
  assert.equal(done.status, 'completed')
  assert.ok(Array.isArray(done.body_rows))
})

test('decs monitor --updates: an agent writing progress is a line, which plain monitor never reports', async (t) => {
  const root = project(t)
  const home = scratch()
  t.after(() => rmSync(home, { recursive: true, force: true }))
  decs(root, ['add', 'long job', '--task'])
  decs(root, ['start', '1'])
  const child = spawn(process.execPath, [BIN, 'monitor', '--updates', '--json', '--interval', '200', '--idle-exit', '0'], {
    cwd: root,
    env: { ...process.env, NO_COLOR: '1', DECS_AUTHOR: 'cli-test · lane', CLAUDECODE: '1', DECS_HOME: home },
  })
  let out = ''
  let err = ''
  child.stdout.on('data', (b) => (out += b))
  child.stderr.on('data', (b) => (err += b))
  t.after(() => child.kill())
  const until = async (ok: () => boolean, what: string) => {
    for (const end = Date.now() + 10_000; !ok(); await new Promise((r) => setTimeout(r, 50)))
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}: ${out}${err}`)
  }
  await until(() => err.includes('decs monitor: watching'), 'the monitor to start')
  await new Promise((r) => setTimeout(r, 300))
  assert.equal(out, '', 'nothing on start: the first pass only takes stock')
  decs(root, ['progress', '50', '--node', '1'])
  await until(() => out.includes('"updated"'), 'the updated line')
  const line = JSON.parse(out.trim().split('\n')[0])
  assert.deepEqual(line.refs, ['X1'])
  assert.deepEqual(line.gone, [])
})
