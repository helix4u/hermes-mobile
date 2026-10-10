// Real hook with synthetic transcripts. No provider call or live microphone.
export async function voiceApprovalCases({ page, url, check }) {
  async function draft(query = '') {
    await page.goto(`${url}/qa/realtime.html${query}`, { timeout: 30000 })
    await page.waitForFunction(() => Boolean(window.qa))
    await page.evaluate(async () => {
      const q = window.qa
      q.realtime.setSettings({ ...q.realtime.settings, engine: 'realtime', approval: 'on' })
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

  await check('HOOK-SEND-UNBOUND-REFUSAL', 'A missing current session binding is a visible definite refusal, with no dispatch and no stuck Sending state.', async () => {
    await draft('?unbound')
    const sent = await page.evaluate(() => window.qa.realtime.approveHermesDraft())
    const state = await page.evaluate(() => ({ approved: window.qa.approved, snapshot: window.qa.realtime.snapshot }))
    if (sent || state.approved.length || state.snapshot.hermesDraftStatus !== 'error' || !state.snapshot.error.includes('Nothing was sent')) {
      throw new Error('Pre-send scope refusal left the review submitting or hid its error')
    }
  })

  for (const outcome of ['accepted', 'uncertain']) {
    await check(`HOOK-SEND-RECONNECT-${outcome.toUpperCase()}`, 'Same-target voice reconnect cannot discard the owned admission result or leave the send guard stuck.', async () => {
      await draft()
      await page.evaluate(() => {
        const q = window.qa
        q.holdApproval()
        q.approving = q.realtime.approveHermesDraft()
      })
      await page.waitForFunction(() => window.qa.approved.length === 1)
      await page.evaluate(() => window.qa.disconnect())
      await page.waitForFunction(() => window.qa.tracks.length === 2 && window.qa.realtime.snapshot.status === 'listening')
      await page.evaluate(async outcome => {
        if (outcome === 'accepted') window.qa.releaseApproval()
        else window.qa.rejectApproval()
        await window.qa.approving
      }, outcome)
      const state = await page.evaluate(() => ({ count: window.qa.approved.length, snapshot: window.qa.realtime.snapshot }))
      if (state.count !== 1 || state.snapshot.hermesDraftStatus !== (outcome === 'accepted' ? 'sent' : 'uncertain')) {
        throw new Error('Reconnect discarded the delivery verdict or duplicated submission')
      }
      if (outcome === 'uncertain') {
        if (!state.snapshot.error.includes('Delivery not confirmed')) throw new Error('Unconfirmed admission was hidden')
        if (await page.evaluate(() => window.qa.realtime.approveHermesDraft())) throw new Error('Unconfirmed admission was resent')
      }
    })
  }

  await check('HOOK-SEND-STOP-LATE-RECEIPT', 'Stopping voice retires the review owner, and a late admission result cannot resurrect it.', async () => {
    await draft()
    await page.evaluate(() => { window.qa.holdApproval(); window.qa.approving = window.qa.realtime.approveHermesDraft() })
    await page.waitForFunction(() => window.qa.approved.length === 1)
    await page.evaluate(async () => { window.qa.realtime.stop(); window.qa.releaseApproval(); await window.qa.approving })
    const state = await page.evaluate(() => window.qa.realtime.snapshot)
    if (state.hermesDraftStatus !== 'idle' || state.hermesDraft) throw new Error('Late receipt resurrected a stopped review')
  })

  await check('HOOK-SEND-TARGET-LATE-RECEIPT', 'Switching sessions retires the old review, frees its guard and fences a late old admission from a newer review.', async () => {
    await draft()
    await page.evaluate(() => { window.qa.holdApproval(); window.qa.oldApproval = window.qa.realtime.approveHermesDraft() })
    await page.waitForFunction(() => window.qa.approved.length === 1)
    await page.evaluate(() => window.qa.setRuntimeSessionId('synthetic-other-session'))
    await page.waitForFunction(() => window.qa.tracks.length === 2 && window.qa.realtime.snapshot.status === 'listening')
    const reset = await page.evaluate(() => window.qa.realtime.snapshot)
    if (reset.hermesDraft || reset.hermesDraftStatus !== 'idle') throw new Error('Old review followed the new session')
    await say('Prepare a different request.')
    await page.evaluate(() => {
      const q = window.qa
      const metadata = q.sent.filter(event => event.type === 'response.create').at(-1).response.metadata
      q.frame({ type: 'response.created', response: { id: 'new-target-draft', metadata } })
      q.frame({ type: 'response.done', response: { id: 'new-target-draft', status: 'completed', output: [{
        type: 'function_call', name: 'draft_hermes_request', call_id: 'new-target-review',
        arguments: JSON.stringify({ message: 'Inspect the other task. Do not change files.' }),
      }] } })
    })
    await page.waitForFunction(() => window.qa.realtime.snapshot.hermesDraftStatus === 'pending')
    await page.evaluate(() => { window.qa.newApproval = window.qa.realtime.approveHermesDraft() })
    await page.waitForFunction(() => window.qa.approved.length === 2)
    await page.evaluate(async () => { window.qa.releaseApproval(); await window.qa.oldApproval })
    const held = await page.evaluate(() => window.qa.realtime.snapshot)
    if (held.hermesDraftStatus !== 'submitting' || held.hermesDraft !== 'Inspect the other task. Do not change files.') {
      throw new Error('Old receipt overwrote the new request owner')
    }
    await page.evaluate(async () => { window.qa.releaseApproval(); await window.qa.newApproval })
    if (await page.evaluate(() => window.qa.realtime.snapshot.hermesDraftStatus) !== 'sent') throw new Error('New request did not settle')
  })

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
