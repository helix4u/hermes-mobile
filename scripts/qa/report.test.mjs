import { test } from 'node:test'
import assert from 'node:assert/strict'
import { automationFailure, summarize } from './report.mjs'

test('automation diagnostics classify failure without leaking selectors or URLs', () => {
  assert.equal(automationFailure(new Error('locator: Target page, context or browser has been closed https://private.example/test')), 'Automation connection or page closed during the check.')
  assert.equal(automationFailure(new Error('Execution context was destroyed during navigation')), 'Page navigation replaced the automation execution context.')
  assert.equal(automationFailure(new Error('locator strict mode violation: a private title')), 'Automation selector matched multiple controls.')
  assert.equal(automationFailure(new Error('Timeout 4000 exceeded')), 'Automation timed out waiting for the expected control or transport.')
  assert.equal(automationFailure(new Error('device offline')), 'Automation transport became unavailable.')
  assert.ok(!automationFailure(new Error('private unknown content')).includes('private unknown content'))
})

test('only failed checks remain bug TODO while skipped and physical checks stay separate', () => {
  const result = summarize([{ id: 'a', status: 'pass', reason: 'OK' },
    { id: 'b', status: 'skip', reason: 'No active turn' },
    { id: 'c', status: 'fail', reason: 'Overlap' }], [{ id: 'd', reason: 'Needs speech' }])
  assert.equal(result.passed, 1)
  assert.equal(result.failed, 1)
  assert.equal(result.skipped, 1)
  assert.deepEqual(result.todo.map(c => c.id), ['c'])
  assert.deepEqual(result.notObserved.map(c => c.id), ['b'])
  assert.deepEqual(result.manual.map(c => c.id), ['d'])
})
