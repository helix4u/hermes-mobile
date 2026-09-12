// Real hook with synthetic transcripts. No provider call or live microphone.
export async function voiceApprovalCases({ page, url, check }) {
  async function draft() {
    await page.goto(`${url}/qa/realtime.html`, { timeout: 30000 })
    await page.waitForFunction(() => Boolean(window.qa))
    await page.evaluate(async () => {
      const q = window.qa
      q.realtime.setSettings({ ...q.realtime.settings, approval: 'on' })
      await q.realtime.start()
      const metadata = q.sent.filter(event => event.type === 'response.create').at(-1).response.metadata
      q.frame({ type: 'response.created', response: { id: 'draft', metadata } })
      q.frame({ type: 'response.done', response: { id: 'draft', status: 'completed', output: [{
        type: 'function_call', name: 'draft_hermes_request', call_id: 'draft-review',
        arguments: JSON.stringify({ message: 'Inspect the build. Do not change files.' }),
      }] } })
    })
    await page.waitForFunction(() => window.qa.realtime.snapshot.hermesDraftStatus === 'pending')
  }

  async function say(text) {
    await page.evaluate(text => {
      const q = window.qa
      q.frame({ type: 'input_audio_buffer.speech_started', item_id: 'spoken-review-reply' })
      q.frame({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'spoken-review-reply', transcript: text })
    }, text)
  }

  for (const [name, speech] of [
    ['YES', 'Yes, send it.'],
    ['CANCEL', 'Do not send that.'],
    ['FILLER', 'Hmm.'],
    ['REVISION', 'No, include renderer timing too.'],
  ]) await check(`HOOK-CARD-ONLY-${name}`, 'Speech remains conversation input and cannot send, cancel, clear, or overwrite the pending Hermes review.', async () => {
    await draft()
    await say(speech)
    await page.waitForTimeout(100)
    const state = await page.evaluate(() => ({ approved: window.qa.approved, snapshot: window.qa.realtime.snapshot }))
    if (state.approved.length) throw new Error('Speech submitted Hermes work')
    if (state.snapshot.hermesDraftStatus !== 'pending') throw new Error('Speech cleared or changed review state')
    if (state.snapshot.hermesDraft !== 'Inspect the build. Do not change files.') throw new Error('Speech overwrote the review draft')
  })

  await check('HOOK-CARD-ONLY-SEND', 'Only the explicit review-card action sends the exact current edited draft once.', async () => {
    await draft()
    const sent = await page.evaluate(async () => {
      const q = window.qa
      q.realtime.updateHermesDraft('Inspect only the failing build. Do not change files.')
      return await q.realtime.approveHermesDraft()
    })
    await page.waitForFunction(() => window.qa.realtime.snapshot.hermesDraftStatus === 'sent')
    const state = await page.evaluate(() => ({ approved: window.qa.approved, snapshot: window.qa.realtime.snapshot }))
    if (!sent || state.approved.length !== 1) throw new Error('Explicit card send did not submit exactly once')
    if (state.approved[0].displayText !== 'Inspect only the failing build. Do not change files.') throw new Error('Card sent stale or altered text')
  })

  await check('HOOK-CARD-ONLY-CANCEL', 'Only the explicit review-card cancel action clears the pending draft without execution.', async () => {
    await draft()
    await page.evaluate(() => window.qa.realtime.cancelHermesDraft())
    const state = await page.evaluate(() => ({ approved: window.qa.approved, snapshot: window.qa.realtime.snapshot }))
    if (state.approved.length) throw new Error('Card cancellation executed work')
    if (state.snapshot.hermesDraftStatus !== 'idle' || state.snapshot.hermesDraft) throw new Error('Card cancellation did not clear the draft')
  })
}
