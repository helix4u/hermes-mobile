// Explicit live-device QA. Never sends prompts, starts calls, or stops turns.
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFile, mkdir } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import path from 'node:path'
import { automationFailure, saveReport } from './report.mjs'

const { values } = parseArgs({ options: {
  device: { type: 'string' }, adb: { type: 'string', default: 'adb' },
  'playwright-package': { type: 'string' }, out: { type: 'string' },
  'allow-preference-cycle': { type: 'boolean', default: false },
} })
if (!values.device || !values.out) throw new Error('Required: --device <authorized serial> --out <private artifact directory>')
const catalog = JSON.parse(await readFile(new URL('mobile-ui-cases.json', import.meta.url)))
const report = { schema: 1, layer: 'installed-device', startedAt: new Date().toISOString(), checks: [], manual: catalog.manual }
const out = path.resolve(values.out)
await mkdir(out, { recursive: true })
const adb = (...args) => execFileSync(values.adb, ['-s', values.device, ...args],
  { encoding: 'utf8', timeout: 20000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 2 ** 20 }).trim()
const require = createRequire(values['playwright-package']
  ? path.resolve(values['playwright-package']) : import.meta.url)
let browser, port, page, options, wasExpanded
const original = new Map()
const changed = new Set()
const outcome = (id, status, reason, ms = 0, metrics) => report.checks.push({ id, status, reason, ms, ...(metrics ? { metrics } : {}) })
const check = async (id, fn) => {
  const start = performance.now()
  try {
    const metrics = await fn()
    outcome(id, 'pass', catalog.checks.find(c => c.id === id).reason, Math.round(performance.now() - start), metrics)
  }
  catch (error) { outcome(id, 'fail', automationFailure(error), Math.round(performance.now() - start)) }
}
function ensure(condition, reason) { if (!condition) throw Object.assign(new Error(reason), { qaReason: reason }) }
const rect = locator => locator.evaluate(el => {
  const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }
})
const label = locator => locator.getAttribute('aria-label')
const cycle = async (locator, target) => {
  for (let n = 0; n < 4; n++) {
    if (await label(locator) === target) return
    await locator.click({ timeout: 4000 })
  }
  ensure(await label(locator) === target, 'Preference did not return to its initial value.')
}
let pageErrors = 0, safeAreaErrors = 0, consoleErrors = 0
try {
  ensure(adb('get-state') === 'device', 'Selected device is not connected.')
  const pid = adb('shell', 'pidof', 'dev.hermes.mobile')
  ensure(/^\d+$/.test(pid), 'Expected one live Hermes Mobile process.')
  const socket = `webview_devtools_remote_${pid}`
  ensure(adb('shell', 'cat', '/proc/net/unix').includes(`@${socket}`), 'Matching WebView debug socket is unavailable.')
  port = adb('forward', 'tcp:0', `localabstract:${socket}`)
  ensure(/^\d+$/.test(port), 'Could not allocate the task-owned loopback forward.')
  browser = await require('playwright').chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 10000 })
  page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url() === 'https://localhost/')
  ensure(page && await page.title() === 'Hermes Mobile', 'Expected foreground Mobile page was not found.')
  ensure(await page.evaluate(() => document.visibilityState === 'visible'), 'Mobile is not visible. Foreground device testing is deferred.')
  page.setDefaultTimeout(4000)
  page.on('pageerror', () => pageErrors++)
  page.on('console', msg => {
    if (msg.type() !== 'error') return
    if (msg.text().includes('Error injecting safe area CSS')) safeAreaErrors++
    else consoleErrors++
  })
  await page.locator('.chat-view.active').waitFor({ state: 'visible' })
  // Only DOM geometry and fixed UI labels are read. No conversation snapshot.
  await check('UI-001', async () => {
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth }))
    const box = await rect(page.locator('.chat-view.active .composer-box'))
    ensure(viewport.scrollWidth <= viewport.width + 1, 'Document overflows horizontally.')
    ensure(box.x >= -1 && box.x + box.width <= viewport.width + 1 && box.y >= 0 && box.y + box.height <= viewport.height + 1, 'Composer is outside the viewport.')
    return { viewport, composer: box }
  })
  await check('UI-002', async () => {
    const brand = await rect(page.locator('.brand-button'))
    const status = await rect(page.locator('.topbar-statuses'))
    const overlap = Math.min(brand.x + brand.width, status.x + status.width) - Math.max(brand.x, status.x)
    ensure(overlap <= 1, 'Header identity and status overlap.')
    ensure(Math.abs(brand.y + brand.height / 2 - status.y - status.height / 2) < 12, 'Header controls unexpectedly stack.')
    return { header: await rect(page.locator('.topbar')) }
  })
  await check('UI-003', async () => {
    const title = await page.locator('.chat-view.active .thread-heading h1').evaluate(el => ({ height: el.getBoundingClientRect().height, line: parseFloat(getComputedStyle(el).lineHeight) }))
    ensure(title.height <= title.line * 1.2, 'Session title wraps into additional rows.')
    return title
  })
  options = page.getByRole('button', { name: 'Options', exact: true })
  wasExpanded = await options.getAttribute('aria-expanded') === 'true'
  if (!wasExpanded) await options.click()
  const menu = page.getByRole('region', { name: 'Session options', exact: true })
  await check('UI-004', async () => {
    await menu.waitFor({ state: 'visible' })
    ensure(await menu.locator('select').count() === 0, 'Session voice options open a native selector.')
    for (const name of ['Wake', 'Replies', 'During turn']) {
      const control = menu.getByRole('button', { name: new RegExp(`^${name}:`) })
      const geometry = await rect(control)
      const text = await control.locator('strong').evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth }))
      ensure(geometry.height >= 40 && text.scrollWidth <= text.width + 1, 'A voice option has a clipped value or undersized hit target.')
      original.set(name, await label(control))
    }
    return { menu: await rect(menu) }
  })
  const active = await page.getByRole('button', { name: 'Stop running turn', exact: true }).count() > 0
  const voiceActive = await page.locator('.topbar .live-voice-mic').count() > 0
  if (!values['allow-preference-cycle'] || active || voiceActive) outcome('UI-005', 'skip', 'Preference cycle requires explicit flag and an idle session with no voice call.')
  else await check('UI-005', async () => {
    for (const name of ['Replies', 'During turn']) {
      const control = menu.getByRole('button', { name: new RegExp(`^${name}:`) })
      const before = original.get(name)
      ensure(before, 'Initial preference was not captured.')
      changed.add(name)
      await control.click()
      ensure(await label(control) !== before, 'Click did not advance the option.')
      await cycle(control, before)
    }
    return { restored: true, wakeCycle: 'excluded: may activate recording or auto-send' }
  })
  await options.click() // Close for main composer/layout checks.
  await check('UI-006', async () => {
    const box = page.locator('.chat-view.active .composer-box')
    const stop = box.getByRole('button', { name: 'Stop running turn', exact: true })
    if (active) ensure(await stop.isVisible() && await stop.isEnabled(), 'Active turn lacks an enabled Stop in the composer.')
    else ensure(await box.getByRole('button', { name: 'Send', exact: true }).isVisible(), 'Idle composer lacks its Send action.')
    const rows = await box.locator('button').evaluateAll(buttons => buttons.filter(b => b.getBoundingClientRect().height > 0).map(b => b.getBoundingClientRect().y + b.getBoundingClientRect().height / 2))
    ensure(Math.max(...rows) - Math.min(...rows) < 10, 'Composer buttons are stacked instead of inline.')
    return { activeTurnObserved: active, submitted: false, stopped: false }
  })
  const work = page.locator('.chat-view.active .work-status')
  if (!await work.count()) outcome('UI-007', 'skip', 'No current Work card on the idle device; active layout remains an isolated/manual check.')
  else await check('UI-007', async () => {
    ensure(await page.locator('.chat-view.active .composer .work-status').count() === 1, 'Work is not owned by the composer.')
    const card = await rect(work), box = await rect(page.locator('.chat-view.active .composer-box'))
    ensure(card.y + card.height <= box.y + 1, 'Work overlaps the composer input.')
    return { work: card }
  })
  await check('UI-010', async () => {
    ensure(!await page.getByRole('button', { name: 'Close pet sidechat', exact: true }).isVisible(), 'Existing pet interaction is open; leave it untouched.')
    try {
      await page.getByRole('button', { name: 'Open voice conversation', exact: true }).click()
      await page.locator('details.pet-realtime-settings > summary').click()
      const control = page.getByRole('combobox', { name: 'Pet live voice', exact: true })
      await control.waitFor({ state: 'visible' })
      const contained = await control.evaluate(node => {
        const r = node.getBoundingClientRect(), body = node.closest('.pet-sidechat-body').getBoundingClientRect()
        return r.top >= body.top - 1 && r.bottom <= body.bottom + 1
      })
      ensure(contained, 'Voice settings opened but its control is outside the scroll viewport.')
      await page.screenshot({ path: path.join(out, 'phone-voice-settings.png') })
      return { inScrollViewport: true, callStarted: false, settingsChanged: false }
    } finally {
      const close = page.getByRole('button', { name: 'Close pet sidechat', exact: true })
      if (await close.isVisible()) await close.click()
    }
  })
  await check('UI-011', async () => {
    let stage = 'read rotation preferences'
    const auto = adb('shell', 'settings', 'get', 'system', 'accelerometer_rotation')
    const rotation = adb('shell', 'settings', 'get', 'system', 'user_rotation')
    ensure(/^[01]$/.test(auto) && /^[0-3]$/.test(rotation), 'Unknown rotation preference; leave unchanged.')
    try {
      stage = 'open voice page'
      await page.getByRole('button', { name: 'Open voice conversation', exact: true }).click()
      stage = 'rotate device and await landscape viewport'
      adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0')
      adb('shell', 'settings', 'put', 'system', 'user_rotation', '1')
      await page.waitForFunction(() => innerWidth > innerHeight, undefined, { timeout: 15000 })
      stage = 'check landscape geometry'
      const geometry = await page.locator('.voice-page').evaluate(node => {
        const r = node.getBoundingClientRect()
        return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:innerWidth, height:innerHeight }
      })
      ensure(geometry.x >= -1 && geometry.y >= -1 && geometry.right <= geometry.width + 1 && geometry.bottom <= geometry.height + 1, 'Landscape voice page escapes viewport.')
      stage = 'locate visible live voice control'
      await page.getByRole('button', { name:'Start live voice', exact:true }).waitFor({state:'visible'})
      await page.screenshot({path:path.join(out,'phone-voice-landscape.png')})
      adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')
      stage = 'verify native Back closes voice page'
      await page.locator('.voice-page').waitFor({state:'hidden'})
      ensure(!await page.locator('.mobile-workspace').evaluate(node => node.inert), 'Native Back left the session inert.')
      return { geometry, nativeBack:true, callStarted:false }
    } catch (error) {
      try { await page.screenshot({path:path.join(out,'phone-voice-landscape-failure.png')}) } catch {}
      throw Object.assign(new Error(`${stage}: ${automationFailure(error)}`), {
        qaReason: `${stage}: ${automationFailure(error)}`,
      })
    } finally {
      adb('shell','settings','put','system','user_rotation',rotation)
      adb('shell','settings','put','system','accelerometer_rotation',auto)
      ensure(adb('shell','settings','get','system','user_rotation') === rotation && adb('shell','settings','get','system','accelerometer_rotation') === auto, 'Rotation preferences were not restored.')
      const close = page.getByRole('button', {name:'Close pet sidechat', exact:true})
      if(await close.isVisible()) await close.click()
    }
  })
  await page.screenshot({ path: path.join(out, 'phone-ui.png') })
  await check('UI-008', async () => {
    ensure(pageErrors === 0 && consoleErrors === 0, 'New runtime exception or console error during this run.')
    return { pageErrors, consoleErrors, safeAreaErrors, preAttachHistory: 'not observed' }
  })
} catch (error) {
  outcome('HARNESS', 'fail', automationFailure(error))
} finally {
  if (page && options && wasExpanded !== undefined) {
    await check('UI-009', async () => {
      let stage = 'open Options after voice-page return'
      try {
      if (await options.getAttribute('aria-expanded') !== 'true') await options.click()
      for (const [name, target] of original) {
        stage = `verify ${name} preference`
        const control = page.getByRole('region', { name: 'Session options', exact: true }).getByRole('button', { name: new RegExp(`^${name}:`) })
        if (changed.has(name)) await cycle(control, target)
        ensure(await label(control) === target, 'A preference changed unexpectedly; manual restoration needed.')
      }
      stage = 'restore initial Options visibility'
      if (!wasExpanded) await options.click()
      return { restored: true }
      } catch(error) {
        try { await page.screenshot({path:path.join(out,'phone-restoration-failure.png')}) } catch {}
        throw Object.assign(new Error(stage), {qaReason:`${stage}: ${automationFailure(error)}`})
      }
    })
  }
  if (browser) { try { await browser.close() } catch { outcome('CLEANUP', 'fail', 'Could not detach task CDP connection.') } }
  if (port) {
    try { adb('forward', '--remove', `tcp:${port}`) }
    catch {
      // A transport reconnect removes its forwards automatically. Absence is
      // already the desired cleanup state, but an unreadable inventory is not.
      try {
        const present = adb('forward', '--list').split('\n').some(line => {
          const fields = line.trim().split(/\s+/)
          return fields[0] === values.device && fields[1] === `tcp:${port}`
        })
        if (present) outcome('CLEANUP', 'fail', 'Task-owned ADB forward remains after cleanup.')
      } catch { outcome('CLEANUP', 'fail', 'Could not verify task-owned ADB forward cleanup.') }
    }
  }
  report.finishedAt = new Date().toISOString()
  const summary = await saveReport(out, report)
  console.log(JSON.stringify({ ...summary, report: path.join(out, 'report.json') }))
  if (summary.failed) process.exitCode = 1
}
