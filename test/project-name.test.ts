import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'

import { decs, decsResult, scratch } from './helpers.ts'

function setup(t: { after: (fn: () => void) => void }) {
  const base = scratch()
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const home = join(base, 'home')
  mkdirSync(home)
  const env = { DECS_HOME: home }
  const make = (folder: string) => {
    const root = join(base, folder)
    mkdirSync(root)
    decs(root, ['init', '--no-register'], env)
    decs(root, ['projects', 'add', root], env)
    return root
  }
  return { base, env, make }
}

test('decs config name: the bench and JSON show it, refs and --project accept it and the folder name', (t) => {
  const { env, make } = setup(t)
  const web = make('web')
  decs(web, ['add', 'ship it', '--task'], env)
  decs(web, ['config', 'name', 'Web', 'app', '--dir', web], env)
  assert.equal(JSON.parse(readFileSync(join(web, 'decisions', 'decs.json'), 'utf8')).name, 'Web app')

  const bench = JSON.parse(decs(web, ['bench', '--json'], env))
  assert.equal(bench.projects[0].name, 'Web app')
  assert.equal(bench.projects[0].project, 'web', 'the folder name stays the key')
  assert.equal(bench.nodes['web#1'].project_name, 'Web app')

  assert.match(decs(web, ['get', 'Web app:1'], env), /ship it/)
  assert.match(decs(web, ['get', 'web:1'], env), /ship it/)
  assert.match(decs(web, ['tree', '--project', 'Web app'], env), /ship it/)

  const listed = JSON.parse(decs(web, ['projects', '--json'], env))
  assert.equal(listed[0].display_name, 'Web app')

  decs(web, ['config', 'name', '--off', '--dir', web], env)
  assert.equal(JSON.parse(decs(web, ['bench', '--json'], env)).projects[0].name, 'web')
  assert.equal(JSON.parse(readFileSync(join(web, 'decisions', 'decs.json'), 'utf8')).name, undefined)
})

test('decs config letter: one A–Z letter, not one another registered project uses, and old refs keep resolving', (t) => {
  const { env, make } = setup(t)
  const web = make('web')
  const api = make('api')
  decs(api, ['config', 'letter', 'A', '--dir', api], env)
  decs(web, ['add', 'ship it', '--task'], env)

  const bad = decsResult(web, ['config', 'letter', 'WX', '--dir', web], env)
  assert.notEqual(bad.code, 0)
  assert.match(bad.stderr, /one capital letter/)

  const taken = decsResult(web, ['config', 'letter', 'a', '--dir', web], env)
  assert.notEqual(taken.code, 0)
  assert.match(taken.stderr, /api already uses A/)

  decs(web, ['config', 'letter', 'W', '--dir', web], env)
  decs(web, ['config', 'letter', 'N', '--dir', web], env)
  const cfg = JSON.parse(readFileSync(join(web, 'decisions', 'decs.json'), 'utf8'))
  assert.equal(cfg.letter, 'N')
  assert.deepEqual(cfg.former_letters, ['X', 'W'])

  assert.match(decs(web, ['get', 'N1', '--dir', web], env), /ship it/)
  assert.match(decs(web, ['get', 'W1', '--dir', web], env), /ship it/, 'a ref written before the change still resolves')
  assert.match(decs(web, ['get', 'X1', '--dir', web], env), /ship it/, 'so does one from before any letter was set')

  decs(web, ['config', 'letter', 'W', '--dir', web], env)
  assert.deepEqual(JSON.parse(readFileSync(join(web, 'decisions', 'decs.json'), 'utf8')).former_letters, ['X', 'N'], 'going back drops W from the old ones')
})

test('decs projects remove: by display name, says the folder stays, --json, and refuses an unknown name', (t) => {
  const { env, make } = setup(t)
  const web = make('web')
  decs(web, ['config', 'name', 'Web app', '--dir', web], env)

  const missing = decsResult(web, ['projects', 'remove', 'nothing-here'], env)
  assert.notEqual(missing.code, 0)
  assert.match(missing.stderr, /no registered project called nothing-here/)

  const out = JSON.parse(decs(web, ['projects', 'remove', 'Web app', '--json'], env))
  assert.deepEqual(out, { removed: { name: 'Web app', root: web } })
  assert.deepEqual(JSON.parse(decs(web, ['projects', '--json'], env)), [])
  assert.ok(readFileSync(join(web, 'decisions', 'decs.json'), 'utf8'), 'the project folder is untouched')

  decs(web, ['projects', 'add', web], env)
  assert.match(decs(web, ['projects', 'unlink', basename(web)], env), /untouched/)
})
