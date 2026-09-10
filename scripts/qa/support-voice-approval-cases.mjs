export async function supportVoiceApprovalCases({ page, url, check }) {
  async function stage() {
    await page.goto(`${url}/qa/realtime.html`, { timeout: 30000 })
    await page.waitForFunction(() => Boolean(window.qa))
    await page.evaluate(() => window.qa.startSupport())
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'listening')
    await page.evaluate(() => {
      const q = window.qa
      q.frame({ type: 'response.created', response: { id: 'proposal', metadata: q.sent.at(-1).response.metadata } })
      q.frame({ type: 'response.done', response: { id: 'proposal', status: 'completed', output: [{
        type: 'function_call', name: 'propose_attached_action', call_id: 'support-review', arguments: '{}',
      }] } })
    })
    await page.waitForFunction(() => window.qa.sent.some(e => e.type === 'response.create' && e.response.instructions?.includes('Synthetic issue')))
  }
  async function read(complete = true) {
    await page.evaluate(complete => {
      const q = window.qa
      const text = complete ? q.supportSnapshot().text : 'Inspect the failure.'
      q.frame({ type: 'response.created', response: { id: 'readback', metadata: q.sent.filter(e => e.type === 'response.create').at(-1).response.metadata } })
      q.frame({ type: 'output_audio_buffer.started', response_id: 'readback' })
      q.frame({ type: 'response.output_audio_transcript.done', response_id: 'readback', transcript: text + ' Send that?' })
      q.frame({ type: 'response.done', response: { id: 'readback', status: 'completed', output: [] } })
      q.frame({ type: 'output_audio_buffer.stopped', response_id: 'readback' })
    }, complete)
  }
  async function say(text) {
    await page.evaluate(text => {
      const q = window.qa
      q.frame({ type: 'input_audio_buffer.speech_started', item_id: 'spoken-approval' })
      q.frame({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'spoken-approval', transcript: text })
    }, text)
  }
  await check('HOOK-SUPPORT-VERBAL-APPROVE', 'Support proposals use exact app-owned readback and a spoken yes submits once without a model approval tool.', async () => {
    await stage()
    await read()
    const before = await page.evaluate(() => window.qa.sent.filter(e => e.type === 'response.create').length)
    await say('[noise] Yes, send it.')
    await page.waitForFunction(() => window.qa.supportApprovals.length === 1)
    const state = await page.evaluate(() => ({ requests: window.qa.supportApprovals, sent: window.qa.sent }))
    if (state.requests[0].targetId !== '100000000000000001' || state.requests[0].text !== 'Inspect the failure. Do not change files.') throw new Error('Wrong exact review submitted')
    if (state.sent.filter(e => e.type === 'response.create').length !== before) throw new Error('Approval fell through to a model continuation')
  })
  for (const change of ['text', 'targetId', 'action', 'id', 'cancel']) await check(`HOOK-SUPPORT-REVIEW-${change.toUpperCase()}`, 'Changed or cancelled Support review invalidates earlier spoken approval evidence.', async () => {
    await stage()
    await read()
    await page.evaluate(change => change === 'cancel' ? window.qa.cancelSupport() : window.qa.editSupport({ [change]: change === 'action' ? 'suggest_reply' : 'changed' }), change)
    await say('Yes.')
    if (await page.evaluate(() => window.qa.supportApprovals.length)) throw new Error('Old readback approved a changed review')
  })
  await check('HOOK-SUPPORT-INCOMPLETE', 'An incomplete Support readback cannot submit even when the user says yes.', async () => {
    await stage()
    await read(false)
    await say('Yes.')
    if (await page.evaluate(() => window.qa.supportApprovals.length)) throw new Error('Incomplete readback submitted')
  })
  await check('HOOK-SUPPORT-CANCEL', 'Spoken cancellation clears only the pending Support action without execution.', async () => {
    await stage()
    await read()
    await say('Do not send.')
    if (await page.evaluate(() => window.qa.supportApprovals.length || window.qa.supportSnapshot())) throw new Error('Cancellation did not clear pending review')
  })
}
