// Real React hook, synthetic transport/microphone. No provider or live session.
import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import path from 'node:path'
import { saveReport } from './report.mjs'

const { values } = parseArgs({ options: { out: { type: 'string' },
  'playwright-package': { type: 'string' }, channel: { type: 'string', default: 'msedge' } } })
if (!values.out) throw new Error('Required: --out <private artifact directory>')
const require = createRequire(values['playwright-package'] ? path.resolve(values['playwright-package']) : import.meta.url)
const report = { schema: 1, layer: 'isolated-real-hook', startedAt: new Date().toISOString(), checks: [],
  manual: [{ id: 'VOICE-DEVICE', reason: 'Synthetic transport does not verify real speech, sound, interruption, or background hardware.' }] }
let server, browser, context, page
async function check(id, reason, action) {
  const started = performance.now()
  try { await action(); report.checks.push({ id, reason, status: 'pass', ms: Math.round(performance.now() - started) }) }
  catch (error) {
    // This page is entirely synthetic, so its error text cannot contain user data.
    const state = await page?.evaluate(() => window.qa ? {
      status: window.qa.realtime.snapshot.status, error: window.qa.realtime.snapshot.error,
      tracks: window.qa.tracks.map(t => ({ enabled: t.enabled, state: t.readyState })),
      sentTypes: window.qa.sent.map(e => e.type),
    } : null).catch(() => null)
    report.checks.push({ id, reason: `${reason} Failed: ${String(error.message).slice(0, 300)}`, state,
      status: 'fail', ms: Math.round(performance.now() - started) })
  }
}
try {
  server = await createServer({ root: fileURLToPath(new URL('../../client/', import.meta.url)),
    server: { host: '127.0.0.1', port: 0, open: false }, logLevel: 'error' })
  await server.listen()
  const address = server.httpServer.address()
  const url = `http://127.0.0.1:${address.port}`
  browser = await require('playwright').chromium.launch({ channel: values.channel, headless: true })
  context = await browser.newContext({ viewport: { width: 384, height: 824 } })
  await context.route('**/*', route => new URL(route.request().url()).origin === url ? route.continue() : route.abort())
  page = await context.newPage()
  page.setDefaultTimeout(5000)
  const fresh = async () => {
    // First navigation includes Vite dependency compilation. That setup time is
    // not a voice latency assertion; keep the actual state guards at five seconds.
    await page.goto(`${url}/qa/realtime.html`, { timeout: 30000 })
    await page.waitForFunction(() => Boolean(window.qa))
    await page.evaluate(() => window.qa.realtime.start())
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'listening')
  }
  await check('HOOK-001', 'A fresh call starts unmuted with an enabled outgoing track.', async () => {
    await fresh()
    await page.waitForFunction(() => !window.qa.realtime.snapshot.microphoneMuted && window.qa.tracks.at(-1).enabled)
  })
  await check('HOOK-INITIAL-EVIDENCE', 'Whole context frames are installed in order before the first voice response; standing instructions are separate.', async () => {
    await fresh()
    const events = await page.evaluate(() => window.qa.sent)
    const indices = [1, 2].map(part => events.findIndex(e => e.item?.content?.[0]?.text === `Synthetic complete context part ${part}/2`))
    const response = events.findIndex(e => e.type === 'response.create')
    if (indices[0] < 0 || indices[1] <= indices[0] || response <= indices[1]) throw new Error('Voice began before complete evidence delivery')
  })
  await check('HOOK-SUPPORT-REFRESH', 'Snapshot refresh uses the attached application reader and publishes its records, never the identity-only session RPC.', async () => {
    await fresh()
    await page.evaluate(async () => {
      const q = window.qa
      window.attachedReads = 0
      await q.realtime.startContext({ contextId:'support:fixture:queue', contextTitle:'Support queue', context:[],
        contextTools:{guide:'Synthetic read-only queue', read:async args=>{window.attachedReads++;return {threads:[{thread_id:'100000000000000001',title:'Synthetic queue record'}],matching:1}},propose:async()=>{throw new Error('No proposals in this test')}} })
    })
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'listening')
    const before = await page.evaluate(() => window.qa.contextRequests)
    await page.evaluate(() => window.qa.frame({type:'response.done',response:{id:'snapshot-refresh',status:'completed',output:[{type:'function_call',name:'get_context_snapshot',call_id:'snapshot-owner',arguments:'{}'}]}}))
    await page.waitForFunction(() => window.qa.sent.some(e=>e.item?.type==='function_call_output'&&e.item.call_id==='snapshot-owner'))
    const result = await page.evaluate(() => ({reads:window.attachedReads,rpc:window.qa.contextRequests,preview:window.qa.realtime.snapshot.contextPreview,
      output:window.qa.sent.find(e=>e.item?.call_id==='snapshot-owner')?.item?.output}))
    if (result.reads!==1 || result.rpc!==before || !JSON.stringify(result.preview).includes('Synthetic queue record') || !result.output.includes('Synthetic queue record')) throw new Error(`Attached refresh lost application ownership: ${JSON.stringify({before,...result})}`)
  })
  await check('HOOK-VOICE-NOTEBOOK', 'Memory uses the attached target and fixed notebook RPC, without a new voice session or agent prompt.', async () => {
    await fresh()
    const before = await page.evaluate(() => window.qa.sessionRequests)
    const memory = {scope:'session',key:'topic',kind:'checkpoint',content:'Synthetic topic',sourceTurn:'turn-one',sourceQuote:'Discuss this topic',expectedRevision:0}
    await page.evaluate(args => window.qa.frame({type:'response.done',response:{id:'memory-save',status:'completed',output:[{type:'function_call',name:'save_voice_memory',call_id:'save-note',arguments:JSON.stringify(args)}]}}),memory)
    await page.waitForFunction(() => window.qa.sent.some(e=>e.item?.call_id==='save-note'))
    const result = await page.evaluate(() => ({requests:window.qa.sessionRequests,calls:window.qa.gatewayCalls}))
    const save = result.calls.find(c=>c.method==='pet.realtime.knowledge')
    if (result.requests!==before || save?.params.operation!=='voice_memory_save' || save.params.session_id!=='synthetic-session' || JSON.stringify(save.params.memory)!==JSON.stringify(memory) || result.calls.some(c=>c.method==='prompt.submit')) throw new Error('Voice memory changed ownership or execution authority')
  })
  await check('HOOK-UI-CONTEXT', 'Page changes append quiet metadata without retargeting the call or requesting speech.', async () => {
    await fresh()
    const before = await page.evaluate(() => window.qa.sent.filter(e => e.type === 'response.create').length)
    await page.evaluate(() => window.qa.setView({page:'settings',focusedSessionId:'different-view'}))
    await page.waitForFunction(() => window.qa.sent.some(e => e.item?.content?.[0]?.text?.includes('"page":"settings"')))
    const state = await page.evaluate(() => ({requests:window.qa.sessionRequests,owner:window.qa.realtime.snapshot.attachedContextId,responses:window.qa.sent.filter(e=>e.type==='response.create').length}))
    if (state.requests !== 1 || state.owner !== 'synthetic-session' || state.responses !== before) throw new Error(`Viewing metadata retargeted or interrupted voice: ${JSON.stringify(state)}`)
  })
  await check('HOOK-WORKER-STEER', 'Worker steering remains parent scoped, editable and gated; queue acknowledgement is not completion.', async () => {
    await fresh()
    await page.evaluate(() => {
      const q = window.qa
      const opening = q.sent.find(e=>e.type==='response.create')
      q.frame({type:'response.created',response:{id:'steer',metadata:opening.response.metadata}})
      q.frame({type:'response.done',response:{id:'steer',status:'completed',output:[{type:'function_call',name:'draft_worker_steer',call_id:'steer-call',arguments:JSON.stringify({subagentId:'worker-a',message:'Original'})}]}})
    })
    await page.waitForFunction(()=>window.qa.realtime.snapshot.hermesDraftStatus==='pending')
    if(await page.evaluate(()=>window.qa.gatewayCalls.some(c=>c.method==='subagent.steer'))) throw new Error('Steering sent before approval')
    await page.evaluate(async()=>{
      window.qa.realtime.updateHermesDraft('Inspect only the failing test')
      await window.qa.realtime.approveHermesDraft()
    })
    await page.waitForFunction(()=>window.qa.realtime.snapshot.hermesDraftStatus==='sent')
    const state=await page.evaluate(()=>({calls:window.qa.gatewayCalls.filter(c=>c.method==='subagent.steer'),sent:window.qa.sent}))
    if(state.calls.length!==1 || state.calls[0].params.session_id!=='synthetic-session' || state.calls[0].params.subagent_id!=='worker-a' || state.calls[0].params.text!=='Inspect only the failing test') throw new Error('Wrong steering target or text')
    if(!state.sent.some(e=>e.item?.content?.[0]?.text?.includes('steering_queued'))) throw new Error('Missing honest queue receipt')
  })
  await check('HOOK-BILLING', 'Cancelled/replayed responses are metered once before floor filtering; reconnect preserves cost, fresh Start resets it.', async () => {
    await fresh()
    await page.evaluate(() => {
      const e = { type:'response.done', response:{id:'cancelled-cost',status:'cancelled',usage:{
        input_tokens:100, output_tokens:20,
        input_token_details:{text_tokens:100,audio_tokens:0,cached_tokens:0},
        output_token_details:{text_tokens:0,audio_tokens:20}
      }}}
      window.qa.frame(e); window.qa.frame(e)
    })
    await page.waitForFunction(() => window.qa.realtime.snapshot.contextStats?.billing?.pricedResponses === 1)
    const before = await page.evaluate(() => window.qa.realtime.snapshot.contextStats.billing.usd)
    if (!(before > 0)) throw new Error('Cancelled response was not priced')
    await page.evaluate(() => window.qa.disconnect())
    await page.waitForFunction(() => window.qa.tracks.length === 2 && window.qa.realtime.snapshot.status === 'listening')
    if (await page.evaluate(() => window.qa.realtime.snapshot.contextStats.billing.usd) !== before) throw new Error('Reconnect reset cost')
    await page.evaluate(() => window.qa.realtime.stop())
    await page.evaluate(() => window.qa.realtime.start())
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'listening')
    if (await page.evaluate(() => window.qa.realtime.snapshot.contextStats.billing.total) !== 0) throw new Error('Fresh call inherited usage')
  })
  await check('HOOK-002', 'Speech after the greeting schedules a new answer instead of staying silent.', async () => {
    await fresh()
    await page.evaluate(() => {
      const qa = window.qa
      const opening = qa.sent.find(e => e.type === 'response.create')
      qa.frame({ type: 'response.created', response: { id: 'greeting', metadata: opening.response.metadata } })
      qa.frame({ type: 'response.done', response: { id: 'greeting', status: 'completed', output: [] } })
      qa.frame({ type: 'input_audio_buffer.speech_started', item_id: 'speech' })
      qa.frame({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'speech', transcript: 'Explain the current task.' })
    })
    await page.waitForFunction(() => window.qa.sent.filter(e => e.type === 'response.create').length === 2)
  })
  await check('HOOK-EMPTY-ASR', 'A late empty transcription cannot silence a newer spoken response.', async () => {
    await fresh()
    await page.evaluate(() => {
      const qa=window.qa
      qa.frame({type:'input_audio_buffer.speech_started'})
      qa.frame({type:'input_audio_buffer.committed',item_id:'old'})
      qa.frame({type:'input_audio_buffer.speech_started'})
      qa.frame({type:'input_audio_buffer.committed',item_id:'new'})
      qa.frame({type:'conversation.item.input_audio_transcription.completed',item_id:'new',transcript:'Explain the task.'})
      qa.frame({type:'response.created',response:{id:'answer'}})
      qa.frame({type:'output_audio_buffer.started',response_id:'answer'})
      qa.sent.length=0
      qa.frame({type:'conversation.item.input_audio_transcription.completed',item_id:'old',transcript:''})
    })
    await page.waitForFunction(()=>window.qa.realtime.snapshot.status==='speaking')
    if(await page.evaluate(()=>window.qa.sent.some(e=>e.type==='output_audio_buffer.clear')))throw new Error('Old empty ASR cleared new audio')
  })
  await check('HOOK-003', 'Muted reconnect preserves actual capture state and rejects late input.', async () => {
    await fresh()
    await page.evaluate(() => { window.qa.realtime.setMicrophoneMuted(true); window.qa.disconnect() })
    await page.waitForFunction(() => window.qa.tracks.length === 2 && window.qa.realtime.snapshot.status === 'listening')
    await page.waitForFunction(() => window.qa.realtime.snapshot.microphoneMuted && !window.qa.tracks.at(-1).enabled && window.qa.tracks[0].readyState === 'ended')
    const before = await page.evaluate(() => window.qa.sent.filter(e => e.type === 'response.create').length)
    await page.evaluate(() => {
      window.qa.frame({ type: 'input_audio_buffer.speech_started', item_id: 'late' })
      window.qa.frame({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'late', transcript: 'Late input' })
    })
    if (await page.evaluate(() => window.qa.sent.filter(e => e.type === 'response.create').length) !== before) throw new Error('Muted input created a response')
  })
  for (const [id, reason, frame] of [
    ['HOOK-004', 'Failed transcription becomes a visible error and stops capture.', { type: 'conversation.item.input_audio_transcription.failed' }],
    ['HOOK-005', 'Failed response completion becomes a visible error and stops capture.', { type: 'response.done', response: { status: 'failed', status_details: { error: { code: 'rate_limit_exceeded' } } } }],
  ]) await check(id, reason, async () => {
    await fresh()
    await page.evaluate(frame => window.qa.frame(frame), frame)
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'error' && !!window.qa.realtime.snapshot.error && window.qa.tracks.every(t => t.readyState === 'ended'))
  })
  await check('HOOK-006', 'Playback rejection is visible and cannot leave a silent active call.', async () => {
    await fresh()
    await page.evaluate(() => window.qa.failPlayback())
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'error' && window.qa.tracks.every(t => t.readyState === 'ended'))
  })
  await check('HOOK-007', 'Speech and transcription wait are visible before a response exists.', async () => {
    await fresh()
    await page.evaluate(() => window.qa.frame({ type: 'input_audio_buffer.speech_started', item_id: 'speech' }))
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'hearing')
    await page.evaluate(() => window.qa.frame({ type: 'input_audio_buffer.speech_stopped', item_id: 'speech' }))
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'transcribing')
    await page.evaluate(() => window.qa.frame({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'speech', transcript: 'Hello there.' }))
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'thinking')
  })
  await check('HOOK-008', 'Microphone loss cannot leave an apparently listening call.', async () => {
    await fresh()
    await page.evaluate(() => { const track = window.qa.tracks.at(-1); track.readyState = 'ended'; track.onended() })
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'error' && !window.qa.realtime.snapshot.active)
  })
  await check('HOOK-009', 'Duplicate starts and stop during credential retrieval cannot reopen capture.', async () => {
    await page.goto(`${url}/qa/realtime.html`)
    await page.waitForFunction(() => Boolean(window.qa))
    await page.evaluate(() => { window.qa.hold(); void window.qa.realtime.start() })
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'connecting')
    await page.evaluate(async () => { await window.qa.realtime.start(); window.qa.realtime.stop(); window.qa.release() })
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'idle')
    if (await page.evaluate(() => window.qa.tracks.some(t => t.readyState !== 'ended') || window.qa.sessionRequests !== 1)) throw new Error('Cancelled start retained capture or duplicate request')
  })
  await check('HOOK-010', 'Exhausted reconnect releases every microphone track and marks inactive.', async () => {
    await fresh()
    await page.evaluate(() => { window.qa.failConnection(); window.qa.disconnect() })
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'error', null, { timeout: 8000 })
    if (await page.evaluate(() => window.qa.realtime.snapshot.active || window.qa.tracks.some(t => t.readyState !== 'ended'))) throw new Error('Failed call retained capture')
  })
  await check('HOOK-011', 'A context switch still reconnects to the selected session without duplicate greeting.', async () => {
    await fresh()
    await page.evaluate(() => window.qa.realtime.startContext({ context: [], contextId: 'other-context', contextTitle: 'Synthetic context' }))
    await page.waitForFunction(() => window.qa.tracks.length === 2 && window.qa.realtime.snapshot.attachedContextId === 'other-context')
    if (await page.evaluate(() => window.qa.tracks[0].readyState !== 'ended' || window.qa.sent.filter(e => e.type === 'response.create').length !== 1)) throw new Error('Context switch retained prior capture or repeated greeting')
  })
  await check('HOOK-012', 'Local input test reports signal and releases capture without any provider request.', async () => {
    await page.goto(`${url}/qa/realtime.html`)
    await page.waitForFunction(() => Boolean(window.qa))
    await page.evaluate(() => { void window.qa.realtime.testMicrophone() })
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'testing')
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'idle', null, { timeout: 8000 })
    if (await page.evaluate(() => window.qa.sessionRequests !== 0 || !window.qa.realtime.snapshot.inputStatus.includes('signal detected') || window.qa.tracks.some(t => t.readyState !== 'ended') || !window.qa.contextsClosed)) throw new Error('Probe did not settle or contacted provider')
  })
  await check('HOOK-013', 'Stopping the local test immediately releases capture without restarting it.', async () => {
    await page.goto(`${url}/qa/realtime.html`)
    await page.waitForFunction(() => Boolean(window.qa))
    await page.evaluate(() => { void window.qa.realtime.testMicrophone() })
    await page.waitForFunction(() => window.qa.tracks.length === 1)
    await page.evaluate(() => window.qa.realtime.stop())
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'idle' && window.qa.tracks.every(t => t.readyState === 'ended'))
  })
  for (const attached of [false, true]) await check(attached ? 'HOOK-015' : 'HOOK-014',
    'Missing microphone fails visibly before provider setup, in normal and attached-context voice.', async () => {
      await page.goto(`${url}/qa/realtime.html`)
      await page.waitForFunction(() => Boolean(window.qa))
      await page.evaluate(async attached => {
        window.qa.failMicrophone()
        if (attached) await window.qa.realtime.startContext({context: [], contextId: 'synthetic-support', contextTitle: 'Synthetic support'})
        else await window.qa.realtime.start()
      }, attached)
      await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'error'
        && window.qa.realtime.snapshot.error.includes('Selected microphone is unavailable'))
      if (await page.evaluate(() => window.qa.sessionRequests !== 0 || window.qa.realtime.snapshot.active)) throw new Error('Missing input contacted provider or stayed active')
    })
  await check('UI-VOICE-HEADER', 'Always-visible voice settings and microphone stay in one compact row.', async () => {
    await fresh()
    for (const width of [320, 360, 384]) {
      await page.setViewportSize({ width, height: 824 })
      const geometry = await page.evaluate(() => {
        const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height } }
        return { header:box('.topbar'), brand:box('.brand-button'), settings:box('.voice-settings-shortcut'), status:box('.topbar-statuses'), scrollWidth:document.documentElement.scrollWidth }
      })
      if (geometry.header.height > 80 || geometry.brand.right > geometry.status.left + 1 || geometry.status.right > width || geometry.scrollWidth > width || geometry.settings.height < 32) throw new Error(`Header layout at ${width}: ${JSON.stringify(geometry)}`)
    }
  })
  await check('HOOK-016', 'Barge-in resolves the accepted read without starting an obsolete answer.', async () => {
    await fresh()
    await page.evaluate(() => {
      const q = window.qa
      q.holdContext()
      q.frame({ type: 'response.created', response: { id: 'read', metadata: q.sent.at(-1).response.metadata } })
      q.frame({ type: 'response.done', response: { id: 'read', status: 'completed', output: [{ type: 'function_call', name: 'get_context_snapshot', call_id: 'call-read', arguments: '{}' }] } })
    })
    await page.waitForFunction(() => window.qa.contextRequests === 1)
    const before = await page.evaluate(() => window.qa.sent.filter(e => e.type === 'response.create').length)
    await page.evaluate(() => {
      window.qa.frame({ type: 'input_audio_buffer.speech_started', item_id: 'interrupt-read' })
      window.qa.releaseContext()
    })
    await page.waitForFunction(() => window.qa.sent.some(e => e.item?.call_id === 'call-read'))
    if (await page.evaluate(() => window.qa.sent.filter(e => e.type === 'response.create').length) !== before) throw new Error('Interrupted read resumed speech')
  })
  await check('HOOK-017', 'Approval sends exactly the edited draft once and appends a silent receipt.', async () => {
    await fresh()
    await page.evaluate(() => {
      const q = window.qa
      q.frame({ type: 'response.created', response: { id: 'draft', metadata: q.sent.at(-1).response.metadata } })
      q.frame({ type: 'response.done', response: { id: 'draft', status: 'completed', output: [{ type: 'function_call', name: 'draft_hermes_request', call_id: 'call-draft', arguments: JSON.stringify({ message: 'Original request' }) }] } })
    })
    await page.waitForFunction(() => window.qa.realtime.snapshot.hermesDraftStatus === 'pending')
    const before = await page.evaluate(() => window.qa.sent.filter(e => e.type === 'response.create').length)
    await page.evaluate(async () => {
      window.qa.realtime.updateHermesDraft('Only inspect, do not change anything.')
      await Promise.all([window.qa.realtime.approveHermesDraft(), window.qa.realtime.approveHermesDraft()])
    })
    await page.waitForFunction(() => window.qa.realtime.snapshot.hermesDraftStatus === 'sent')
    const state = await page.evaluate(() => ({ requests: window.qa.approved, sent: window.qa.sent }))
    if (state.requests.length !== 1 || !state.requests[0].displayText.includes('Only inspect')) throw new Error('Wrong or duplicate submission')
    if (!state.sent.some(e => e.item?.content?.[0]?.text?.includes('submittedRequest'))) throw new Error('Voice has no receipt')
    if (state.sent.filter(e => e.type === 'response.create').length !== before) throw new Error('Receipt started unsolicited speech')
  })
  await check('HOOK-VERBAL', 'Exact audible readback allows one clear verbal approval; no model-side submit authority.', async () => {
    await page.goto(`${url}/qa/realtime.html`)
    await page.waitForFunction(() => Boolean(window.qa))
    await page.evaluate(() => {
      const q = window.qa
      q.realtime.setSettings({...q.realtime.settings, approval:'verbal'})
      return q.realtime.start()
    })
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'listening')
    await page.evaluate(() => {
      const q = window.qa
      q.frame({type:'response.created',response:{id:'draft',metadata:q.sent.at(-1).response.metadata}})
      q.frame({type:'response.done',response:{id:'draft',status:'completed',output:[{type:'function_call',name:'draft_hermes_request',call_id:'draft-voice',arguments:JSON.stringify({message:'Inspect the build. Do not change files.'})}]}})
    })
    await page.waitForFunction(() => window.qa.sent.some(e => e.item?.call_id === 'draft-voice'))
    if (await page.evaluate(() => window.qa.approved.length)) throw new Error('Draft was sent before readback')
    await page.evaluate(() => {
      const q = window.qa
      q.frame({type:'response.created',response:{id:'readback',metadata:q.sent.filter(e=>e.type==='response.create').at(-1).response.metadata}})
      q.frame({type:'output_audio_buffer.started',response_id:'readback'})
      q.frame({type:'response.output_audio_transcript.done',response_id:'readback',transcript:'Inspect the build. Do not change files. Send that?'})
      q.frame({type:'response.done',response:{id:'readback',status:'completed',output:[]}})
      q.frame({type:'output_audio_buffer.stopped',response_id:'readback'})
      q.frame({type:'input_audio_buffer.speech_started',item_id:'yes'})
      q.frame({type:'conversation.item.input_audio_transcription.completed',item_id:'yes',transcript:'Yes'})
    })
    await page.waitForFunction(() => window.qa.approved.length === 1)
    const request = await page.evaluate(() => window.qa.approved[0])
    if (!request.displayText.endsWith('Inspect the build. Do not change files.')) throw new Error('Verbal approval changed the draft')
  })
  await check('HOOK-WEB-OFFER', 'Web opening is an exact-address offer, not model-triggered navigation or a false opened receipt.', async () => {
    await fresh()
    const before = page.url()
    await page.evaluate(() => {
      const q = window.qa
      q.frame({type:'response.created',response:{id:'offer',metadata:q.sent.at(-1).response.metadata}})
      q.frame({type:'response.done',response:{id:'offer',status:'completed',output:[{type:'function_call',name:'offer_to_open_webpage',call_id:'offer-page',arguments:JSON.stringify({url:'https://example.test/complete#tail'})}]}})
    })
    await page.waitForFunction(() => window.qa.realtime.snapshot.webpageUrl === 'https://example.test/complete#tail')
    const output = await page.evaluate(() => JSON.parse(window.qa.sent.find(e=>e.item?.call_id==='offer-page').item.output))
    if (output.status !== 'pending_user_click' || page.url() !== before) throw new Error('Offer navigated or claimed completion')
    await page.evaluate(() => window.qa.realtime.dismissWebpage())
    await page.waitForFunction(() => !window.qa.realtime.snapshot.webpageUrl)
  })
  await check('HOOK-LARGE-READ', 'Complete webpage evidence crosses the real hook in bounded lossless transport frames before one tool completion.', async () => {
    await fresh()
    await page.evaluate(() => {
      const q = window.qa
      q.setKnowledgeResult({text:'complete evidence '.repeat(5000), coverage:{complete:true}})
      q.frame({type:'response.created',response:{id:'page-read',metadata:q.sent.at(-1).response.metadata}})
      q.frame({type:'response.done',response:{id:'page-read',status:'completed',output:[{type:'function_call',name:'read_voice_webpage',call_id:'read-page',arguments:JSON.stringify({url:'https://example.test/report'})}]}})
    })
    await page.waitForFunction(() => window.qa.sent.some(e=>e.item?.call_id==='read-page'))
    const result = await page.evaluate(() => {
      const events = window.qa.sent
      const parts = events.flatMap(e=>{try {const p=JSON.parse(e.item?.content?.[0]?.text); return p.callId==='read-page'?[p]:[]} catch{return []}})
      const text = parts.sort((a,b)=>a.index-b.index).map(p=>p.body).join('')
      return {text:JSON.parse(text).text, outputs:events.filter(e=>e.item?.call_id==='read-page').length,
        max:Math.max(...events.map(e=>new TextEncoder().encode(JSON.stringify(e)).length)),
        request:window.qa.gatewayCalls.find(c=>c.method==='pet.realtime.knowledge')}
    })
    if (result.text !== 'complete evidence '.repeat(5000) || result.outputs !== 1 || result.max > 16384 || result.request.params.operation !== 'webpage') throw new Error('Whole result transport or webpage routing failed')
  })
  await check('HOOK-018', 'External context replays only its own completed voice turns on reconnect.', async () => {
    await page.goto(`${url}/qa/realtime.html`)
    await page.waitForFunction(() => Boolean(window.qa))
    await page.evaluate(() => window.qa.realtime.startContext({ context: [], contextId: 'support:queue', contextTitle: 'Queue' }))
    await page.waitForFunction(() => window.qa.realtime.snapshot.status === 'listening')
    await page.evaluate(() => {
      const q = window.qa
      q.frame({ type: 'response.created', response: { id: 'hello', metadata: q.sent.at(-1).response.metadata } })
      q.frame({ type: 'response.done', response: { id: 'hello', status: 'completed', output: [] } })
      q.frame({ type: 'input_audio_buffer.speech_started', item_id: 'question' })
      q.frame({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'question', transcript: 'What changed?' })
      q.frame({ type: 'response.created', response: { id: 'answer', metadata: q.sent.at(-1).response.metadata } })
      q.frame({ type: 'response.output_audio_transcript.done', response_id: 'answer', transcript: 'The task is complete.' })
      q.frame({ type: 'response.done', response: { id: 'answer', status: 'completed', output: [] } })
    })
    await page.waitForFunction(() => window.qa.histories.length > 0)
    await page.evaluate(() => window.qa.disconnect())
    await page.waitForFunction(() => window.qa.tracks.length === 2 && window.qa.realtime.snapshot.status === 'listening')
    const replay = await page.evaluate(() => window.qa.sent.filter(e => e.item?.role === 'assistant'))
    if (replay.length !== 1 || replay[0].item.content[0].text !== 'The task is complete.') throw new Error('Reconnect lost the conversation tail')
    await page.evaluate(() => window.qa.realtime.startContext({ context: [], contextId: 'support:other', contextTitle: 'Other' }))
    await page.waitForFunction(() => window.qa.tracks.length === 3 && window.qa.realtime.snapshot.status === 'listening')
    if (await page.evaluate(() => window.qa.sent.filter(e => e.item?.role === 'assistant').length) !== 1) throw new Error('History leaked into another target')
  })
} catch { report.checks.push({ id: 'HARNESS', status: 'fail', reason: 'Fixture/browser setup failed; verify installed dependencies and browser channel.' }) }
finally {
  if (browser) await browser.close()
  if (server) await server.close()
  report.finishedAt = new Date().toISOString()
  const summary = await saveReport(path.resolve(values.out), report)
  console.log(JSON.stringify({ ...summary, report: path.join(path.resolve(values.out), 'report.json') }))
  if (summary.failed) process.exitCode = 1
}
