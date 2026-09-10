// Real hook with synthetic approval utterances. No live model or user transcript.
export async function voiceApprovalCases({ page, url, check }) {
  async function draft() {
    await page.goto(`${url}/qa/realtime.html`, { timeout: 30000 })
    await page.waitForFunction(() => Boolean(window.qa))
    await page.evaluate(async () => {
      const q = window.qa
      q.realtime.setSettings({ ...q.realtime.settings, approval: 'verbal' })
      await q.realtime.start()
    })
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'listening')
    await page.evaluate(() => {
      const q = window.qa
      q.frame({ type: 'response.created', response: { id: 'draft', metadata: q.sent.at(-1).response.metadata } })
      q.frame({ type: 'response.done', response: { id: 'draft', status: 'completed', output: [
        { type: 'function_call', name: 'draft_hermes_request', call_id: 'draft-review',
          arguments: JSON.stringify({ message: 'Inspect the build. Do not change files.' }) },
      ] } })
    })
    await page.waitForFunction(() => window.qa.realtime.snapshot.hermesDraftStatus === 'pending')
  }
  async function read(text, id = 'readback') {
    await page.evaluate(({ text, id }) => {
      const q = window.qa
      const metadata = q.sent.filter(e => e.type === 'response.create').at(-1).response.metadata
      q.frame({ type: 'response.created', response: { id, metadata } })
      q.frame({ type: 'output_audio_buffer.started', response_id: id })
      q.frame({ type: 'response.output_audio_transcript.done', response_id: id, transcript: text })
      q.frame({ type: 'response.done', response: { id, status: 'completed', output: [] } })
      q.frame({ type: 'output_audio_buffer.stopped', response_id: id })
    }, { text, id })
  }
  async function say(text, id = 'user') {
    await page.evaluate(({ text, id }) => {
      const q = window.qa
      q.frame({ type: 'input_audio_buffer.speech_started', item_id: id })
      q.frame({ type: 'conversation.item.input_audio_transcription.completed', item_id: id, transcript: text })
    }, { text, id })
  }
  await check('HOOK-VERBAL-PREFACE', 'A complete drained draft with a harmless introduction submits once after yes, without another model reply.', async () => {
    await draft()
    await read("Okay, here's the exact draft word for word: Inspect the build. Do not change files. Send that?")
    const before = await page.evaluate(() => window.qa.sent.filter(e => e.type === 'response.create').length)
    await say('Yes, send it.')
    await page.waitForFunction(() => window.qa.approved.length === 1)
    const state = await page.evaluate(() => ({ sent: window.qa.sent, requests: window.qa.approved }))
    if (state.requests[0].displayText !== 'Inspect the build. Do not change files.') throw new Error('Draft changed')
    if (state.sent.filter(e => e.type === 'response.create').length !== before) throw new Error('Yes fell through to model')
  })
  await check('HOOK-VERBAL-RECOVERY', 'An unverifiable yes gets one constrained reread, never a free-form approval loop or an unsafe send.', async () => {
    await draft()
    await read('Inspect the build. Send that?')
    await say('Yes.')
    const response = await page.evaluate(() => window.qa.sent.filter(e => e.type === 'response.create').at(-1).response)
    if (response.tool_choice !== 'none' || !response.instructions?.includes('Do not change files.')) throw new Error('Missing exact constrained recovery')
    await read('Inspect the build. Send that?', 'failed-retry')
    await say('Yes, send it.', 'second-yes')
    await page.waitForFunction(() => window.qa.realtime.snapshot.error.includes('readback'))
    if (await page.evaluate(() => window.qa.approved.length)) throw new Error('Incomplete draft sent')
  })
  await check('HOOK-VERBAL-CANCEL', 'A natural cancellation clears only the pending draft and gives voice a silent state receipt.', async () => {
    await draft()
    await read('Inspect the build. Do not change files. Send that?')
    const before = await page.evaluate(() => window.qa.sent.filter(e => e.type === 'response.create').length)
    await say("Go ahead and cancel this. So we're just going to call that failed.")
    await page.waitForFunction(() => window.qa.realtime.snapshot.hermesDraftStatus === 'idle')
    const state = await page.evaluate(() => ({ sent: window.qa.sent, requests: window.qa.approved }))
    if (state.requests.length || state.sent.filter(e => e.type === 'response.create').length !== before) throw new Error('Cancellation executed work or began a speech')
    if (!state.sent.some(e => e.item?.content?.[0]?.text?.includes('draft_cancelled'))) throw new Error('Voice was not told cancellation happened')
  })
  await check('HOOK-UI-CANCEL-RECEIPT', 'UI cancellation is reflected in voice context without another unsolicited response.', async () => {
    await draft()
    const before = await page.evaluate(() => window.qa.sent.filter(e => e.type === 'response.create').length)
    await page.evaluate(() => window.qa.realtime.cancelHermesDraft())
    const state = await page.evaluate(() => window.qa.sent)
    if (!state.some(e => e.item?.content?.[0]?.text?.includes('draft_cancelled'))) throw new Error('No UI cancellation receipt')
    if (state.filter(e => e.type === 'response.create').length !== before) throw new Error('Cancellation started speech')
  })
  for (const variant of ['parts', 'late-text']) await check(`HOOK-VERBAL-${variant.toUpperCase()}`, 'Complete response-scoped readback survives multiple audio parts and delayed finalized text without a second send.', async () => {
    await draft()
    await page.evaluate(variant => {
      const q = window.qa
      const id = 'owned-readback'
      const metadata = q.sent.filter(e => e.type === 'response.create').at(-1).response.metadata
      q.frame({ type: 'response.created', response: { id, metadata } })
      q.frame({ type: 'output_audio_buffer.started', response_id: id })
      if (variant === 'parts') {
        q.frame({ type: 'response.output_audio_transcript.done', response_id: id, item_id: 'one', content_index: 0, transcript: 'Inspect the build.' })
        q.frame({ type: 'response.output_audio_transcript.done', response_id: id, item_id: 'one', content_index: 0, transcript: 'Inspect the build.' })
        q.frame({ type: 'response.output_audio_transcript.done', response_id: id, item_id: 'two', content_index: 0, transcript: 'Do not change files. Send that?' })
      }
      q.frame({ type: 'response.done', response: { id, status: 'completed', output: [] } })
      q.frame({ type: 'output_audio_buffer.stopped', response_id: id })
      q.frame({ type: 'input_audio_buffer.speech_started', item_id: 'approval' })
      if (variant === 'late-text') q.frame({ type: 'response.output_audio_transcript.done', response_id: id, transcript: 'Inspect the build. Do not change files. Send that?' })
      q.frame({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'approval', transcript: 'Yes.' })
    }, variant)
    await page.waitForFunction(() => window.qa.approved.length === 1)
    const state = await page.evaluate(() => ({ approved: window.qa.approved, snapshot: window.qa.realtime.snapshot }))
    if (state.approved[0].displayText !== 'Inspect the build. Do not change files.') throw new Error('Changed draft sent')
    if (state.snapshot.hermesDraftStatus !== 'sent') throw new Error('Submission did not settle')
  })
  for (const mode of ['pet', 'session']) await check(`HOOK-DELIVERY-${mode.toUpperCase()}`, 'Both voice modes receive concise-delivery instructions once, before speaking, without changing the selected model.', async () => {
    await page.goto(`${url}/qa/realtime.html`, { timeout: 30000 })
    await page.waitForFunction(() => Boolean(window.qa))
    await page.evaluate(async mode => {
      const q = window.qa
      q.realtime.setSettings({ ...q.realtime.settings, mode, model: 'gpt-realtime-2.1-mini' })
      await q.realtime.start()
    }, mode)
    const state = await page.evaluate(() => ({ sent: window.qa.sent, calls: window.qa.gatewayCalls }))
    const delivery = state.sent.map((event, index) => ({ event, index })).filter(({ event }) =>
      event.item?.role === 'system' && event.item.content?.[0]?.text?.startsWith('# Spoken delivery'))
    if (delivery.length !== 1 || delivery[0].index >= state.sent.findIndex(e => e.type === 'response.create')) throw new Error('Delivery rules missing or late')
    const request = state.calls.find(c => c.method === 'pet.realtime.session')
    if (request.params.model !== 'gpt-realtime-2.1-mini' || request.params.interactionMode !== mode) throw new Error('Model or mode changed')
  })
}
