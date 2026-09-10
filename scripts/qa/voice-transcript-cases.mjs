// Exercise the production hook and voice page together, using only synthetic I/O.
export async function voiceTranscriptCases({ page, url, check }) {
  async function fresh(local = false) {
    await page.goto(`${url}/qa/realtime.html?voicePage`, { timeout: 30000 })
    await page.waitForFunction(() => Boolean(window.qa))
    await page.evaluate(local => local
      ? window.qa.realtime.startContext({ context: [], contextId: 'synthetic-context', contextTitle: 'Context' })
      : window.qa.realtime.start(), local)
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'listening')
    await page.evaluate(() => {
      const q = window.qa
      q.frame({ type: 'response.created', response: { id: 'greeting', metadata: q.sent.at(-1).response.metadata } })
      q.frame({ type: 'response.done', response: { id: 'greeting', status: 'completed', output: [] } })
    })
  }
  async function begin(id, text) {
    await page.evaluate(({ id, text }) => {
      const q = window.qa
      q.frame({ type: 'input_audio_buffer.speech_started', item_id: id })
      q.frame({ type: 'conversation.item.input_audio_transcription.completed', item_id: id, transcript: `Question ${id}` })
      q.frame({ type: 'response.created', response: { id, metadata: q.sent.at(-1).response.metadata } })
      if (text) q.frame({ type: 'response.output_audio_transcript.delta', response_id: id, delta: text })
    }, { id, text })
  }
  async function finalText(id, text) {
    await page.evaluate(({ id, text }) => window.qa.frame({ type: 'response.output_audio_transcript.done', response_id: id, transcript: text }), { id, text })
  }
  async function done(id) {
    await page.evaluate(id => window.qa.frame({ type: 'response.done', response: { id, status: 'completed', output: [] } }), id)
  }
  async function live(text) {
    await page.waitForFunction(text => window.qa.realtime.snapshot.transcript === text, text)
  }
  async function cards(saved, preview) {
    await page.waitForFunction(({ saved, preview }) =>
      document.querySelectorAll('.pet-sidechat-message.assistant:not(.pet-realtime-live-text)').length === saved &&
      document.querySelectorAll('.pet-realtime-live-text').length === preview, { saved, preview })
  }
  await check('VOICE-TRANSCRIPT-HANDOFF', 'Saved history replaces its live card while the call stays active, including repeated final events.', async () => {
    await fresh()
    await begin('one', 'Synthetic answer.')
    await live('Synthetic answer.')
    await cards(0, 1)
    await finalText('one', 'Synthetic answer.')
    await done('one')
    await cards(0, 1) // Pending persistence must not discard the only visible copy.
    await page.evaluate(() => window.qa.releaseRecord())
    await live('')
    await cards(1, 0)
    await finalText('one', 'Synthetic answer.')
    await done('one')
    await live('')
    await cards(1, 0)
    const state = await page.evaluate(() => ({ active: window.qa.realtime.snapshot.active,
      records: window.qa.gatewayCalls.filter(c => c.method === 'pet.realtime.record').length }))
    if (!state.active || state.records !== 1) throw new Error('Handoff ended the call or recorded the same turn twice')
  })
  await check('VOICE-TRANSCRIPT-LATE-FINAL', 'A final transcript arriving after response completion still hands off once.', async () => {
    await fresh()
    await begin('late', '')
    await done('late')
    await finalText('late', 'Late final answer.')
    await page.evaluate(() => window.qa.releaseRecord())
    await live('')
    await cards(1, 0)
  })
  await check('VOICE-TRANSCRIPT-FAILED-SAVE', 'A failed save keeps the only visible reply and exposes the error.', async () => {
    await fresh()
    await page.evaluate(() => window.qa.setRecordMode('fail'))
    await begin('failure', 'Unsaved answer.')
    await done('failure')
    await page.waitForFunction(() => window.qa.realtime.snapshot.error === 'Synthetic save failure')
    await live('Unsaved answer.')
    await cards(0, 1)
  })
  await check('VOICE-TRANSCRIPT-NO-HISTORY', 'A record receipt without history does not hide the live reply.', async () => {
    await fresh()
    await page.evaluate(() => window.qa.setRecordMode('empty'))
    await begin('empty', 'Unpublished answer.')
    await done('empty')
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'listening')
    await live('Unpublished answer.')
    await cards(0, 1)
  })
  await check('VOICE-TRANSCRIPT-NEXT-TURN', 'An old save cannot clear the next live turn, even when its words are identical.', async () => {
    await fresh()
    await begin('first', 'Repeated answer.')
    await done('first')
    await begin('second', 'Repeated answer.')
    await page.evaluate(() => window.qa.releaseRecord())
    await live('Repeated answer.')
    await cards(1, 1)
    await done('second')
    await page.evaluate(() => window.qa.releaseRecord())
    await live('')
    await cards(2, 0)
  })
  await check('VOICE-TRANSCRIPT-LOCAL', 'Sessionless context voice hands off to local history without a record RPC.', async () => {
    await fresh(true)
    await begin('context', 'Context answer.')
    await done('context')
    await live('')
    await cards(1, 0)
    await finalText('context', 'Context answer.')
    await live('')
    if (await page.evaluate(() => window.qa.gatewayCalls.some(c => c.method === 'pet.realtime.record'))) throw new Error('Context voice used session persistence')
  })
  await check('VOICE-CURRENT-REVIEW-STATE', 'Context reads distinguish a pending draft from an accepted request and expose the current assistant answer.', async () => {
    await fresh()
    async function tool(name, id, args = {}) {
      await page.evaluate(({ name, id, args }) => {
        const q = window.qa
        q.frame({ type: 'response.created', response: { id } })
        q.frame({ type: 'response.done', response: { id, status: 'completed', output: [
          { type: 'function_call', name, call_id: id, arguments: JSON.stringify(args) },
        ] } })
      }, { name, id, args })
      await page.waitForFunction(id => window.qa.sent.some(e => e.item?.call_id === id), id)
      return page.evaluate(id => JSON.parse(window.qa.sent.find(e => e.item?.call_id === id).item.output), id)
    }
    await tool('draft_hermes_request', 'draft-evidence', { message: 'Inspect the synthetic task.' })
    let result = await tool('get_context_snapshot', 'before-submit')
    if (result.voiceRequest?.pendingReview !== true) throw new Error('Current pending review is absent from context')
    await page.evaluate(() => window.qa.realtime.approveHermesDraft())
    await page.evaluate(() => window.qa.setSessionContext({
      session: { sessionId: 'synthetic-session', running: false },
      context: [
        { role: 'user', content: 'Inspect the synthetic task.' },
        { role: 'assistant', content: 'The complete synthetic result.' },
        { role: 'assistant', source: 'tool_activity', content: 'An old tool status.' },
      ],
    }))
    result = await tool('get_context_snapshot', 'after-submit')
    if (result.voiceRequest?.pendingReview !== false || result.voiceRequest?.lastSubmission?.status !== 'accepted') throw new Error('Accepted request still lacks current review state')
    if (result.latestAssistantMessage?.content !== 'The complete synthetic result.') throw new Error('Latest answer lost behind tool activity')
    result = await tool('get_session_activity', 'activity-after-submit')
    if (result.latestAssistantMessage?.content !== 'The complete synthetic result.' || result.voiceRequest?.pendingReview !== false) throw new Error('Activity read hid the available result or current approval state')
    await tool('draft_hermes_request', 'next-draft', { message: 'A different synthetic task.' })
    result = await tool('get_context_snapshot', 'new-pending')
    if (result.voiceRequest?.pendingReview !== true || result.voiceRequest?.lastSubmission?.status !== 'accepted') throw new Error('Prior acceptance incorrectly approves a new draft')
  })
}
