// Real rendered SupportOpsView callback-to-transport regressions, offline only.
import { after, afterEach, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const require = createRequire(process.env.HERMES_QA_PLAYWRIGHT_PACKAGE || import.meta.url)
let server, browser, context, page, url
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL('../../client/', import.meta.url)),
    server: { host: '127.0.0.1', port: 0, open: false }, logLevel: 'error' })
  await server.listen()
  url = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await require('playwright').chromium.launch({ channel: 'msedge', headless: true })
})
after(async () => { await browser?.close(); await server?.close() })
beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 384, height: 824 } })
  await context.route('**/*', route => new URL(route.request().url()).origin === url ? route.continue() : route.abort())
  page = await context.newPage()
  page.setDefaultTimeout(5000)
  await page.goto(`${url}/qa/support-voice-review.html`, { timeout: 30000 })
  await page.waitForFunction(() => Boolean(window.supportReviewQA))
  await page.getByRole('button', { name: 'Queue voice', exact: true }).click()
  await page.waitForFunction(() => Boolean(window.supportReviewQA.target))
})
afterEach(async () => { await context?.close() })
async function stage() {
  await page.evaluate(() => window.supportReviewQA.propose())
  await page.getByRole('dialog', { name: 'Review Support action', exact: true }).waitFor()
  return page.evaluate(() => window.supportReviewQA.snapshot())
}
const approve = snapshot => page.evaluate(snapshot => window.supportReviewQA.approve(snapshot), snapshot)
const approvals = () => page.evaluate(() => window.supportReviewQA.requests.filter(r => /\/voice\/reviews\/.*\/approve$/.test(r.path)))

test('Queue voice reads actual routes before capture; exact rendered snapshot approves once with unmodified transport body', async () => {
  const snapshot = await stage()
  const initial = await page.evaluate(() => ({ requests: window.supportReviewQA.requests, context: window.supportReviewQA.target.context }))
  assert.ok(initial.requests.some(r => r.path.endsWith('/health')))
  assert.ok(initial.requests.some(r => r.path.endsWith('/queue')))
  assert.ok(initial.requests.some(r => r.path.endsWith('/voice/read') && r.options.method === 'POST'))
  assert.match(JSON.stringify(initial.context), /Synthetic build issue/)
  assert.equal(snapshot.text, 'Start investigation for Synthetic build issue.\nInspect the build. Do not change files.')
  assert.deepEqual(await approve(snapshot), { ok: true })
  assert.equal((await approve(snapshot)).ok, false)
  const sent = await approvals()
  assert.equal(sent.length, 1)
  assert.equal(sent[0].host, 'host-one')
  assert.deepEqual(sent[0].body, { targetId: '100000000000000001', action: 'investigate', text: 'Inspect the build. Do not change files.' })
  assert.deepEqual(sent[0].options, { method: 'POST', timeoutMs: 30000 })
  assert.equal(await page.evaluate(() => window.supportReviewQA.snapshot()), null)
  assert.equal(await page.evaluate(() => window.supportReviewQA.receipts.length), 1)
})

test('real textarea edit invalidates old snapshot and edited words survive rerender into exact approval', async () => {
  const old = await stage()
  await page.getByRole('textbox', { name: 'Reviewed support action text' }).fill('Do not edit files. Inspect [the exact] output only.')
  await page.evaluate(() => window.supportReviewQA.rerender())
  assert.equal((await approve(old)).ok, false)
  assert.deepEqual(await approvals(), [])
  const current = await page.evaluate(() => window.supportReviewQA.snapshot())
  assert.match(current.text, /Do not edit files\. Inspect \[the exact\] output only\.$/)
  assert.deepEqual(await approve(current), { ok: true })
  assert.equal((await approvals())[0].body.text, 'Do not edit files. Inspect [the exact] output only.')
})

for (const via of ['UI', 'voice']) test(`${via} cancellation clears the ref immediately and rejects stale approval after rerender`, async () => {
  const snapshot = await stage()
  if (via === 'UI') await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  else await page.evaluate(snapshot => window.supportReviewQA.cancel(snapshot), snapshot)
  await page.evaluate(() => window.supportReviewQA.rerender())
  assert.equal(await page.evaluate(() => window.supportReviewQA.snapshot()), null)
  assert.equal((await approve(snapshot)).ok, false)
  assert.deepEqual(await approvals(), [])
})

for (const first of ['UI', 'voice']) test(`${first}-first concurrent UI and voice approval sends at most one request`, async () => {
  const snapshot = await stage()
  await page.evaluate(() => window.supportReviewQA.holdApproval())
  if (first === 'UI') {
    await page.getByRole('button', { name: 'Approve action', exact: true }).click()
    assert.equal((await approve(snapshot)).ok, false)
  } else {
    await page.evaluate(snapshot => {
      const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'Approve action')
      window.pendingSupportApproval = window.supportReviewQA.approve(snapshot)
      // Same JS task, before the shared state can rerender disabled controls.
      button.click()
    }, snapshot)
  }
  assert.equal((await approvals()).length, 1)
  await page.evaluate(() => window.supportReviewQA.releaseApproval())
  await page.waitForFunction(() => window.supportReviewQA.snapshot() === null)
  assert.equal((await approvals()).length, 1)
  assert.equal((await approve(snapshot)).ok, false)
})

for (const boundary of ['disconnect', 'replaceHost', 'unmount']) test(`${boundary} rejects the captured voice approval before transport`, async () => {
  const snapshot = await stage()
  await page.evaluate(boundary => window.supportReviewQA[boundary](), boundary)
  assert.equal((await approve(snapshot)).ok, false)
  assert.deepEqual(await approvals(), [])
})

for (const boundary of ['disconnect', 'replaceHost']) test(`${boundary} cannot send an old rendered UI review to the current transport`, async () => {
  await stage()
  await page.evaluate(boundary => window.supportReviewQA[boundary](), boundary)
  const button = page.getByRole('button', { name: 'Approve action', exact: true })
  if (await button.count() && await button.isEnabled()) await button.click()
  assert.deepEqual(await approvals(), [])
})

test('voice-owned submission renders busy and prevents edit or cancellation while request is held', async () => {
  const snapshot = await stage()
  await page.evaluate(() => window.supportReviewQA.holdApproval())
  await page.evaluate(snapshot => { window.pendingSupportApproval = window.supportReviewQA.approve(snapshot) }, snapshot)
  await page.waitForFunction(() => window.supportReviewQA.requests.some(r => /\/approve$/.test(r.path)))
  const dialog = page.getByRole('dialog', { name: 'Review Support action', exact: true })
  assert.equal(await dialog.getByRole('textbox').isDisabled(), true)
  assert.equal(await dialog.getByRole('button', { name: 'Cancel', exact: true }).isDisabled(), true)
  assert.equal(await dialog.getByRole('button', { name: 'Submitting...', exact: true }).isDisabled(), true)
  assert.doesNotMatch(await dialog.innerText(), /Nothing has run/)
  await page.evaluate(snapshot => { try { window.supportReviewQA.cancel(snapshot) } catch {} }, snapshot)
  assert.deepEqual(await page.evaluate(() => window.supportReviewQA.snapshot()), snapshot)
  await page.evaluate(() => window.supportReviewQA.releaseApproval())
  assert.deepEqual(await page.evaluate(() => window.pendingSupportApproval), { ok: true })
  assert.equal((await approvals()).length, 1)
})

for (const failure of ['refresh', 'receipt']) test(`accepted action remains accepted after ${failure} failure and cannot be sent again`, async () => {
  const snapshot = await stage()
  await page.evaluate(failure => window.supportReviewQA.failAfterAccept(failure), failure)
  assert.deepEqual(await approve(snapshot), { ok: true })
  assert.equal(await page.evaluate(() => window.supportReviewQA.snapshot()), null)
  assert.equal((await approve(snapshot)).ok, false)
  assert.equal((await approvals()).length, 1)
  if (failure === 'receipt') assert.match(await page.locator('.support-ops-screen').innerText(), /action was submitted, but the Support view could not refresh/)
  else assert.ok(await page.evaluate(() => window.supportReviewQA.errors.includes('Synthetic refresh unavailable')))
})

test('unconfirmed request failure preserves review without claiming nothing ran or automatically resubmitting', async () => {
  const snapshot = await stage()
  await page.evaluate(() => window.supportReviewQA.failSubmission())
  assert.equal((await approve(snapshot)).ok, false)
  assert.deepEqual(await page.evaluate(() => window.supportReviewQA.snapshot()), snapshot)
  const dialog = page.getByRole('dialog', { name: 'Review Support action', exact: true })
  assert.match(await dialog.innerText(), /Submission was not confirmed/)
  assert.doesNotMatch(await dialog.innerText(), /Nothing has run/)
  assert.equal(await dialog.getByRole('textbox').isEnabled(), true)
  assert.equal((await approvals()).length, 1)
})
