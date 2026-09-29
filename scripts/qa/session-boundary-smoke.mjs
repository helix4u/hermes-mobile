import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: {
  'cdp-url': { type: 'string' },
  'playwright-package': { type: 'string' },
  out: { type: 'string' },
} })
if (!values['cdp-url']?.startsWith('http://127.0.0.1:') || !values.out) {
  throw new Error('Provide a loopback --cdp-url and private --out directory')
}

const require = createRequire(values['playwright-package']
  ? path.resolve(values['playwright-package']) : import.meta.url)
const { chromium } = require('playwright')
const report = { schema: 1, check: 'UI-NEW-SESSION-BOUNDARY', status: 'fail',
  beforeTools: 0, afterFirstNew: null, afterSecondNew: null, restored: false }
let browser
let page
let selected = {}
try {
  browser = await chromium.connectOverCDP(values['cdp-url'], { timeout: 10_000 })
  page = browser.contexts()[0]?.pages()[0]
  if (!page) throw new Error('No Hermes WebView page is attached')
  const initial = await page.evaluate(() => ({
    chatActive: Boolean(document.querySelector('.chat-view.active .transcript')),
    draft: document.querySelector('.composer textarea')?.value || '',
    title: document.querySelector('.thread-heading h1')?.textContent?.trim() || '',
    selected: Object.fromEntries(Object.entries(localStorage).filter(([key, value]) =>
      key.startsWith('hermes-mobile.session.') && key.endsWith('.selected') && value)),
    tools: document.querySelectorAll('.chat-view.active .transcript > .tool-card').length,
  }))
  if (!initial.chatActive || !initial.title || initial.title === 'New conversation' ||
      initial.draft || !Object.keys(initial.selected).length ||
      await page.getByRole('button', { name: 'Stop running turn' }).count()) {
    throw new Error('An idle selected Chat session with no unsent draft is required')
  }
  selected = initial.selected
  report.beforeTools = initial.tools

  // Simulate the React-unowned tool card observed on the affected phone.
  // No actual chat text, call arguments, or session identifiers are copied.
  await page.evaluate(() => {
    const viewport = document.querySelector('.chat-view.active .transcript')
    const orphan = document.createElement('article')
    orphan.className = 'tool-card'
    orphan.dataset.qaOrphan = 'true'
    orphan.textContent = 'Synthetic stale card'
    viewport.insertBefore(orphan, viewport.firstChild)
  })
  const inspect = () => page.evaluate(() => ({
    orphan: Boolean(document.querySelector('.chat-view.active .transcript [data-qa-orphan]')),
    tools: document.querySelectorAll('.chat-view.active .transcript > .tool-card').length,
    empty: document.querySelectorAll('.chat-view.active .thread-empty').length,
  }))
  for (const attempt of [1, 2]) {
    await page.getByRole('button', { name: /^Options/ }).click()
    await page.getByRole('button', { name: /New session/ }).click()
    await page.locator('.chat-view.active .thread-empty').waitFor({ timeout: 5_000 })
    if (attempt === 1) report.afterFirstNew = await inspect()
    else report.afterSecondNew = await inspect()
  }

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Sessions' }).click()
  await page.getByPlaceholder('Search title, cwd, branch, source, or model').fill(initial.title)
  await page.locator('.session-row').filter({ hasText: initial.title }).first().click()
  await page.locator('.chat-view.active .transcript').waitFor({ timeout: 20_000 })
  report.restored = await page.evaluate(saved => Object.entries(saved).every(([key, value]) =>
    localStorage.getItem(key) === value), selected)
  report.status = report.restored && [report.afterFirstNew, report.afterSecondNew].every(row =>
    row && !row.orphan && row.tools === 0 && row.empty === 1) ? 'pass' : 'fail'
} catch (error) {
  report.reason = String(error?.message || error).slice(0, 250)
} finally {
  if (page) {
    try { await page.evaluate(() => document.querySelectorAll('[data-qa-orphan]').forEach(node => node.remove())) }
    catch { report.cleanup = 'synthetic marker removal unverified' }
    if (Object.keys(selected).length && !report.restored) {
      try {
        await page.evaluate(saved => {
          for (const [key, value] of Object.entries(saved)) localStorage.setItem(key, value)
        }, selected)
        await page.reload()
        report.cleanup = 'restored selected session through reload'
      } catch { report.cleanup = 'selected session restoration failed' }
    }
  }
  await browser?.close()
  await mkdir(values.out, { recursive: true })
  const output = path.join(values.out, 'session-boundary.json')
  await writeFile(output, JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify({ ...report, output }))
}
if (report.status !== 'pass') process.exitCode = 1
