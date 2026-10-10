import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'
const { values } = parseArgs({ options: { out: { type: 'string' }, 'playwright-package': { type: 'string' } } })
if (!values.out || !values['playwright-package']) throw Error('Private --out and existing --playwright-package required')
const require = createRequire(path.resolve(values['playwright-package']))
const results = []
let server, browser
try {
  await mkdir(values.out, { recursive: true })
  server = await createServer({ root: fileURLToPath(new URL('../../client/', import.meta.url)), server: { host: '127.0.0.1', port: 0, open: false }, logLevel: 'error' })
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await require('playwright').chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.setDefaultTimeout(10000)
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  const check = async (id, action) => {
    try { await action(); await page.screenshot({ path: path.join(values.out, `${id}.png`) }); results.push({ id, status: 'pass' }) }
    catch (error) { await page.screenshot({ path: path.join(values.out, `${id}.png`) }); results.push({ id, status: 'fail', reason: error.message }) }
  }
  await check('session-search-sort-resume', async () => {
    await page.goto(`${origin}/qa/mobile-polish.html`, { timeout: 60000 })
    const rows = page.locator('.session-flat-results .session-row')
    await rows.first().waitFor()
    if (await rows.count() !== 2) throw Error('Live runtime did not replace linked history')
    await page.getByLabel('Search sessions').fill('alpha')
    if (await rows.count() !== 1 || !(await rows.first().innerText()).includes('Alpha')) throw Error('Search did not immediately filter history')
    await page.getByLabel('Search sessions').fill('working')
    if (await rows.count() !== 1 || !(await rows.first().innerText()).includes('Zeta')) throw Error('Search did not filter live status')
    await page.getByLabel('Search sessions').fill('')
    await page.getByRole('button', { name: 'Title', exact: true }).click()
    if (!(await rows.first().innerText()).includes('Alpha')) throw Error('Title sorting failed')
    await page.getByRole('button', { name: /^Live / }).click()
    await page.locator('.session-flat-results .session-row').click()
    if (await page.getByLabel('Selected entry').textContent() !== 'live:runtime') throw Error('Wrong runtime resume target')
  })
  await check('capability-settings-and-scoped-mcp', async () => {
    await page.goto(`${origin}/qa/mobile-polish.html?surface=capabilities`)
    await page.getByText('Capabilities', { exact: true }).waitFor()
    if ((await page.evaluate(() => window.polishCalls)).length) throw Error('Collapsed settings unexpectedly fetched or mutated')
    await page.locator('.control-section > summary').click()
    await page.locator('.capability-entry > summary').waitFor()
    await page.locator('.capability-entry > summary').click()
    await page.getByLabel('Mode', { exact: true }).selectOption('fast')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForFunction(() => window.polishCalls.some(call => call.params?.action === 'settings'))
    const toggle = page.locator('.toolset-row').filter({ hasText: 'sample-server' }).getByRole('button')
    await toggle.waitFor()
    await toggle.click()
    await page.waitForFunction(() => window.polishCalls.some(call => call.method.includes('/mcp/servers/')))
    const calls = await page.evaluate(() => window.polishCalls)
    if (!calls.some(call => call.method === '/api/mcp/servers/sample-server/enabled?profile=qa-profile' && call.params.enabled === false)) throw Error('MCP toggle lost profile or flag')
    if (!(await page.locator('.toolset-row').filter({ hasText: 'owned-server' }).getByRole('button').isDisabled())) throw Error('Plugin-owned MCP server allowed config mutation')
  })
  await check('support-ticket-priority-and-readable-controls', async () => {
    await page.goto(`${origin}/qa/mobile-polish.html?surface=support`)
    await page.locator('.support-thread-card').waitFor()
    const geometry = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth,
      action: document.querySelector('.support-thread-card .support-menu > button').getBoundingClientRect().height,
      title: parseFloat(getComputedStyle(document.querySelector('.support-thread-open strong')).fontSize),
      firstTicket: document.querySelector('.support-thread-card').getBoundingClientRect().top,
      activity: Boolean(document.querySelector('.support-activity-view')) }))
    if (geometry.width > geometry.viewport || geometry.action < 28 || geometry.action > 40 || geometry.title < 13 || geometry.firstTicket > 400 || geometry.activity) throw Error(`Ticket queue is obscured or unreadable: ${JSON.stringify(geometry)}`)
  })
  await check('context-occupancy-and-compression-boundary', async () => {
    await page.goto(`${origin}/qa/mobile-polish.html?surface=context`)
    await page.getByLabel('Context 45% used. 55,000 tokens remaining.').waitFor()
    const percent = await page.locator('.context-meter-percent').boundingBox()
    const composer = await page.locator('.composer-meta').boundingBox()
    if (!percent || !composer || percent.x < composer.x || percent.x + percent.width > composer.x + composer.width)
      throw Error('Context percentage is clipped by workspace and connection metadata')
    await page.locator('.context-meter > summary').click()
    await page.getByText('Compression at 60,000 tokens (60%)', { exact: true }).waitFor()
    await page.evaluate(() => window.compressContext())
    await page.getByLabel('Context usage unavailable').waitFor()
    await page.evaluate(() => window.finishCompression())
    await page.getByLabel('Context 20% used. 80,000 tokens remaining.').waitFor()
    const marker = await page.locator('.context-ring-threshold').getAttribute('data-threshold')
    if (marker !== '60%') throw Error('Compression marker does not reflect the effective token cap')
    const bounds = await page.locator('.context-meter-detail').boundingBox()
    if (!bounds || bounds.y < 0 || bounds.x < 0 || bounds.x + bounds.width > 390) throw Error('Context details escaped the phone viewport')
  })
} finally { await browser?.close(); await server?.close() }
await writeFile(path.join(values.out, 'report.json'), JSON.stringify({ results, bugTodo: ['Physical audio lock-screen acceptance remains manual.', 'Full host terminal and capability auth/install parity remain open.'] }, null, 2))
console.log(JSON.stringify(results))
process.exitCode = results.some(result => result.status === 'fail') ? 1 : 0
