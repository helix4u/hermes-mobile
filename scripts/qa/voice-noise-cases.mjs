// Production hook, synthetic transports only. Keep parent approval cases independent.
export async function voiceNoiseCases({ page, url, check }) {
  async function fresh(review = false) {
    await page.goto(`${url}/qa/realtime.html`, { timeout: 30000 })
    await page.waitForFunction(() => Boolean(window.qa))
    await page.evaluate(async review => {
      const q = window.qa
      if (review) q.realtime.setSettings({ ...q.realtime.settings, approval: 'on' })
      await q.realtime.start()
    }, review)
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'listening')
  }
  async function draft(withOldInput = false) {
    await fresh(true)
    if (withOldInput) {
      await start('old-input')
      await say('current-request', 'Inspect the build. Do not change files.')
    }
    await page.evaluate(() => {
      const q = window.qa
      const metadata = q.sent.filter(e => e.type === 'response.create').at(-1).response.metadata
      q.frame({ type: 'response.created', response: { id: 'draft', metadata } })
      q.frame({ type: 'response.done', response: { id: 'draft', status: 'completed', output: [
        { type: 'function_call', name: 'draft_hermes_request', call_id: 'noise-draft',
          arguments: JSON.stringify({ message: 'Inspect the build. Do not change files.' }) },
      ] } })
    })
    await page.waitForFunction(() => window.qa.realtime.snapshot.hermesDraftStatus === 'pending')
  }
  async function drain() {}
  async function start(id) {
    await page.evaluate(id => window.qa.frame({ type: 'input_audio_buffer.speech_started', item_id: id }), id)
  }
  async function asr(id, transcript) {
    await page.evaluate(({ id, transcript }) => window.qa.frame({
      type: 'conversation.item.input_audio_transcription.completed', item_id: id, transcript,
    }), { id, transcript })
  }
  async function say(id, transcript) { await start(id); await asr(id, transcript) }
  async function noInterruption(action) {
    const before = await page.evaluate(() => ({ length: window.qa.sent.length, text: window.qa.realtime.snapshot.transcript }))
    await action()
    const state = await page.evaluate(before => ({
      disruptive: window.qa.sent.slice(before.length).filter(e => ['response.cancel', 'response.create', 'output_audio_buffer.clear'].includes(e.type)),
      text: window.qa.realtime.snapshot.transcript,
      muted: [...document.querySelectorAll('audio')].some(e => e.muted),
    }), before)
    if (state.disruptive.length || state.text !== before.text || state.muted) throw new Error('Noise disrupted playback, response or live transcript')
  }

  await check('HOOK-NOISE-VAD-CONFIG', 'Every connection disables provider automatic interruption/response before requesting audio, with VAD retained.', async () => {
    await fresh()
    const verify = () => page.evaluate(() => {
      const events = window.qa.sent
      const update = events.findIndex(e => e.type === 'session.update')
      const vad = events[update]?.session?.audio?.input?.turn_detection
      return update >= 0 && update < events.findIndex(e => e.type === 'response.create') &&
        vad.type === 'semantic_vad' && vad.interrupt_response === false && vad.create_response === false
    })
    if (!await verify()) throw new Error('Initial VAD policy missing or late')
    await page.evaluate(() => { window.qa.sent.length = 0; window.qa.disconnect() })
    await page.waitForFunction(() => window.qa.tracks.length === 2 && window.qa.realtime.snapshot.status === 'listening')
    const vad = await page.evaluate(() => window.qa.sent.find(e => e.type === 'session.update')?.session?.audio?.input?.turn_detection)
    if (vad?.interrupt_response !== false || vad?.create_response !== false) throw new Error('Reconnect lost VAD policy')
  })

  await check('HOOK-NOISE-PLAYBACK', 'Raw VAD, empty input and arbitrary or nested bracket labels preserve the pending review without executing it.', async () => {
    await draft()
    for (const [index, text] of ['[noise]', '[]', '[arbitrary [nested] label]', '[x] [y]...', ''].entries()) {
      await noInterruption(async () => {
        await start(`noise-${index}`)
        await page.evaluate(id => window.qa.frame({ type: 'input_audio_buffer.speech_stopped', item_id: id }), `noise-${index}`)
        await asr(`noise-${index}`, text)
      })
    }
    await drain()
    await say('approval', 'Yes [arbitrary].')
    await page.waitForTimeout(100)
    const state = await page.evaluate(() => ({ approved: window.qa.approved, snapshot: window.qa.realtime.snapshot }))
    if (state.approved.length || state.snapshot.hermesDraftStatus !== 'pending' || state.snapshot.hermesDraft !== 'Inspect the build. Do not change files.') throw new Error('Speech executed or changed the review')
  })

  await check('HOOK-NOISE-GENERATING', 'Noise preserves active generation; confirmed stop still records the interrupted turn without another reply.', async () => {
    await fresh()
    await say('question', 'Explain the task.')
    await page.evaluate(() => {
      const q = window.qa
      const metadata = q.sent.filter(e => e.type === 'response.create').at(-1).response.metadata
      q.frame({ type: 'response.created', response: { id: 'ongoing', metadata } })
      q.frame({ type: 'output_audio_buffer.started', response_id: 'ongoing' })
      q.frame({ type: 'response.output_audio_transcript.delta', response_id: 'ongoing', delta: 'A partial answer.' })
    })
    await noInterruption(() => say('generation-noise', '[unrecognized sound]'))
    if (await page.evaluate(() => window.qa.gatewayCalls.some(c => c.method === 'pet.realtime.record'))) throw new Error('Noise prematurely recorded an unfinished answer')
    const before = await page.evaluate(() => window.qa.sent.filter(e => e.type === 'response.create').length)
    await say('stop', '[noise] Stop talking.')
    await page.waitForFunction(() => window.qa.gatewayCalls.some(c => c.method === 'pet.realtime.record'))
    const state = await page.evaluate(() => ({
      requests: window.qa.sent.filter(e => e.type === 'response.create').length,
      record: window.qa.gatewayCalls.find(c => c.method === 'pet.realtime.record').params,
      status: window.qa.realtime.snapshot.status,
    }))
    if (state.requests !== before || state.record.userText !== 'Explain the task.' || state.record.petText !== 'A partial answer.' || state.status !== 'listening') throw new Error('Confirmed stop lost history or began a reply')
  })

  await check('HOOK-NOISE-READY', 'Noise and a later spoken yes cannot approve the visible review card.', async () => {
    await draft(); await drain()
    await noInterruption(() => say('ready-noise', '[door opens]'))
    await say('approval', 'Yes.')
    await page.waitForTimeout(100)
    if (await page.evaluate(() => window.qa.approved.length || window.qa.realtime.snapshot.hermesDraftStatus !== 'pending')) throw new Error('Speech approved or cleared the review')
  })

  await check('HOOK-NOISE-DELAYED', 'Delayed noise and spoken approval cannot mutate the review card.', async () => {
    await draft()
    await start('delayed-noise'); await drain(); await asr('delayed-noise', '[unknown sound]')
    await say('approval', 'Yes.')
    await page.waitForTimeout(100)
    if (await page.evaluate(() => window.qa.approved.length || window.qa.realtime.snapshot.hermesDraftStatus !== 'pending')) throw new Error('Delayed speech approved or cleared the review')
  })

  await check('HOOK-NOISE-EARLY-YES', 'Speech onset and ASR timing never grant approval authority.', async () => {
    await draft()
    await start('early-yes'); await drain(); await asr('early-yes', '[noise] Yes.')
    await page.waitForTimeout(100)
    if (await page.evaluate(() => window.qa.approved.length || window.qa.realtime.snapshot.hermesDraftStatus !== 'pending')) throw new Error('Early yes approved or cleared the review')
  })

  await check('HOOK-NOISE-NEGATIVE', 'Mixed labels and spoken cancellation cannot cancel or send the review.', async () => {
    await draft(); await drain()
    await say('negative', '[noise] Do not [other sound] send.')
    await page.waitForTimeout(100)
    if (await page.evaluate(() => window.qa.approved.length || window.qa.realtime.snapshot.hermesDraftStatus !== 'pending')) throw new Error('Spoken cancellation mutated the review')
  })

  await check('HOOK-NOISE-OLD-ASR', 'Old, duplicate and changed duplicate ASR cannot approve, cancel, clear, or overwrite a newer review.', async () => {
    await draft(true); await drain()
    await say('new-noise', '[noise]')
    await asr('old-input', 'Yes.')
    await asr('new-noise', 'Yes.')
    await asr('old-input', 'Stop talking.')
    await page.waitForTimeout(100)
    if (await page.evaluate(() => window.qa.approved.length || window.qa.realtime.snapshot.hermesDraftStatus !== 'pending' || window.qa.realtime.snapshot.hermesDraft !== 'Inspect the build. Do not change files.')) throw new Error('Stale ASR mutated the review')
    await say('current-yes', 'Yes.')
    await page.waitForTimeout(100)
    if (await page.evaluate(() => window.qa.approved.length || window.qa.realtime.snapshot.hermesDraftStatus !== 'pending')) throw new Error('Current speech mutated the review')
  })

  await check('HOOK-NOISE-PENDING-YES', 'Delayed and duplicate approval transcripts cannot submit a review.', async () => {
    await draft(); await drain()
    await start('pending-yes')
    await say('later-noise', '[arbitrary sound]')
    await asr('pending-yes', 'Yes [noise].')
    await page.waitForTimeout(100)
    await asr('pending-yes', 'Yes [noise].')
    if (await page.evaluate(() => window.qa.approved.length || window.qa.realtime.snapshot.hermesDraftStatus !== 'pending')) throw new Error('Delayed yes submitted or cleared the review')
  })

  await check('HOOK-NOISE-READ-CONTINUES', 'Noise preserves an in-flight read and its continuation waits for playback drain.', async () => {
    await fresh()
    await page.evaluate(() => {
      const q = window.qa
      q.holdContext()
      const metadata = q.sent.filter(e => e.type === 'response.create').at(-1).response.metadata
      q.frame({ type: 'response.created', response: { id: 'read', metadata } })
      q.frame({ type: 'output_audio_buffer.started', response_id: 'read' })
      q.frame({ type: 'response.output_audio_transcript.done', response_id: 'read', transcript: 'Reading the context.' })
      q.frame({ type: 'response.done', response: { id: 'read', status: 'completed', output: [
        { type: 'function_call', name: 'get_context_snapshot', call_id: 'noise-read', arguments: '{}' },
      ] } })
    })
    await page.waitForFunction(() => window.qa.contextRequests === 1)
    await noInterruption(() => say('read-noise', '[chair moving]'))
    await page.evaluate(() => window.qa.releaseContext())
    await page.waitForFunction(() => window.qa.sent.some(e => e.item?.call_id === 'noise-read'))
    if (await page.evaluate(() => window.qa.sent.filter(e => e.type === 'response.create').length !== 1)) throw new Error('Continuation overlapped undrained audio')
    await page.evaluate(() => window.qa.frame({ type: 'output_audio_buffer.stopped', response_id: 'read' }))
    await page.waitForFunction(() => window.qa.sent.filter(e => e.type === 'response.create').length === 2)
  })

  await check('HOOK-NOISE-MIXED-WORDS', 'Mixed actual words interrupt once and remain exact in the recorded turn, including do not stop.', async () => {
    await fresh()
    await say('mixed', '[noise] Do not stop. Explain [background] the task.')
    await page.evaluate(() => {
      const q = window.qa
      const metadata = q.sent.filter(e => e.type === 'response.create').at(-1).response.metadata
      q.frame({ type: 'response.created', response: { id: 'answer', metadata } })
      q.frame({ type: 'response.output_audio_transcript.done', response_id: 'answer', transcript: 'A synthetic complete answer.' })
      q.frame({ type: 'response.done', response: { id: 'answer', status: 'completed', output: [] } })
    })
    await page.waitForFunction(() => window.qa.gatewayCalls.some(c => c.method === 'pet.realtime.record'))
    const state = await page.evaluate(() => ({
      text: window.qa.gatewayCalls.find(c => c.method === 'pet.realtime.record').params.userText,
      clear: window.qa.sent.filter(e => e.type === 'output_audio_buffer.clear').length,
      cancel: window.qa.sent.filter(e => e.type === 'response.cancel').length,
    }))
    if (state.text !== 'Do not stop. Explain the task.' || state.clear !== 1 || state.cancel !== 1) throw new Error('Actual words altered or speech failed to interrupt once')
  })
}
