// Real Mobile hook and rendered review, synthetic transport only. No provider.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { saveReport } from './report.mjs'

const { values } = parseArgs({ options: { out: { type: 'string' }, 'playwright-package': { type: 'string' } } })
if (!values.out || !values['playwright-package']) throw Error('Required: --out <private directory> --playwright-package <package.json>')
const require = createRequire(values['playwright-package'])
const report = { schema: 1, layer: 'isolated-real-hook', startedAt: new Date().toISOString(), checks: [],
  manual: [{ id: 'REQUEST-PROVIDER-DEVICE', reason: 'Live provider, physical device and busy-queue acceptance remain untested. Current host schemas support unique expectedDraft edits. Duplicate text requires the visible request card.' }] }
let server, browser, context, page, next = 0
async function check(id, action) {
  try { await action(); report.checks.push({ id, status: 'pass', reason: 'Exact-request review behavior verified through the real hook and rendered UI with synthetic transport.' }); console.log(`${id}: pass`) }
  catch (error) { report.checks.push({ id, status: 'fail', reason: String(error.message) }); console.log(`${id}: fail: ${error.message}`) }
}
async function fresh(engine = 'realtime', query = '') {
  await page.goto(`${url}/qa/realtime.html?voicePage${query}`, { timeout: 30000 })
  await page.waitForFunction(() => !!window.qa)
  await page.evaluate(async engine => {
    const q = window.qa
    q.realtime.setSettings({ ...q.realtime.settings, engine, approval: 'on' })
    await q.realtime.start()
    if (engine === 'live') q.frame({ type: 'session.started', session: { id: 'live_synthetic' } })
  }, engine)
  await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'listening')
}
async function tool(engine, args, name = 'draft_hermes_request') {
  const id = `multiple-request-${++next}`
  await page.evaluate(({ engine, id, args, name }) => {
    const q = window.qa
    if (engine === 'live') {
      const frame = event => q.frame({ type: 'response.event', delegation_id: 'synthetic-delegation', event })
      frame({ type: 'response.created', response: { id } })
      frame({ type: 'response.output_item.done', item: { type: 'function_call', call_id: id, name, arguments: JSON.stringify(args) } })
      frame({ type: 'response.completed', response: { id, output: [] } })
    } else {
      const metadata = q.sent.filter(event => event.type === 'response.create').at(-1).response.metadata
      q.frame({ type: 'response.created', response: { id, metadata } })
      q.frame({ type: 'response.done', response: { id, status: 'completed', output: [
        { type: 'function_call', call_id: id, name, arguments: JSON.stringify(args) }] } })
    }
  }, { engine, id, args, name })
  await page.waitForFunction(id => window.qa.sent.some(event => event.item?.call_id === id && event.item?.output), id)
  return page.evaluate(id => JSON.parse(window.qa.sent.find(event => event.item?.call_id === id && event.item?.output).item.output), id)
}
async function rows() { return page.evaluate(() => window.qa.realtime.snapshot.hermesRequests) }
let url
try {
  server = await createServer({ root: fileURLToPath(new URL('../../client/', import.meta.url)),
    server: { host: '127.0.0.1', port: 0, open: false }, logLevel: 'error' })
  await server.listen()
  url = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await require('playwright').chromium.launch({ channel: 'msedge', headless: true })
  context = await browser.newContext({ viewport: { width: 384, height: 824 } })
  await context.route('**/*', route => new URL(route.request().url()).origin === url ? route.continue() : route.abort())
  page = await context.newPage()
  page.setDefaultTimeout(7000)
  for (const engine of ['realtime', 'live']) {
    await check(`MULTI-TOOLS-${engine}`, async () => {
      await fresh(engine)
      const first = await tool(engine, { message: 'Answer a quick question.' })
      const second = await tool(engine, { message: 'Investigate a long-running task.' })
      assert.notEqual(first.requestId, second.requestId)
      assert.equal((await rows()).length, 2)
      const before = await rows()
      const ambiguous = await tool(engine, { expectedDraft: 'Not a current request.', message: 'Stale replacement.' })
      assert.match(ambiguous.error, /Stale/)
      assert.deepEqual(await rows(), before)
      // Exercise only arguments advertised by the existing host tool schema.
      const edited = await tool(engine, { expectedDraft: first.draft, message: 'Answer this exact question.' })
      assert.equal(edited.requestId, first.requestId)
      assert.equal(edited.revision, 2)
      assert.equal(await page.evaluate(() => window.qa.realtime.snapshot.selectedHermesRequestId), second.requestId)
      const staleBefore = await rows()
      assert.match((await tool(engine, { requestId: first.requestId, expectedRevision: 1, message: 'Stale replacement.' })).error, /Stale/)
      assert.deepEqual(await rows(), staleBefore)
      const evidence = await tool(engine, {}, 'get_session_activity')
      assert.deepEqual(evidence.voiceRequest.requests.map(row => row.requestId), [first.requestId, second.requestId])
      assert.equal(evidence.voiceRequest.selectedRequestId, second.requestId)
      assert.equal(await page.evaluate(() => window.qa.approved.length), 0)
      if (engine === 'live') await page.evaluate(() => window.qa.frame({ type: 'session.input_transcript.delta', delta: 'Yes send it. Cancel that.', start_ms: 100, end_ms: 400 }))
      else await page.evaluate(() => {
        window.qa.frame({ type: 'input_audio_buffer.speech_started', item_id: 'test-speech' })
        window.qa.frame({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'test-speech', transcript: 'Yes send it. Cancel that.' })
      })
      assert.deepEqual(await rows(), staleBefore)
      assert.equal(await page.evaluate(() => window.qa.approved.length), 0)
    })
    await check(`MULTI-UI-${engine}`, async () => {
      await fresh(engine)
      const first = await tool(engine, { message: 'First quick question.' })
      const second = await tool(engine, { message: 'Second long-running task.' })
      const select = page.getByLabel('Request being reviewed')
      await select.selectOption(first.requestId)
      await page.getByLabel('Hermes request draft').fill('Edited first question.')
      await page.getByRole('button', { name: 'Add another request', exact: true }).click()
      assert.equal((await rows()).length, 3)
      assert.equal(await page.getByRole('button', { name: 'Send to Hermes', exact: true }).isDisabled(), true)
      await page.getByLabel('Hermes request draft').fill('Third independent message.')
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      assert.deepEqual((await rows()).map(row => row.requestId), [first.requestId, second.requestId])
      await select.selectOption(first.requestId)
      await page.getByRole('button', { name: 'Send to Hermes', exact: true }).click()
      await page.waitForFunction(() => window.qa.approved.length === 1 && window.qa.realtime.snapshot.hermesDraftStatus === 'sent')
      const approved = await page.evaluate(() => window.qa.approved[0])
      assert.equal(approved.requestId, first.requestId)
      assert.equal(approved.displayText, 'Edited first question.')
      assert.equal((await rows()).find(row => row.requestId === second.requestId).status, 'pending')
      assert.equal(await page.getByRole('button', { name: 'Send to Hermes', exact: true }).count(), 0)
      await select.selectOption(second.requestId)
      assert.equal(await page.getByLabel('Hermes request draft').inputValue(), 'Second long-running task.')
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      assert.equal((await rows()).length, 1)
      assert.equal(await page.evaluate(() => window.qa.approved.length), 1)
    })
  }
  for (const outcome of ['accepted', 'uncertain']) {
    await check(`MULTI-RECONNECT-${outcome}`, async () => {
      await fresh()
      const first = await tool('realtime', { message: 'First reviewed request.' })
      await page.evaluate(() => window.qa.holdApproval())
      await page.getByRole('button', { name: 'Send to Hermes', exact: true }).click()
      await page.waitForFunction(() => window.qa.approved.length === 1)
      await page.getByRole('button', { name: 'Add another request', exact: true }).click()
      await page.getByLabel('Hermes request draft').fill('Another message while first is sending.')
      const second = (await rows())[1]
      assert.equal(await page.getByRole('button', { name: 'Send to Hermes', exact: true }).isDisabled(), true)
      await page.evaluate(() => window.qa.disconnect())
      await page.waitForFunction(() => window.qa.tracks.length === 2 && window.qa.realtime.snapshot.status === 'listening')
      assert.equal((await rows())[0].status, 'submitting')
      await page.evaluate(outcome => { if (outcome === 'accepted') window.qa.releaseApproval(); else window.qa.rejectApproval() }, outcome)
      await page.waitForFunction(outcome => window.qa.realtime.snapshot.hermesRequests[0].status === (outcome === 'accepted' ? 'sent' : 'uncertain'), outcome)
      assert.equal(await page.evaluate(() => window.qa.realtime.snapshot.selectedHermesRequestId), second.requestId)
      assert.equal(await page.getByLabel('Hermes request draft').inputValue(), second.message)
      assert.equal(await page.getByRole('button', { name: 'Send to Hermes', exact: true }).isDisabled(), false)
      await page.getByLabel('Request being reviewed').selectOption(first.requestId)
      assert.equal(await page.getByRole('button', { name: 'Send to Hermes', exact: true }).count(), 0)
      if (outcome === 'uncertain') {
        assert.match(await page.getByRole('region', { name: 'Active Hermes request' }).textContent(), /Delivery is unconfirmed/)
        assert.equal(await page.getByLabel('Hermes request draft').isDisabled(), true)
      }
      assert.equal(await page.evaluate(() => window.qa.approved.length), 1)
    })
  }
  await check('MULTI-LIVE-TRANSPORT-PRESERVES', async () => {
    await fresh('live')
    await tool('live', { message: 'First message.' })
    await tool('live', { message: 'Second message.' })
    const before = await rows()
    await page.evaluate(() => window.qa.frame({ type: 'error', error: { message: 'Synthetic tool transport failed' } }))
    await page.waitForFunction(() => !window.qa.realtime.snapshot.active)
    assert.deepEqual(await rows(), before)
    await page.getByLabel('Request being reviewed').selectOption(before[0].requestId)
    await page.getByRole('button', { name: 'Send to Hermes', exact: true }).click()
    await page.waitForFunction(() => window.qa.approved.length === 1 && window.qa.realtime.snapshot.hermesRequests[0].status === 'sent')
    assert.equal((await rows())[1].status, 'pending')
  })
  await check('MULTI-LIVE-TRANSPORT-INFLIGHT', async () => {
    await fresh('live')
    const first = await tool('live', { message: 'First message with a held receipt.' })
    await page.evaluate(() => window.qa.holdApproval())
    await page.getByRole('button', { name: 'Send to Hermes', exact: true }).click()
    await page.waitForFunction(() => window.qa.approved.length === 1)
    await page.getByRole('button', { name: 'Add another request', exact: true }).click()
    await page.getByLabel('Hermes request draft').fill('Second retained message.')
    const second = (await rows())[1]
    await page.evaluate(() => window.qa.frame({ type: 'error', error: { message: 'Synthetic provider transport failed' } }))
    await page.waitForFunction(() => !window.qa.realtime.snapshot.active)
    assert.equal((await rows())[0].status, 'submitting')
    await page.evaluate(() => window.qa.releaseApproval())
    await page.waitForFunction(() => window.qa.realtime.snapshot.hermesRequests[0].status === 'sent')
    assert.equal((await rows())[0].requestId, first.requestId)
    assert.equal(await page.evaluate(() => window.qa.realtime.snapshot.selectedHermesRequestId), second.requestId)
    await page.evaluate(async () => {
      await window.qa.realtime.start()
      window.qa.frame({ type: 'session.started', session: { id: 'live_synthetic' } })
    })
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'listening')
    assert.equal((await rows())[1].status, 'pending')
    await page.getByRole('button', { name: 'Send to Hermes', exact: true }).click()
    await page.waitForFunction(() => window.qa.approved.length === 2)
    await page.evaluate(() => window.qa.releaseApproval())
    await page.waitForFunction(() => window.qa.realtime.snapshot.hermesRequests[1].status === 'sent')
    assert.equal((await rows())[1].requestId, second.requestId)
  })
  await check('MULTI-CONSTRAINED-LAYOUT', async () => {
    await fresh()
    await tool('realtime', { message: 'LongWord'.repeat(100) })
    await tool('realtime', { message: 'Another independent message.' })
    for (const viewport of [{ width: 760, height: 360 }, { width: 384, height: 420 }]) {
      await page.setViewportSize(viewport)
      for (const control of [page.getByLabel('Request being reviewed'), page.getByLabel('Hermes request draft'),
        page.getByRole('button', { name: 'Send to Hermes', exact: true }), page.getByRole('button', { name: 'Add another request', exact: true })]) {
        await control.scrollIntoViewIfNeeded()
        const box = await control.boundingBox()
        assert.ok(box && box.x >= -1 && box.x + box.width <= viewport.width + 1 && box.y >= -1 && box.y + box.height <= viewport.height + 1,
          'Review control is unreachable or overflows the constrained voice page')
      }
    }
    assert.equal(await page.evaluate(() => window.qa.approved.length), 0)
    await page.setViewportSize({ width: 384, height: 824 })
  })
} finally {
  await browser?.close()
  await server?.close()
  await saveReport(values.out, report)
}
if (report.checks.some(check => check.status === 'fail')) process.exitCode = 1
