import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'

import { decs, decsResult, scratch } from './helpers.ts'

test('supersede closes the old node and links both ways', (t) => {
  const root = scratch()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  decs(root, ['init', '--no-register'])
  decs(root, ['add', 'how to change the old flow', '-o', '1=change it'])
  decs(root, ['add', 'how to change the new flow', '-o', '1=change it'])
  decs(root, ['supersede', '1', '--by', '2'])

  const old = JSON.parse(decs(root, ['get', '1', '--json']))
  assert.equal(old.status, 'closed')
  assert.equal(old.close_reason, 'superseded')
  assert.equal(old.superseded_by, 2)
  assert.ok(old.archived)
  assert.match(old.body, /被 X2 取代/)
  assert.deepEqual(JSON.parse(decs(root, ['get', '2', '--json'])).supersedes, [1])
  assert.match(decs(root, ['get', '2']), /supersedes X1/)
  assert.equal(decsResult(root, ['supersede', '2', '--by', '2']).code, 1)
})

test('references in bodies: refs out, referenced_by back', (t) => {
  const root = scratch()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  decs(root, ['init', '--no-register', '--letter', 'T'])
  decs(root, ['add', 'the one being referenced'])
  decs(root, ['add', 'the referencer'], {})
  decs(root, ['note', '2', 'see this together with D1; F1 and T3 are subheadings, not references'])
  decs(root, ['note', '1', "mentioning your own T1 doesn't count"])

  const one = JSON.parse(decs(root, ['get', '1', '--json']))
  assert.deepEqual(one.referenced_by, ['T2'])
  assert.deepEqual(JSON.parse(decs(root, ['get', '2', '--json'])).refs, ['T1'])
  assert.match(decs(root, ['get', '1']), /referenced by T2/)
})

test('search covers title, body, follow-ups and attachment names; --all reaches the archive', (t) => {
  const root = scratch()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  decs(root, ['init', '--no-register'])
  decs(root, ['add', 'ship release', '--task'])
  decs(root, ['note', '1', 'Carol says the CDN changed again'])
  decs(root, ['add', 'archived carol item', '--task'])
  decs(root, ['done', '2'])

  assert.deepEqual(JSON.parse(decs(root, ['search', 'carol', '--json'])).map((d: { id: number }) => d.id), [1])
  assert.deepEqual(JSON.parse(decs(root, ['search', 'carol', '--all', '--json'])).map((d: { id: number }) => d.id).sort(), [1, 2])
  assert.deepEqual(JSON.parse(decs(root, ['search', 'carol', 'CDN', '--json'])).length, 1, 'all words must match')
  assert.match(decs(root, ['search', 'nothing-here']), /nothing found/)
})

test('fyi: filed as done at once, kept out of the owner list, shown by show fyi', (t) => {
  const root = scratch()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  decs(root, ['init', '--no-register'])
  decs(root, ['add', 'ship complete', '--fyi'])
  const d = JSON.parse(decs(root, ['get', '1', '--json']))
  assert.equal(d.kind, 'fyi')
  assert.equal(d.status, 'completed')
  assert.equal(decs(root, ['show']).trim(), 'No nodes need a decision.')
  assert.match(decs(root, ['show', 'fyi']), /ship complete/)
  assert.doesNotMatch(decs(root, ['show', 'archived']), /ship complete/, 'only listed when asked for')
})
