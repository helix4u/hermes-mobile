export async function supportVoiceApprovalCases({ page, url, check }) {
  async function stage() {
    await page.goto(`${url}/qa/realtime.html`, { timeout: 30000 })
    await page.waitForFunction(() => Boolean(window.qa))
    await page.evaluate(() => window.qa.startSupport())
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'listening')
    await page.evaluate(() => {
      const q = window.qa
      const metadata = q.sent.filter(event => event.type === 'response.create').at(-1).response.metadata
      q.frame({ type: 'response.created', response: { id: 'proposal', metadata } })
      q.frame({ type: 'response.done', response: { id: 'proposal', status: 'completed', output: [{
        type: 'function_call', name: 'propose_attached_action', call_id: 'support-review', arguments: '{}',
      }] } })
    })
    await page.waitForFunction(() => Boolean(window.qa.supportSnapshot()))
  }

  async function say(text) {
    await page.evaluate(text => {
      const q = window.qa
      q.frame({ type: 'input_audio_buffer.speech_started', item_id: 'spoken-review-reply' })
      q.frame({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'spoken-review-reply', transcript: text })
    }, text)
  }

  for (const [name, speech] of [['YES', 'Yes, send it.'], ['NO', 'Do not send.'], ['FILLER', 'Hmm.']]) {
    await check(`HOOK-SUPPORT-CARD-ONLY-${name}`, 'Support review state is owned by its visible card. Speech cannot approve or cancel it.', async () => {
      await stage()
      const before = await page.evaluate(() => window.qa.supportSnapshot())
      await say(speech)
      await page.waitForTimeout(100)
      const state = await page.evaluate(() => ({ approvals: window.qa.supportApprovals, review: window.qa.supportSnapshot() }))
      if (state.approvals.length) throw new Error('Speech approved Support work')
      if (!state.review || JSON.stringify(state.review) !== JSON.stringify(before)) throw new Error('Speech changed or cleared the Support review')
    })
  }
}
