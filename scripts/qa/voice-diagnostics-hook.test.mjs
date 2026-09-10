// Focused real-React integration, entirely offline. Reuses an installed Playwright.
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
  context = await browser.newContext()
  await context.route('**/*', route => new URL(route.request().url()).origin === url ? route.continue() : route.abort())
  page = await context.newPage()
  page.setDefaultTimeout(5000)
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'))
  await page.goto(`${url}/qa/voice-diagnostics.html`, { timeout: 30000 })
  await page.waitForFunction(() => Boolean(window.diagnosticsQA))
})
afterEach(async () => { await context?.close() })
const start = () => page.evaluate(() => window.diagnosticsQA.start())
const enabled = value => page.evaluate(value => window.diagnosticsQA.enabled(value), value)
const uploads = () => page.evaluate(() => window.diagnosticsQA.uploads)
const advance = () => page.clock.runFor(10000)

test('omitted transport and default opt-out never send diagnostics', async () => {
  await start(); await advance()
  assert.deepEqual(await uploads(), [])
  await enabled(true)
  await page.evaluate(() => window.diagnosticsQA.omitTransport())
  await start(); await advance()
  assert.deepEqual(await uploads(), [])
})

test('StrictMode replay recreates the uploader and uploads only bounded fields, never private context or errors', async () => {
  const counts = await page.evaluate(() => window.diagnosticsQA.counts)
  assert.ok(counts.effectSetups >= 2 && counts.effectCleanups >= 1)
  await enabled(true); await start(); await advance()
  const posts = await uploads()
  assert.equal(posts.length, 1)
  assert.equal(posts[0].path, '/api/plugins/hermes-mobile/v1/voice-diagnostics?profile=profile%20one')
  assert.deepEqual(posts[0].options, { method: 'POST', timeoutMs: 5000 })
  assert.deepEqual(Object.keys(posts[0].body).sort(), ['entries', 'optIn', 'schema', 'transport'])
  assert.equal(posts[0].body.entries.length, 1)
  assert.deepEqual(Object.keys(posts[0].body.entries[0]).sort(), ['elapsedMs', 'epoch', 'muted', 'phase', 'tracks'])
  assert.equal(posts[0].body.entries[0].phase, 'start.session_failed')
  assert.doesNotMatch(JSON.stringify(posts[0].body), /synthetic|private|transcript|token|profile|https/)
})

test('opt-out effect drops queued evidence without waiting for another trace', async () => {
  await enabled(true); await start(); await enabled(false); await advance()
  assert.deepEqual(await uploads(), [])
  await enabled(true); await start(); await advance()
  assert.equal((await uploads()).length, 1)
})

test('opt-out at event time drops queued evidence before passive effects', async () => {
  await enabled(true); await start()
  await page.evaluate(() => window.diagnosticsQA.optOutAndTraceBeforeRender())
  await advance()
  assert.deepEqual(await uploads(), [])
})

test('selected-profile mismatch disables uploads, then matching replacement records only fresh events', async () => {
  await enabled(true); await start()
  await page.evaluate(() => window.diagnosticsQA.selectedProfile('profile two'))
  await start(); await advance()
  assert.deepEqual(await uploads(), [])
  await page.evaluate(() => window.diagnosticsQA.replace('synthetic-host', 'profile two'))
  await start(); await advance()
  const posts = await uploads()
  assert.equal(posts.length, 1)
  assert.match(posts[0].path, /profile=profile%20two$/)
  assert.equal(posts[0].body.entries.length, 1)
})

test('same-profile transport replacement drops the old queued batch even without another trace', async () => {
  await enabled(true); await start()
  await page.evaluate(() => window.diagnosticsQA.replace('synthetic-host', 'profile one'))
  await advance()
  assert.deepEqual(await uploads(), [])
  await start(); await advance()
  assert.equal((await uploads())[0].body.entries.length, 1)
})

test('in-place transport mutation is fenced at event time, and a matched profile rerender recovers', async () => {
  await enabled(true); await start()
  await page.evaluate(() => window.diagnosticsQA.mutateTransport('profile two'))
  await start(); await advance()
  assert.deepEqual(await uploads(), [])
  await page.evaluate(() => window.diagnosticsQA.mutateTransport('profile two', true))
  await start(); await advance()
  const posts = await uploads()
  assert.equal(posts.length, 1)
  assert.match(posts[0].path, /profile=profile%20two$/)
  assert.equal(posts[0].body.entries.length, 1)
})

test('unmount drops pending uploads and late callbacks cannot revive the disposed uploader', async () => {
  await enabled(true); await start()
  await page.evaluate(() => window.diagnosticsQA.unmount())
  await start(); await advance()
  assert.deepEqual(await uploads(), [])
  await page.evaluate(() => window.diagnosticsQA.remount())
  await start(); await advance()
  assert.equal((await uploads()).length, 1)
})
