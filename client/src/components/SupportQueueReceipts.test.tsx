import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SupportActivityView } from './SupportActivityView'

describe('Support activity page', () => {
  it('keeps id-only acceptance out of finished history', () => {
    const html = renderToStaticMarkup(<SupportActivityView connected busy={false} onCancel={() => {}} onRetry={() => {}}
      unconfirmed={[]} receipts={[{ job: { id: '111111111111' }, label: 'Workflow', submitted: true }]} />)
    expect(html).toContain('Checking status')
    expect(html).not.toContain('Recent activity')
  })
  it('renders running and queued groups separately and retains completion results', () => {
    const html = renderToStaticMarkup(<SupportActivityView connected busy={false} onCancel={() => {}} onRetry={() => {}}
      unconfirmed={[]} receipts={[
        { job: { id: '111111111111', kind: 'investigate', status: 'running' }, label: 'Investigation', submitted: true },
        { job: { id: '222222222222', kind: 'draft_reply', status: 'queued', provenance: { profile: 'synthetic-profile' } }, label: 'Draft', submitted: true },
        { job: { id: '333333333333', status: 'completed', result: { filename: 'synthetic-backup.json' } }, label: 'Backup', submitted: true },
      ]} />)
    expect(html).toContain('Running')
    expect(html).toContain('Waiting to start')
    expect(html).toContain('>Cancel</button>')
    expect(html).toContain('synthetic-profile')
    expect(html).toContain('Technical details')
    expect(html).toContain('Recent activity (1)')
    expect(html).toContain('Backup saved as synthetic-backup.json')
  })

  it('does not present an unavailable status read as a failed operation', () => {
    const html = renderToStaticMarkup(<SupportActivityView connected busy={false} onCancel={() => {}} onRetry={() => {}}
      unconfirmed={[]} receipts={[{ job: { id: '111111111111', status: 'queued' }, label: 'Workflow', submitted: true, pollError: 'synthetic timeout' }]} />)
    expect(html).toContain('The accepted task is still tracked')
    expect(html).toContain('queued')
    expect(html).not.toContain('Workflow failed')
  })

  it('keeps cancellation and unsafe retries disabled while disconnected', () => {
    const html = renderToStaticMarkup(<SupportActivityView connected={false} busy={false} onCancel={() => {}} onRetry={() => {}}
      unconfirmed={[{ id: 'synthetic-request', label: 'Workflow', error: 'synthetic timeout', retryable: false, sending: false }]}
      receipts={[{ job: { id: '111111111111', status: 'queued' }, label: 'Workflow', submitted: true }]} />)
    expect(html).toContain('disabled=""')
    expect(html).toContain('Acceptance is unconfirmed')
    expect(html).toContain('does not advertise safe retries')
  })
})
