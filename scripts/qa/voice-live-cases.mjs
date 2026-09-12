// Actual Mobile hook, documented Live Responses events, no model calls.
export async function voiceLiveCases({ page, url, check }) {
  const fresh = async () => {
    await page.goto(`${url}/qa/realtime.html`, { timeout: 30000 })
    await page.waitForFunction(() => Boolean(window.qa))
    await page.evaluate(async () => {
      await window.qa.startLive()
      window.qa.frame({ type: 'session.started', session: { id: 'live_synthetic' } })
    })
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'listening')
  }
  const tool = async (id, name, args) => {
    await page.evaluate(({ id, name, args }) => {
      const frame = event => window.qa.frame({ type: 'response.event', delegation_id: 'delegation_fixture', event })
      frame({ type: 'response.created', response: { id } })
      frame({ type: 'response.output_item.done', item: { type: 'function_call', call_id: id, name, arguments: JSON.stringify(args) } })
      // Live deliberately forwards no output items in this terminal event.
      frame({ type: 'response.completed', response: { id, output: [] } })
    }, { id, name, args })
    await page.waitForFunction(id => window.qa.sent.some(e => e.type === 'response.item.create' && e.item?.call_id === id), id)
  }
  await check('HOOK-GPT-LIVE', 'Only completed structured tools create and revise drafts. Speech remains conversation, with no magic words or automatic send.', async () => {
    await fresh()
    await page.evaluate(() => {
      window.qa.frame({ type: 'session.input_transcript.delta', delta: 'Can you help with the build?', start_ms: 100, end_ms: 300 })
      window.qa.frame({ type: 'session.output_transcript.delta', delta: 'Hmm. Yeah. Inspect the build. Send it?', start_ms: 400, end_ms: 800 })
    })
    if (await page.evaluate(() => Boolean(window.qa.realtime.snapshot.hermesDraft))) throw new Error('Captions became draft content')
    await tool('draft-one', 'draft_hermes_request', { message: 'Inspect the build.' })
    await page.waitForFunction(() => window.qa.realtime.snapshot.hermesDraft === 'Inspect the build.')
    await page.evaluate(() => window.qa.frame({ type: 'session.input_transcript.delta', delta: 'Yes, send it.', start_ms: 900, end_ms: 1200 }))
    if (await page.evaluate(() => window.qa.approved.length || window.qa.realtime.snapshot.hermesDraft !== 'Inspect the build.')) throw new Error('Speech mutated review')
    await tool('draft-revision', 'draft_hermes_request', { expectedDraft: 'Inspect the build.', message: 'Inspect the build and startup timing.' })
    await page.waitForFunction(() => window.qa.realtime.snapshot.hermesDraft === 'Inspect the build and startup timing.')
    await tool('draft-stale', 'draft_hermes_request', { expectedDraft: 'Inspect the build.', message: 'Stale edit.' })
    if (await page.evaluate(() => window.qa.realtime.snapshot.hermesDraft !== 'Inspect the build and startup timing.')) throw new Error('Stale revision replaced newer draft')
    await page.evaluate(() => window.qa.realtime.approveHermesDraft())
    await page.waitForFunction(() => window.qa.approved.length === 1 && window.qa.realtime.snapshot.hermesDraftStatus === 'sent')
    if (await page.evaluate(() => window.qa.approved[0].displayText !== 'Inspect the build and startup timing.')) throw new Error('Wrong submitted text')
    await tool('draft-revision', 'draft_hermes_request', { expectedDraft: 'Inspect the build.', message: 'Duplicate edit.' })
    if (await page.evaluate(() => window.qa.approved.length !== 1 || window.qa.realtime.snapshot.hermesDraftStatus !== 'sent')) throw new Error('Duplicate response recreated card')
    const sent = await page.evaluate(() => window.qa.sent)
    if (sent.filter(e => e.type === 'response.create').length !== 3) throw new Error('Not exactly one continuation per completed tool batch')
    if (sent.some(e => ['conversation.item.create', 'response.cancel', 'output_audio_buffer.clear'].includes(e.type))) throw new Error('Realtime command entered Live')
    await tool('late-revision', 'draft_hermes_request', { expectedDraft: 'Inspect the build and startup timing.', message: 'Late edit.' })
    if (await page.evaluate(() => window.qa.realtime.snapshot.hermesDraftStatus !== 'sent')) throw new Error('Late revision recreated a sent review')
  })
  await check('HOOK-GPT-LIVE-STARTUP-SILENCE', 'Startup installs context on the server, sends no greeting or transcript backlog from the client, and does not hide a running model behind mute.', async () => {
    await fresh()
    const state = await page.evaluate(() => ({
      sent: window.qa.sent,
      muted: document.querySelector('audio')?.muted,
      draft: window.qa.realtime.snapshot.hermesDraft,
    }))
    if (state.sent.some(e => e.type === 'response.create' || /session\.(thinking|commentary|instructions)\.append/.test(e.type))) throw new Error('Startup injected a new conversation turn')
    if (state.muted || state.draft) throw new Error('Startup masked media or created a draft')
    await page.evaluate(() => {
      window.qa.frame({ type: 'session.input_transcript.delta', delta: 'Explain the build.', start_ms: 100, end_ms: 300 })
      window.qa.frame({ type: 'session.output_transcript.delta', delta: 'The build has ', start_ms: 350, end_ms: 600 })
      window.qa.frame({ type: 'session.input_transcript.delta', delta: ']', start_ms: 650, end_ms: 700 })
      window.qa.frame({ type: 'session.output_transcript.delta', delta: 'two stages.', start_ms: 750, end_ms: 900 })
    })
    const result = await page.evaluate(() => ({ text: window.qa.realtime.snapshot.transcript, calls: window.qa.gatewayCalls }))
    if (result.text !== 'The build has two stages.' || result.calls.some(c => c.method === 'pet.realtime.record')) throw new Error('Interleaved caption cut the reply into false completed turns')
  })
  await check('HOOK-GPT-LIVE-NO-DELEGATION', 'Neither natural captions nor opaque client delegation fabricate a request. Provider response failures are visible.', async () => {
    await fresh()
    await page.evaluate(() => {
      window.qa.frame({ type: 'session.output_transcript.delta', delta: 'Inspect the current build. Send it?', start_ms: 100, end_ms: 500 })
      window.qa.frame({ type: 'session.delegation.created', delegation: { id: 'opaque', target: 'client' } })
      const frame = event => window.qa.frame({ type: 'response.event', delegation_id: 'failed', event })
      frame({ type: 'response.created', response: { id: 'failed' } })
      frame({ type: 'response.failed', response: { id: 'failed', error: { message: 'Synthetic backend failure' } } })
    })
    await page.waitForFunction(() => window.qa.realtime.snapshot.error === 'Synthetic backend failure')
    if (await page.evaluate(() => window.qa.realtime.snapshot.hermesDraft || window.qa.approved.length)) throw new Error('Non-tool event created work')
  })
  await check('HOOK-GPT-LIVE-FALSE-SEND', 'Legacy automatic approval settings cannot bypass Live review. Cancel uses Live protocol and removes the pending card.', async () => {
    await fresh()
    await page.evaluate(() => window.qa.realtime.setSettings({ ...window.qa.realtime.settings, approval: 'off' }))
    await tool('cancel-draft', 'draft_hermes_request', { message: 'Inspect the extension loader.' })
    if (await page.evaluate(() => window.qa.approved.length)) throw new Error('Automatic send bypassed review')
    await page.evaluate(() => window.qa.realtime.cancelHermesDraft())
    await page.waitForFunction(() => window.qa.realtime.snapshot.hermesDraftStatus === 'idle')
    const sent = await page.evaluate(() => window.qa.sent)
    if (sent.some(e => ['conversation.item.create', 'response.cancel', 'output_audio_buffer.clear'].includes(e.type))) throw new Error('Cancel used Realtime protocol')
  })
  await check('HOOK-GPT-LIVE-TOOLS', 'Live routes notebook and history reads through the same scoped handlers and returns their complete outputs before continuation.', async () => {
    await fresh()
    const memory = { scope: 'session', key: 'topic', content: 'Synthetic build topic', expectedRevision: 0 }
    await tool('save-memory', 'save_voice_memory', memory)
    await tool('read-history', 'read_session_context', { beforeRowId: 123, limit: 8 })
    const calls = await page.evaluate(() => window.qa.gatewayCalls)
    const save = calls.find(c => c.method === 'pet.realtime.knowledge')
    const read = calls.find(c => c.method === 'pet.realtime.context')
    if (save?.params.operation !== 'voice_memory_save' || save.params.session_id !== 'synthetic-session' || JSON.stringify(save.params.memory) !== JSON.stringify(memory)) throw new Error('Memory not wired to scoped RPC')
    if (read?.params.beforeRowId !== 123 || read.params.contextLimit !== 8 || read.params.session_id !== 'synthetic-session') throw new Error('History paging not wired')
  })
  await check('HOOK-GPT-LIVE-SINGLE-START', 'Concurrent Start keeps one owner. Disconnect ends without automatically greeting in a new call.', async () => {
    await page.goto(`${url}/qa/realtime.html`, { timeout: 30000 })
    await page.waitForFunction(() => Boolean(window.qa))
    await page.evaluate(() => Promise.all([window.qa.startLive(), window.qa.startLive()]))
    const before = await page.evaluate(() => ({ requests: window.qa.sessionRequests, peers: window.qa.peers.length }))
    if (before.requests !== 1 || before.peers !== 1) throw new Error('Start was not single flight')
    await page.evaluate(() => window.qa.disconnect())
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'error')
    await page.waitForTimeout(3500)
    if (await page.evaluate(() => window.qa.sessionRequests !== 1 || window.qa.peers.length !== 1)) throw new Error('Disconnect restarted voice')
  })
  await check('HOOK-GPT-LIVE-STOP-FLUSH', 'End voice persists its last observed exchange before releasing transport.', async () => {
    await fresh()
    await page.evaluate(() => {
      window.qa.setRecordMode('empty')
      window.qa.frame({ type: 'session.input_transcript.delta', delta: 'Explain the voice state.', start_ms: 100, end_ms: 300 })
      window.qa.frame({ type: 'session.output_transcript.delta', delta: 'The connection is active.', start_ms: 400, end_ms: 700 })
      window.qa.realtime.stop()
    })
    await page.waitForFunction(() => window.qa.gatewayCalls.some(c => c.method === 'pet.realtime.record'))
    const record = await page.evaluate(() => window.qa.gatewayCalls.findLast(c => c.method === 'pet.realtime.record')?.params)
    if (record?.userText !== 'Explain the voice state.' || record?.petText !== 'The connection is active.') throw new Error('Last exchange was lost')
  })
  await page.evaluate(() => window.qa.useRealtime())
}
