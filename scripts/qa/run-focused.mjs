import { readFile, mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { saveReport } from './report.mjs'
const root = fileURLToPath(new URL('../../', import.meta.url))
const catalog = JSON.parse(await readFile(new URL('mobile-ui-cases.json', import.meta.url)))
const { values } = parseArgs({ options: { out: { type: 'string' } } })
const out = path.resolve(values.out || path.join(root, 'output/qa', `focused-${Date.now()}`))
await mkdir(out, { recursive: true })
const startedAt = new Date().toISOString()
const child = spawn(process.execPath, [path.join(root, 'node_modules/vitest/vitest.mjs'),
  'run', '--maxWorkers=4', '--reporter=default', '--reporter=json',
  `--outputFile.json=${path.join(out, 'vitest.json')}`, ...catalog.focusedTargets],
  { cwd: root, stdio: 'inherit', windowsHide: true })
const code = await new Promise(resolve => {
  child.on('error', () => resolve(1))
  child.on('exit', code => resolve(code ?? 1))
})
let checks
try {
  const result = JSON.parse(await readFile(path.join(out, 'vitest.json')))
  checks = result.testResults.flatMap(file => file.assertionResults.map((test, index) => ({
    id: `${path.relative(root, file.name).replaceAll('\\', '/')}#${index + 1}`,
    status: test.status === 'passed' ? 'pass' : test.status === 'failed' ? 'fail' : 'skip',
    reason: test.fullName, ms: Math.round(test.duration || 0),
  })))
  if (code && !checks.some(c => c.status === 'fail')) checks.push({ id: 'RUNNER', status: 'fail', reason: 'Runner exited unsuccessfully outside test assertions.' })
} catch { checks = [{ id: 'RUNNER', status: 'fail', reason: 'Focused test report was not produced.' }] }
const summary = await saveReport(out, { schema: 1, layer: 'isolated-focused', startedAt,
  finishedAt: new Date().toISOString(), checks, manual: catalog.manual })
console.log(JSON.stringify({ ...summary, report: path.join(out, 'report.json') }))
process.exitCode = code || (summary.failed ? 1 : 0)
