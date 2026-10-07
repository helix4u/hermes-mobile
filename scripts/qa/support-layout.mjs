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
  const page = await browser.newPage()
  page.setDefaultTimeout(10000)
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  for (const [width, height, theme] of [[360,800,'dark'],[390,844,'dark'],[390,844,'light'],[844,390,'dark']]) {
    const id = `support-${width}-${height}-${theme}`
    try {
      await page.setViewportSize({ width, height })
      await page.goto(`${origin}/qa/support-layout.html?theme=${theme}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.locator('.support-thread-card').first().waitFor()
      // Bulk queue actions live in the overflow menu, not in front of the tickets.
      await page.getByLabel('More support actions').click()
      await page.getByRole('menuitem', { name: /Sync filtered threads/ }).click()
      await page.waitForFunction(() => window.supportLayoutCalls.some(call => call.path.endsWith('/sync')))
      const assertQueue = async () => {
        if (await page.locator('.support-activity-view').count()) throw Error('Task history was mounted in the ticket queue')
        if (await page.locator('.support-overview').count()) throw Error('Statistics were mounted above the queue')
        if (await page.locator('.support-setup-panel').count()) throw Error('Settings were mounted above the queue')
        const geometry = await page.locator('.support-thread-open').first().evaluate(element => ({
          top: element.getBoundingClientRect().top, font: parseFloat(getComputedStyle(element.querySelector('strong')).fontSize),
          width: document.documentElement.scrollWidth, viewport: innerWidth,
        }))
        if (geometry.width > geometry.viewport || geometry.top > (height > 500 ? 400 : 330) || geometry.font < 13) throw Error(`Queue is not readable or visible near the top: ${JSON.stringify(geometry)}`)
      }
      await assertQueue()
      await page.locator('.support-ops-screen').screenshot({ path: path.join(values.out, `${id}-queue.png`) })
      await page.getByRole('button', { name: 'Overview', exact: true }).click()
      await page.locator('.support-overview').waitFor()
      if (await page.locator('.support-activity-view, .support-setup-panel').count()) throw Error('Overview includes activity or settings')
      await page.locator('.support-ops-screen').screenshot({ path: path.join(values.out, `${id}-overview.png`) })
      await page.getByLabel('More support actions').click()
      await page.getByRole('menuitem', { name: 'Activity' }).click()
      await page.getByLabel('Support task activity').waitFor()
      await page.getByText('Recent activity (12)', { exact: true }).waitFor()
      if (await page.locator('.support-activity-history').getAttribute('open') !== null) throw Error('Troubleshooting history expanded by default')
      if (await page.locator('.support-thread-card').count()) throw Error('Activity duplicates the ticket list')
      await page.getByLabel('Back to queue').click()
      await page.getByRole('button', { name: 'Queue', exact: true }).click()
      await page.locator('.support-thread-card').first().waitFor()
      await assertQueue()
      results.push({ id, status: 'pass' })
    } catch (error) {
      await page.screenshot({ path: path.join(values.out, `${id}-failure.png`) })
      results.push({ id, status: 'fail', reason: error.message })
    }
  }
} finally { await browser?.close(); await server?.close() }
await writeFile(path.join(values.out, 'report.json'), JSON.stringify({ results, bugTodo: ['Actual phone visual acceptance remains with the operator. No live support job or phone UI was operated.'] }, null, 2))
console.log(JSON.stringify(results))
process.exitCode = results.some(result => result.status === 'fail') ? 1 : 0
