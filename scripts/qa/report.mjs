import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export function automationFailure(error) {
  if (error?.qaReason) return error.qaReason
  const message = String(error?.message || '')
  for (const [pattern, reason] of [
    [/Target.*closed|browser.*disconnected|Connection closed/i, 'Automation connection or page closed during the check.'],
    [/Execution context was destroyed|Cannot find context/i, 'Page navigation replaced the automation execution context.'],
    [/strict mode violation/i, 'Automation selector matched multiple controls.'],
    [/Timeout|timed out/i, 'Automation timed out waiting for the expected control or transport.'],
    [/ECONN|socket hang up|device offline/i, 'Automation transport became unavailable.'],
  ]) if (pattern.test(message)) return reason
  return 'Automation failed with an unclassified error; raw error text is omitted for privacy.'
}

export function summarize(checks, manual = []) {
  const count = status => checks.filter(check => check.status === status).length
  return { passed: count('pass'), failed: count('fail'), skipped: count('skip'),
    todo: checks.filter(check => check.status === 'fail').map(check => ({ id: check.id, reason: check.reason })),
    notObserved: checks.filter(check => check.status === 'skip').map(check => ({ id: check.id, reason: check.reason })),
    manual }
}

export async function saveReport(directory, report) {
  const summary = summarize(report.checks, report.manual)
  const result = { ...report, summary }
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'report.json'), JSON.stringify(result, null, 2) + '\n')
  const lines = ['# Mobile regression run', '', `Layer: ${report.layer}`, '',
    `${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped.`, '',
    '| Check | Result | ms | Reason |', '| --- | --- | ---: | --- |',
    ...report.checks.map(c => `| ${c.id} | ${c.status} | ${c.ms ?? 0} | ${c.reason.replaceAll('|', '/').replaceAll('\n', ' ')} |`),
    '', '## Bug TODO after testing', '',
    ...summary.todo.map(c => `- [ ] ${c.id}: ${c.reason}`), '']
  if (!summary.todo.length) lines.push('No unresolved checks in this scoped run. This is not whole-app certification.', '')
  if (summary.notObserved.length) lines.push('## Not observed in this run', '',
    ...summary.notObserved.map(c => `- ${c.id}: ${c.reason}`), '')
  if (summary.manual.length) lines.push('## Separate physical acceptance', '',
    ...summary.manual.map(c => `- [ ] ${c.id}: ${c.reason}`), '')
  await writeFile(path.join(directory, 'report.md'), lines.join('\n'))
  return summary
}
