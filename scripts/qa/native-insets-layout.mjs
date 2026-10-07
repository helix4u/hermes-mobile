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
  server = await createServer({ root: fileURLToPath(new URL('../../client/', import.meta.url)),
    server: { host: '127.0.0.1', port: 0, open: false }, logLevel: 'error' })
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await require('playwright').chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage()
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  for (const [width, height, bottom, keyboard] of [[390,844,48,false],[390,844,24,false],[844,390,32,false],[390,470,0,true]]) {
    for (const surface of ['control', 'chat', 'reader']) {
      const id = `${surface}-${width}-${height}-${bottom}`
      try {
        await page.setViewportSize({ width, height })
        await page.goto(`${origin}/qa/native-insets.html?surface=${surface}`, { timeout: 60000 })
        await page.locator(`.${surface}-view.active`).waitFor()
        await page.evaluate(({ bottom, keyboard }) => {
          document.documentElement.style.setProperty('--android-safe-bottom', `${bottom}px`)
          document.documentElement.dataset.keyboard = keyboard ? 'open' : 'closed'
          const view = document.querySelector('.app-view.active')
          view.scrollTop = view.scrollHeight
        }, { bottom, keyboard })
        if (surface === 'control') await page.getByText('Advanced', { exact: true }).waitFor()
        const measured = await page.evaluate(() => {
          const view = document.querySelector('.app-view.active')
          view.scrollTop = view.scrollHeight
          const target = view.classList.contains('control-view')
            ? [...view.querySelectorAll('.control-section summary')].at(-1)
            : view.querySelector('.composer, .reader-playback-dock')
          const workspace = document.querySelector('.mobile-workspace').getBoundingClientRect()
          const rect = target.getBoundingClientRect()
          return { bottom: rect.bottom, paneBottom: workspace.bottom,
            padding: parseFloat(getComputedStyle(target).paddingBottom), viewport: innerHeight }
        })
        if (measured.bottom > height - bottom + 1 || measured.paneBottom > height - bottom + 1) {
          throw Error(`Content intersects navigation area: ${JSON.stringify(measured)}`)
        }
        if (surface !== 'control' && measured.padding > 13) throw Error('Transport counts native bottom inset twice')
        results.push({ id, status: 'pass', measured })
      } catch (error) {
        await page.screenshot({ path: path.join(values.out, `${id}.png`) })
        results.push({ id, status: 'fail', reason: error.message })
      }
    }
  }
} finally {
  await browser?.close()
  await server?.close()
}
await writeFile(path.join(values.out, 'report.json'), JSON.stringify({ results,
  bugTodo: ['Installed phone navigation-bar acceptance remains manual. No device was operated.'] }, null, 2))
console.log(JSON.stringify({ passed: results.filter(x => x.status === 'pass').length, failed: results.filter(x => x.status === 'fail').length }))
process.exitCode = results.some(x => x.status === 'fail') ? 1 : 0
