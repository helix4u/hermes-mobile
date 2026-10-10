// Isolated headless browser only. Never connects to a phone or a live provider.
import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createServer } from 'vite'
import { saveReport } from './report.mjs'
const { values } = parseArgs({ options: { out: { type: 'string' }, 'playwright-package': { type: 'string' }, channel: { type: 'string', default: 'msedge' } } })
if (!values.out) throw new Error('Required --out private artifact directory')
const require = createRequire(values['playwright-package'] ? path.resolve(values['playwright-package']) : import.meta.url)
const report = { schema: 1, layer: 'isolated-real-hook', startedAt: new Date().toISOString(), checks: [], manual: [{ id: 'CAPTURE-DEVICE', reason: 'Synthetic microphone and speech do not prove physical Android capture or audio routing.' }] }
let server, browser, context, page
async function check(id, action) {
  const started = performance.now()
  try { await action(); report.checks.push({ id, status: 'pass', reason: 'Production hook retains capture ownership across pet speech and async cleanup.', ms: Math.round(performance.now() - started) }); console.log(`${id}: pass`) }
  catch (error) { report.checks.push({ id, status: 'fail', reason: error.message, ms: Math.round(performance.now() - started) }); console.log(`${id}: fail: ${error.message}`) }
}
try {
  server = await createServer({ root: fileURLToPath(new URL('../../client/', import.meta.url)), server: { host: '127.0.0.1', port: 0, open: false }, logLevel: 'error' })
  await server.listen()
  const url = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await require('playwright').chromium.launch({ channel: values.channel, headless: true })
  context = await browser.newContext()
  await context.route('**/*', route => new URL(route.request().url()).origin === url ? route.continue() : route.abort())
  page = await context.newPage()
  page.setDefaultTimeout(5000)
  const fresh = async () => { await page.goto(`${url}/qa/voice-capture.html`, { timeout: 30000 }); await page.waitForFunction(() => Boolean(window.qa)) }
  await check('CAPTURE-PET-OWNERSHIP', async () => {
    await fresh()
    await page.getByRole('button', { name: 'Record', exact: true }).click()
    await page.waitForFunction(() => window.qa.witness.starts === 1)
    await page.evaluate(() => { void window.qa.pet() })
    // Wait for synthesis, then inspect lifecycle and the real rendered stop action.
    await page.waitForFunction(() => window.qa.voice.activeSpeechId === 'pet-sidechat')
    if (await page.evaluate(() => window.qa.voice.phase !== 'recording' || window.qa.witness.plays !== 0)) throw new Error('Pet speech stole recording state or played into active capture')
    await page.getByRole('button', { name: 'Stop recording and transcribe' }).click()
    await page.waitForFunction(() => window.qa.witness.transcripts.length === 1 && window.qa.witness.plays === 1)
    await page.evaluate(() => window.qa.finishAudio())
    await page.waitForFunction(() => window.qa.voice.phase === 'idle')
    await page.getByRole('button', { name: 'Record', exact: true }).click()
    await page.waitForFunction(() => window.qa.witness.starts === 2 && window.qa.voice.phase === 'recording')
    if (await page.evaluate(() => window.qa.witness.stops !== 1 || window.qa.witness.errors.length)) throw new Error('Capture was not released exactly once for the next recording')
    await page.getByRole('button', { name: 'Stop recording and transcribe' }).click()
  })
  await check('CAPTURE-START-SINGLE-FLIGHT', async () => {
    await fresh()
    await page.evaluate(() => { window.qa.startOptions(true, false); window.qa.voice.toggleRecording(); window.qa.voice.toggleRecording() })
    await page.evaluate(() => window.qa.releaseStart())
    await page.waitForFunction(() => window.qa.witness.transcripts.length === 1)
    if (await page.evaluate(() => window.qa.witness.starts !== 1 || window.qa.witness.stops !== 1)) throw new Error('Same-frame stop raced with microphone startup')
  })
  await check('CAPTURE-START-FAILURE-RECOVERY', async () => {
    await fresh()
    await page.evaluate(() => { window.qa.startOptions(false, true); window.qa.voice.toggleRecording() })
    await page.waitForFunction(() => window.qa.witness.errors.length === 1 && window.qa.voice.phase === 'idle')
    await page.evaluate(() => { window.qa.startOptions(false, false); window.qa.voice.toggleRecording() })
    await page.waitForFunction(() => window.qa.voice.phase === 'recording' && window.qa.witness.starts === 1)
    await page.getByRole('button', { name: 'Stop recording and transcribe' }).click()
  })
  await check('CAPTURE-TRANSCRIPTION-OWNERSHIP', async () => {
    await fresh()
    await page.getByRole('button', { name: 'Record', exact: true }).click()
    await page.waitForFunction(() => window.qa.voice.phase === 'recording')
    await page.evaluate(() => { window.qa.holdTranscription(); window.qa.voice.toggleRecording(); void window.qa.pet(); window.qa.voice.toggleRecording() })
    await page.waitForFunction(() => window.qa.witness.transcribes === 1 && window.qa.voice.activeSpeechId === 'pet-sidechat')
    if (await page.evaluate(() => window.qa.voice.phase !== 'transcribing' || window.qa.witness.plays !== 0 || window.qa.witness.starts !== 1)) throw new Error('Speech or a repeated press stole transcription ownership')
    await page.evaluate(() => window.qa.releaseTranscription())
    await page.waitForFunction(() => window.qa.witness.transcripts.length === 1 && window.qa.witness.plays === 1)
  })
  await check('CAPTURE-TARGET-ISOLATION', async () => {
    await fresh()
    await page.getByRole('button', { name: 'Record', exact: true }).click()
    await page.waitForFunction(() => window.qa.voice.phase === 'recording')
    await page.evaluate(() => { window.qa.holdTranscription(); window.qa.voice.toggleRecording() })
    await page.waitForFunction(() => window.qa.witness.transcribes === 1)
    await page.evaluate(() => window.qa.switchTarget())
    await page.getByTestId('phase').evaluate(() => undefined)
    await page.evaluate(() => window.qa.releaseTranscription())
    await page.waitForFunction(() => window.qa.voice.phase === 'idle')
    if (await page.evaluate(() => window.qa.witness.transcripts.length !== 0)) throw new Error('Old capture text leaked into a different connection')
  })
  await check('CAPTURE-UNMOUNT-RELEASE', async () => {
    await fresh()
    await page.getByRole('button', { name: 'Record', exact: true }).click()
    await page.waitForFunction(() => window.qa.witness.starts === 1)
    await page.evaluate(() => window.qa.unmount())
    if (await page.evaluate(() => window.qa.witness.tracksStopped !== 1)) throw new Error('Unmount leaked the owned microphone')
  })
} finally {
  await context?.close(); await browser?.close(); await server?.close()
  report.finishedAt = new Date().toISOString()
  await saveReport(values.out, report)
}
if (report.checks.some(check => check.status !== 'pass')) process.exitCode = 1
