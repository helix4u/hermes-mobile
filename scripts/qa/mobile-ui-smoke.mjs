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
let browser, port, page, options, wasExpanded, initialLandscape
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
  initialLandscape = await page.evaluate(() => innerWidth > innerHeight)
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
    const petStage = page.locator('.mobile-pet-stage[data-roam="true"]')
    let pet
    if (await petStage.count()) {
      pet = await rect(petStage.locator('.mobile-pet'))
      ensure(pet.y + pet.height <= box.y + 1, 'Automatically roaming pet overlaps the composer controls.')
    }
    return { viewport, composer: box, ...(pet ? { pet } : {}) }
  })
  await check('UI-002', async () => {
    const brand = await rect(page.locator('.brand-button'))
    const status = await rect(page.locator('.topbar-statuses'))
    const landscape = await page.evaluate(() => innerWidth > innerHeight)
    const overlapX = Math.min(brand.x + brand.width, status.x + status.width) - Math.max(brand.x, status.x)
    const overlapY = Math.min(brand.y + brand.height, status.y + status.height) - Math.max(brand.y, status.y)
    ensure(overlapX <= 1 || overlapY <= 1, 'Header identity and status overlap.')
    if (landscape) ensure(brand.y + brand.height <= status.y + 1, 'Landscape header status is not attached below its identity.')
    else ensure(Math.abs(brand.y + brand.height / 2 - status.y - status.height / 2) < 12, 'Portrait header controls unexpectedly stack.')
    const identity = await page.locator('.host-pill').evaluate(button => {
      const machine = button.querySelector('.host-pill-copy strong')
      const profile = button.querySelector('.host-pill-copy small')
      const icon = button.querySelector('.host-chevron svg')
      const buttonRect = button.getBoundingClientRect()
      const iconRect = icon?.getBoundingClientRect()
      return {
        height: buttonRect.height,
        radius: parseFloat(getComputedStyle(button).borderRadius),
        machineVisible: Boolean(machine && machine.getBoundingClientRect().width > 0),
        profileVisible: Boolean(profile && profile.getBoundingClientRect().width > 0),
        profileFits: Boolean(profile && profile.scrollWidth <= profile.clientWidth + 1),
        iconOffset: iconRect ? Math.abs(iconRect.y + iconRect.height / 2 - buttonRect.y - buttonRect.height / 2) : 99,
      }
    })
    ensure(identity.height >= 40 && identity.radius >= 6 && identity.radius <= 12, 'Connection control does not use the shared rounded-square geometry.')
    ensure(identity.machineVisible && identity.profileVisible && identity.profileFits, 'Machine and profile are not independently readable.')
    ensure(identity.iconOffset <= 1, 'Connection glyph is not vertically centered.')
    return { header: await rect(page.locator('.topbar')), identity, landscape }
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
      await page.locator('.chat-view.active .thread-actions-trigger').click()
      await page.getByRole('button', { name: 'Voice conversation', exact: true }).click()
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
      stage = 'rotate device and await landscape viewport'
      adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0')
      adb('shell', 'settings', 'put', 'system', 'user_rotation', '1')
      await page.waitForFunction(() => innerWidth > innerHeight, undefined, { timeout: 15000 })

      stage = 'check landscape Chat geometry'
      const chatGeometry = await page.locator('.chat-view.active').evaluate(node => {
        const bounds = target => {
          const r = target.getBoundingClientRect()
          return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
        }
        const transcript = node.querySelector('.transcript')
        const composer = node.querySelector('.composer')
        const composerBox = node.querySelector('.composer-box')
        const host = document.querySelector('.topbar .host-pill')
        const pet = document.querySelector('.mobile-pet-stage[data-roam="true"] .mobile-pet')
        const machine = host?.querySelector('.host-pill-copy strong')
        const profile = host?.querySelector('.host-pill-copy small')
        if (!transcript || !composer || !composerBox || !host || !machine || !profile) throw new Error('Chat layout region is missing.')
        return {
          page: bounds(node),
          transcript: bounds(transcript),
          composer: bounds(composer),
          composerBox: bounds(composerBox),
          pet: pet ? bounds(pet) : null,
          identity: {
            host: bounds(host),
            machineVisible: machine.getBoundingClientRect().width > 0 && machine.getBoundingClientRect().height > 0,
            profileVisible: profile.getBoundingClientRect().width > 0 && profile.getBoundingClientRect().height > 0,
            machineFits: machine.scrollHeight <= machine.clientHeight + 1 && machine.scrollWidth <= machine.clientWidth + 1,
            profileFits: profile.scrollHeight <= profile.clientHeight + 1 && profile.scrollWidth <= profile.clientWidth + 1,
          },
          viewport: { width: innerWidth, height: innerHeight },
        }
      })
      const chatInside = region => region.x >= chatGeometry.page.x - 1 && region.right <= chatGeometry.page.right + 1
        && region.y >= chatGeometry.page.y - 1 && region.bottom <= chatGeometry.page.bottom + 1
      ensure(chatInside(chatGeometry.transcript) && chatInside(chatGeometry.composer) && chatInside(chatGeometry.composerBox), 'A landscape Chat region escapes its page.')
      ensure(chatGeometry.transcript.width >= chatGeometry.page.width * 0.9, 'Landscape transcript still gives away width to an empty composer rail.')
      ensure(chatGeometry.composer.width >= chatGeometry.page.width * 0.9, 'Landscape composer is not attached across the Chat surface.')
      ensure(chatGeometry.transcript.bottom <= chatGeometry.composer.y + 1, 'Landscape transcript overlaps or extends below the composer.')
      ensure(chatGeometry.composer.height <= chatGeometry.viewport.height * 0.48, 'Landscape composer reserves an oversized empty column.')
      ensure(chatGeometry.composerBox.y - chatGeometry.composer.y <= 12, 'Landscape composer input is stranded below unused space.')
      if (chatGeometry.pet) ensure(chatGeometry.pet.bottom <= chatGeometry.composer.y + 1, 'Automatically roaming pet overlaps the landscape composer.')
      ensure(chatGeometry.identity.machineVisible && chatGeometry.identity.profileVisible, 'Landscape hides the machine or profile identity.')
      ensure(chatGeometry.identity.machineFits && chatGeometry.identity.profileFits, 'Landscape clips the machine or profile identity.')
      await page.screenshot({ path: path.join(out, 'phone-chat-landscape.png') })

      stage = 'open voice page'
      await page.locator('.chat-view.active .thread-actions-trigger').click()
      await page.getByRole('button', { name: 'Voice conversation', exact: true }).click()
      stage = 'check landscape geometry'
      const geometry = await page.locator('.voice-page').evaluate(node => {
        const bounds = target => {
          const r = target.getBoundingClientRect()
          return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
        }
        const header = node.querySelector('.pet-sidechat-heading')
        const sheet = node.querySelector('.pet-sidechat-sheet')
        const controls = node.querySelector('.pet-realtime-controls')
        const body = node.querySelector('.pet-sidechat-body')
        const composer = node.querySelector('.pet-sidechat-composer')
        const textarea = composer?.querySelector('textarea')
        const actions = composer ? [...composer.querySelectorAll('button')].filter(button => button.getBoundingClientRect().height > 0) : []
        if (!sheet || !header || !controls || !body || !composer || !textarea || actions.length < 2) throw new Error('Voice layout region is missing.')
        return {
          page: bounds(node),
          sheet: bounds(sheet),
          header: bounds(header),
          controls: bounds(controls),
          body: bounds(body),
          composer: bounds(composer),
          textarea: bounds(textarea),
          actions: actions.map(bounds),
          viewport: { width: innerWidth, height: innerHeight },
        }
      })
      ensure(geometry.page.x >= -1 && geometry.page.y >= -1 && geometry.page.right <= geometry.viewport.width + 1 && geometry.page.bottom <= geometry.viewport.height + 1, 'Landscape voice page escapes viewport.')
      const voiceInside = region => region.x >= geometry.sheet.x - 1 && region.right <= geometry.sheet.right + 1
        && region.y >= geometry.sheet.y - 1 && region.bottom <= geometry.sheet.bottom + 1
      ensure(voiceInside(geometry.sheet) && [geometry.header, geometry.controls, geometry.body, geometry.composer, geometry.textarea, ...geometry.actions].every(voiceInside), 'A landscape voice region escapes its safe-area sheet.')
      ensure([geometry.header, geometry.controls, geometry.body, geometry.composer].every(region => region.width >= geometry.sheet.width * 0.98), 'Landscape voice content is trapped in a narrow side rail.')
      ensure(geometry.header.bottom <= geometry.controls.y + 1 && geometry.controls.bottom <= geometry.body.y + 1 && geometry.body.bottom <= geometry.composer.y + 1, 'Landscape voice regions are detached or overlap.')
      ensure(geometry.body.height >= 72, 'Landscape voice transcript has no usable height.')
      ensure(geometry.composer.height <= geometry.viewport.height * 0.28, 'Landscape voice composer reserves excessive empty space.')
      const actionCenters = geometry.actions.map(action => action.y + action.height / 2)
      const textareaCenter = geometry.textarea.y + geometry.textarea.height / 2
      ensure(Math.max(...actionCenters.map(center => Math.abs(center - textareaCenter))) < 10, 'Landscape voice composer actions are not aligned with the input.')
      stage = 'locate visible live voice control'
      await page.getByRole('button', { name:'Start live voice', exact:true }).waitFor({state:'visible'})
      await page.screenshot({path:path.join(out,'phone-voice-landscape.png')})
      adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')
      stage = 'verify native Back closes voice page'
      await page.locator('.voice-page').waitFor({state:'hidden'})
      ensure(!await page.locator('.mobile-workspace').evaluate(node => node.inert), 'Native Back left the session inert.')
      return { chatGeometry, geometry, nativeBack:true, callStarted:false }
    } catch (error) {
      try { await page.screenshot({path:path.join(out,'phone-voice-landscape-failure.png')}) } catch {}
      throw Object.assign(new Error(`${stage}: ${automationFailure(error)}`), {
        qaReason: `${stage}: ${automationFailure(error)}`,
      })
    } finally {
      adb('shell','settings','put','system','user_rotation',rotation)
      adb('shell','settings','put','system','accelerometer_rotation',auto)
      ensure(adb('shell','settings','get','system','user_rotation') === rotation && adb('shell','settings','get','system','accelerometer_rotation') === auto, 'Rotation preferences were not restored.')
      if (typeof initialLandscape === 'boolean') {
        await page.waitForFunction(
          expected => (innerWidth > innerHeight) === expected,
          initialLandscape,
          { timeout: 15000 },
        )
      }
      const close = page.getByRole('button', {name:'Close pet sidechat', exact:true})
      if(await close.isVisible()) await close.click()
    }
  })
  await page.screenshot({ path: path.join(out, 'phone-ui.png') })
  await check('UI-008', async () => {
    ensure(pageErrors === 0 && consoleErrors === 0, 'New runtime exception or console error during this run.')
    return { pageErrors, consoleErrors, safeAreaErrors, preAttachHistory: 'not observed' }
  })
  await check('UI-012', async () => {
    const controlTab = page.locator('.bottom-nav button').filter({ hasText: /^Control$/ })
    await controlTab.click()
    const refresh = page.getByRole('button', { name: 'Refresh controls', exact: true })
    await refresh.waitFor({ state: 'visible' })
    const metrics = await refresh.evaluate(button => {
      const buttonRect = button.getBoundingClientRect()
      const iconRect = button.querySelector('svg')?.getBoundingClientRect()
      return {
        width: buttonRect.width,
        height: buttonRect.height,
        radius: parseFloat(getComputedStyle(button).borderRadius),
        xOffset: iconRect ? Math.abs(iconRect.x + iconRect.width / 2 - buttonRect.x - buttonRect.width / 2) : 99,
        yOffset: iconRect ? Math.abs(iconRect.y + iconRect.height / 2 - buttonRect.y - buttonRect.height / 2) : 99,
      }
    })
    ensure(Math.abs(metrics.width - metrics.height) <= 1 && metrics.width >= 36, 'Refresh does not have a fixed square hit box.')
    ensure(metrics.radius >= 6 && metrics.radius <= 12, 'Refresh does not use the shared theme radius.')
    ensure(metrics.xOffset <= 1 && metrics.yOffset <= 1, 'Refresh glyph is not optically centered.')
    await page.screenshot({ path: path.join(out, 'phone-control-header.png') })
    await page.locator('.bottom-nav button').filter({ hasText: /^Chat$/ }).click()
    return metrics
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
