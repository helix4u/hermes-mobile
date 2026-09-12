// Real rendered SupportOpsView card-to-transport regressions, offline only.
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

const dialog = () => page.getByRole('dialog', { name: 'Review Support action', exact: true })
const sendButton = () => dialog().getByRole('button', { name: 'Approve action', exact: true })
const approvals = () => page.evaluate(() => window.supportReviewQA.requests.filter(r => /\/voice\/reviews\/.*\/approve$/.test(r.path)))

async function stage() {
  await page.evaluate(() => window.supportReviewQA.propose())
  await dialog().waitFor()
  return dialog().getByRole('textbox', { name: 'Reviewed support action text' }).inputValue()
}

async function sendAndWait() {
  await sendButton().click()
  await page.waitForFunction(() => window.supportReviewQA.requests.some(r => /\/voice\/reviews\/.*\/approve$/.test(r.path)))
}

test('Queue voice reads actual routes before capture and the rendered card sends the exact reviewed request once', async () => {
  const rendered = await stage()
  const initial = await page.evaluate(() => ({ requests: window.supportReviewQA.requests, context: window.supportReviewQA.target.context }))
  assert.ok(initial.requests.some(r => r.path.endsWith('/health')))
  assert.ok(initial.requests.some(r => r.path.endsWith('/queue')))
  assert.ok(initial.requests.some(r => r.path.endsWith('/voice/read') && r.options.method === 'POST'))
  assert.match(JSON.stringify(initial.context), /Synthetic build issue/)
  assert.equal(rendered, 'Inspect the build. Do not change files.')
  await sendAndWait()
  await dialog().waitFor({ state: 'hidden' })
  const sent = await approvals()
  assert.equal(sent.length, 1)
  assert.equal(sent[0].host, 'host-one')
  assert.deepEqual(sent[0].body, { targetId: '100000000000000001', action: 'investigate', text: 'Inspect the build. Do not change files.' })
  assert.deepEqual(sent[0].options, { method: 'POST', timeoutMs: 30000 })
  assert.equal(await page.evaluate(() => window.supportReviewQA.receipts.length), 1)
})

test('the real textarea edit survives rerender and only the edited card text is sent', async () => {
  await stage()
  const textbox = dialog().getByRole('textbox', { name: 'Reviewed support action text' })
  await textbox.fill('Do not edit files. Inspect [the exact] output only.')
  await page.evaluate(() => window.supportReviewQA.rerender())
  assert.equal(await textbox.inputValue(), 'Do not edit files. Inspect [the exact] output only.')
  await sendAndWait()
  assert.equal((await approvals()).length, 1)
  assert.equal((await approvals())[0].body.text, 'Do not edit files. Inspect [the exact] output only.')
})

test('only the visible Cancel button clears a pending card without sending it', async () => {
  await stage()
  await dialog().getByRole('button', { name: 'Cancel', exact: true }).click()
  await dialog().waitFor({ state: 'hidden' })
  assert.deepEqual(await approvals(), [])
})

test('rapid repeated clicks on the visible Send button produce at most one request', async () => {
  await stage()
  await page.evaluate(() => window.supportReviewQA.holdApproval())
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(candidate => candidate.textContent === 'Approve action')
    button?.click()
    button?.click()
  })
  await page.waitForFunction(() => window.supportReviewQA.requests.some(r => /\/approve$/.test(r.path)))
  assert.equal((await approvals()).length, 1)
  await page.evaluate(() => window.supportReviewQA.releaseApproval())
  await dialog().waitFor({ state: 'hidden' })
  assert.equal((await approvals()).length, 1)
})

for (const boundary of ['disconnect', 'replaceHost', 'unmount']) test(`${boundary} prevents an old rendered card from sending to any transport`, async () => {
  await stage()
  await page.evaluate(boundary => window.supportReviewQA[boundary](), boundary)
  const button = sendButton()
  if (await button.count() && await button.isEnabled()) await button.click()
  await page.waitForTimeout(100)
  assert.deepEqual(await approvals(), [])
})

test('card submission renders busy and prevents editing or cancellation while its request is held', async () => {
  await stage()
  await page.evaluate(() => window.supportReviewQA.holdApproval())
  await sendButton().click()
  await page.waitForFunction(() => window.supportReviewQA.requests.some(r => /\/approve$/.test(r.path)))
  assert.equal(await dialog().getByRole('textbox').isDisabled(), true)
  assert.equal(await dialog().getByRole('button', { name: 'Cancel', exact: true }).isDisabled(), true)
  assert.equal(await dialog().getByRole('button', { name: 'Submitting...', exact: true }).isDisabled(), true)
  assert.doesNotMatch(await dialog().innerText(), /Nothing has run/)
  await page.evaluate(() => window.supportReviewQA.releaseApproval())
  await dialog().waitFor({ state: 'hidden' })
  assert.equal((await approvals()).length, 1)
})

for (const failure of ['refresh', 'receipt']) test(`accepted action stays accepted after ${failure} failure and cannot be sent again`, async () => {
  await stage()
  await page.evaluate(failure => window.supportReviewQA.failAfterAccept(failure), failure)
  await sendAndWait()
  await dialog().waitFor({ state: 'hidden' })
  assert.equal((await approvals()).length, 1)
  assert.equal(await sendButton().count(), 0)
  if (failure === 'receipt') assert.match(await page.locator('.support-ops-screen').innerText(), /action was submitted, but the Support view could not refresh/)
  else assert.ok(await page.evaluate(() => window.supportReviewQA.errors.includes('Synthetic refresh unavailable')))
})

test('unconfirmed request failure preserves the exact card without automatically resubmitting', async () => {
  const rendered = await stage()
  await page.evaluate(() => window.supportReviewQA.failSubmission())
  await sendAndWait()
  await page.waitForFunction(() => document.querySelector('dialog')?.textContent?.includes('Submission was not confirmed'))
  assert.equal(await dialog().getByRole('textbox').inputValue(), rendered)
  assert.match(await dialog().innerText(), /Submission was not confirmed/)
  assert.doesNotMatch(await dialog().innerText(), /Nothing has run/)
  assert.equal(await dialog().getByRole('textbox').isEnabled(), true)
  assert.equal((await approvals()).length, 1)
})
