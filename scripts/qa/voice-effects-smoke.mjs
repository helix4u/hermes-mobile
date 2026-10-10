// Actual Web Audio worklet and rendered controls. Synthetic tone, no provider/phone.
import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { saveReport } from './report.mjs'

const { values } = parseArgs({ options: { out: { type: 'string' }, 'playwright-package': { type: 'string' }, 'production-worklet': { type: 'string' }, rtc: { type: 'boolean' } } })
if (!values.out || !values['playwright-package']) throw new Error('Required: --out and --playwright-package')
const require = createRequire(values['playwright-package'])
const report = { schema: 1, layer: 'isolated-real-audio-worklet', startedAt: new Date().toISOString(), checks: [],
  manual: [{ id: 'VOICE-EFFECTS-DEVICE', reason: 'Phone speaker/headset, provider speech and screen-off behavior remain physical acceptance.' }] }
let server, browser
try {
  server = await createServer({ root: fileURLToPath(new URL('../../client/', import.meta.url)),
    server: { host: '127.0.0.1', port: 0, open: false }, logLevel: 'error' })
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await require('playwright').chromium.launch({ channel: 'msedge', headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] })
  const page = await browser.newPage({ viewport: { width: 384, height: 824 } })
  const productionWorklet = values['production-worklet'] ? await readFile(values['production-worklet']) : null
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (productionWorklet && url.pathname.includes('voice-effects-worklet') && url.searchParams.has('worker_file')) {
      return route.fulfill({ contentType: 'text/javascript', body: productionWorklet })
    }
    return route.continue()
  })
  report.layer = productionWorklet ? 'isolated-packaged-audio-worklet' : report.layer
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/qa/voice-effects.html${values.rtc ? '?rtc' : ''}`, { timeout: 30000 })
  await page.locator('summary').click()
  await page.getByRole('button', { name: 'Start synthetic audio' }).click()
  await page.waitForFunction(() => window.voiceEffectsQA?.ready(), { timeout: 30000 })
  const check = async (id, action) => {
    const started = performance.now()
    await action()
    report.checks.push({ id, reason: 'Production worklet and rendered controls with synthetic audio.', status: 'pass', ms: Math.round(performance.now() - started) })
    console.log(`${id}: pass`)
  }
  const spectrum = () => page.evaluate(() => window.voiceEffectsQA.spectrum())
  await check('EFFECTS-BYPASS', async () => {
    const value = await spectrum()
    if (Math.abs(value.hz - 440) > 5 || value.rms < 0.03) throw new Error(`Invalid bypass: ${JSON.stringify(value)}`)
  })
  await check('EFFECTS-PITCH-WORKLET', async () => {
    await page.getByRole('button', { name: 'Tiny', exact: true }).click()
    await page.waitForFunction(() => !window.voiceEffectsQA.updating())
    if (await page.locator('.voice-effects-warning').count()) throw new Error(await page.locator('.voice-effects-warning').textContent())
    const value = await spectrum()
    if (Math.abs(value.hz - 440 * 2 ** (5 / 12)) > 6 || value.rms < 0.005) throw new Error(`Invalid pitch: ${JSON.stringify(value)}`)
    if (await page.locator('.voice-effects-warning').count()) throw new Error('Processor fell back to original audio')
    const route = await page.evaluate(() => window.voiceEffectsQA.route())
    if (!route.sourceRetained || route.directVolume !== 0 || !route.clock || (values.rtc && route.rtc !== 'connected')) {
      throw new Error(`Invalid effects output ownership: ${JSON.stringify(route)}`)
    }
  })
  await check('EFFECTS-BEND-RELEASE', async () => {
    const slider = page.getByRole('slider', { name: 'Momentary pitch bend' })
    await slider.focus(); await page.keyboard.down('ArrowRight')
    if (Number(await page.getByLabel('Current bend').textContent()) <= 0) throw new Error('Bend did not move')
    await page.keyboard.up('ArrowRight')
    if (Number(await page.getByLabel('Current bend').textContent()) !== 0) throw new Error('Bend did not return')
    const box = await slider.boundingBox()
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2)
    await page.mouse.down(); await page.mouse.move(box.x + box.width + 20, box.y + box.height / 2)
    await page.mouse.up()
    if (Number(await page.getByLabel('Current bend').textContent()) !== 0) throw new Error('Captured pointer did not release bend')
  })
  await check('EFFECTS-INTERRUPTION', async () => {
    await page.evaluate(() => window.voiceEffectsQA.mute(true))
    if (!await page.evaluate(() => window.voiceEffectsQA.muted())) throw new Error('Playback not immediately muted')
    const muted = await spectrum()
    if (muted.rms > 0.00001) throw new Error(`Processor retained interrupted sound: ${muted.rms}`)
    await page.evaluate(() => window.voiceEffectsQA.mute(false))
    if ((await spectrum()).rms < 0.005) throw new Error('Playback failed to recover')
  })
  await check('EFFECTS-RADIO-EQ-RESET', async () => {
    await page.getByRole('button', { name: 'Radio', exact: true }).click()
    await page.waitForFunction(() => !window.voiceEffectsQA.updating())
    if (!(await page.getByLabel('Radio filter').isChecked())) throw new Error('Radio preset missing filter')
    if ((await spectrum()).rms < 0.005) throw new Error('Radio filter muted speech range')
    await page.getByRole('button', { name: 'Reset effects', exact: true }).click()
    if (await page.getByLabel('Enable playback effects').isChecked()) throw new Error('Reset did not bypass')
    if (Math.abs((await spectrum()).hz - 440) > 5) throw new Error('Reset retained shifted output')
  })
  await check('EFFECTS-SPATIAL-PLACEMENT', async () => {
    await page.getByRole('button', { name: 'Warm', exact: true }).click()
    await page.getByLabel('Enable spatial audio').check()
    const position = page.getByRole('slider', { name: 'Playback left/right position' })
    await position.focus(); await position.press('Home')
    await page.waitForFunction(() => !window.voiceEffectsQA.updating())
    const left = await page.evaluate(() => window.voiceEffectsQA.stereo())
    await position.press('End')
    await page.waitForFunction(() => !window.voiceEffectsQA.updating())
    const right = await page.evaluate(() => window.voiceEffectsQA.stereo())
    if (!(left[0] > left[1] * 1.05 && right[1] > right[0] * 1.05)) throw new Error(`HRTF placement did not change stereo output: ${JSON.stringify({ left, right })}`)
    if (await page.locator('.voice-effects-warning').count()) throw new Error('Spatializer fell back instead of processing')
  })
  await check('EFFECTS-SPATIAL-DISTANCE', async () => {
    const near = await page.evaluate(() => window.voiceEffectsQA.stereo())
    const before = await page.evaluate(() => window.voiceEffectsQA.route())
    const distance = page.getByRole('slider', { name: 'Playback distance' })
    await distance.focus(); await distance.press('End')
    await page.waitForFunction(() => !window.voiceEffectsQA.updating())
    const far = await page.evaluate(() => window.voiceEffectsQA.stereo())
    const after = await page.evaluate(() => window.voiceEffectsQA.route())
    if (!(far[0] + far[1] < (near[0] + near[1]) * 0.4 && far[0] + far[1] > 0.0001)) throw new Error(`Spatial distance did not attenuate output: ${JSON.stringify({ near, far })}`)
    if (before.effectsContextsCreated !== after.effectsContextsCreated || after.directVolume !== 0 || !after.sourceRetained) throw new Error('Spatial controls rebuilt the graph or exposed a dry receiver')
  })
  await check('EFFECTS-SPATIAL-INTERRUPTION', async () => {
    await page.evaluate(() => window.voiceEffectsQA.mute(true))
    const muted = await page.evaluate(() => window.voiceEffectsQA.stereo())
    if (muted.some(value => value > 0.00001)) throw new Error(`Spatial branch escaped interruption gate: ${muted}`)
    await page.evaluate(() => window.voiceEffectsQA.mute(false))
    await page.getByRole('button', { name: 'Reset effects', exact: true }).click()
    if (await page.getByLabel('Enable spatial audio').isChecked()) throw new Error('Reset retained spatial processing')
  })
  await check('EFFECTS-LANDSCAPE-CLEANUP', async () => {
    await page.setViewportSize({ width: 824, height: 384 })
    if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw new Error('Controls overflow')
    await page.evaluate(() => window.voiceEffectsQA.dispose())
    if (await page.locator('audio').count()) throw new Error('Playback element leaked')
    if (errors.length) throw new Error(errors.join('\n'))
  })
} catch (error) {
  report.checks.push({ id: 'EFFECTS-RUN', status: 'fail', reason: String(error.stack) })
  process.exitCode = 1
} finally {
  report.finishedAt = new Date().toISOString()
  await browser?.close(); await server?.close()
  await saveReport(values.out, report)
}
