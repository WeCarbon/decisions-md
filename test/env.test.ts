import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nodditEnv, nodditEnvHit, nodditNodeEnv, setNodditEnv } from '../src/core/env.ts'

// ---------------------------------------------------------------------------
// nodditEnv / nodditEnvHit — NODDIT_<suffix> wins, DECS_<suffix> still works
// ---------------------------------------------------------------------------

test('nodditEnv reads NODDIT_<suffix> when only that is set', () => {
  assert.equal(nodditEnv('AUTHOR', { NODDIT_AUTHOR: 'lead · x' }), 'lead · x')
})

test('nodditEnv falls back to DECS_<suffix> when NODDIT_<suffix> is not set', () => {
  assert.equal(nodditEnv('AUTHOR', { DECS_AUTHOR: 'lead · x' }), 'lead · x')
})

test('nodditEnv: NODDIT_<suffix> wins over DECS_<suffix> when both are set', () => {
  assert.equal(nodditEnv('AUTHOR', { NODDIT_AUTHOR: 'new', DECS_AUTHOR: 'old' }), 'new')
})

test('nodditEnv is undefined when neither variable is set', () => {
  assert.equal(nodditEnv('AUTHOR', {}), undefined)
})

test('nodditEnv treats an empty string as set, not missing', () => {
  assert.equal(nodditEnv('TEAMMATE', { DECS_TEAMMATE: '' }), '')
  assert.equal(nodditEnv('TEAMMATE', { NODDIT_TEAMMATE: '', DECS_TEAMMATE: 'lane-a' }), '', 'NODDIT_TEAMMATE="" still wins, even empty')
})

test('nodditEnvHit names which variable actually supplied the value', () => {
  assert.deepEqual(nodditEnvHit('HOME', { NODDIT_HOME: '/x' }), { name: 'NODDIT_HOME', value: '/x' })
  assert.deepEqual(nodditEnvHit('HOME', { DECS_HOME: '/y' }), { name: 'DECS_HOME', value: '/y' })
  assert.deepEqual(nodditEnvHit('HOME', { NODDIT_HOME: '/x', DECS_HOME: '/y' }), { name: 'NODDIT_HOME', value: '/x' })
  assert.equal(nodditEnvHit('HOME', {}), undefined)
})

// ---------------------------------------------------------------------------
// nodditNodeEnv — NODE, then the older TASK alias, each NODDIT_ before DECS_
// ---------------------------------------------------------------------------

test('nodditNodeEnv checks NODE before the older TASK alias, NODDIT_ before DECS_ for each', () => {
  assert.equal(nodditNodeEnv({ NODDIT_NODE: '1' }), '1')
  assert.equal(nodditNodeEnv({ DECS_NODE: '2' }), '2')
  assert.equal(nodditNodeEnv({ NODDIT_TASK: '3' }), '3')
  assert.equal(nodditNodeEnv({ DECS_TASK: '4' }), '4')
  assert.equal(nodditNodeEnv({ NODDIT_NODE: '1', DECS_NODE: '2', NODDIT_TASK: '3', DECS_TASK: '4' }), '1')
  assert.equal(nodditNodeEnv({ DECS_NODE: '2', NODDIT_TASK: '3', DECS_TASK: '4' }), '2')
  assert.equal(nodditNodeEnv({ NODDIT_TASK: '3', DECS_TASK: '4' }), '3')
  assert.equal(nodditNodeEnv({}), undefined)
})

// ---------------------------------------------------------------------------
// setNodditEnv — a child process sees both names
// ---------------------------------------------------------------------------

test('setNodditEnv sets both NODDIT_<suffix> and DECS_<suffix> on a child env', () => {
  const env: NodeJS.ProcessEnv = {}
  setNodditEnv(env, 'REF', 'W12')
  assert.equal(env.NODDIT_REF, 'W12')
  assert.equal(env.DECS_REF, 'W12')
})
