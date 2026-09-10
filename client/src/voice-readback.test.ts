import { describe, expect, it } from 'vitest'
import { VoiceReadback, isVoiceDraftCancellation, voiceReadbackResponse } from './voice-readback'

describe('spoken handoff review', () => {
  const draft = 'Inspect the failed build. Do not change files.'
  const spoken = draft + ' Send that?'
  function ready() {
    const gate = new VoiceReadback()
    gate.stage(draft)
    gate.transcript(spoken, 'readback')
    gate.audioStopped('readback')
    return gate
  }
  it('requires complete exact readback and matching audio drain before one approval', () => {
    const gate = ready()
    gate.speechStarted()
    expect(gate.reply('Yes', draft)).toBe('approve')
    expect(gate.reply('Yes', draft)).toBe('none')
  })
  it('accepts drain arriving before transcript without mixing responses', () => {
    const gate = new VoiceReadback()
    gate.stage(draft)
    gate.audioStopped('old')
    gate.transcript(spoken, 'readback')
    expect(gate.ready).toBe(false)
    gate.audioStopped('readback')
    expect(gate.ready).toBe(true)
    gate.stage(draft)
    gate.audioStopped('readback')
    gate.transcript(spoken, 'readback')
    expect(gate.ready).toBe(true)
  })
  it.each([draft.split('.')[0] + ' Send that?', 'Do not ' + spoken, spoken + ' Or maybe not.'])('rejects incomplete or modified readback: %s', text => {
    const gate = new VoiceReadback()
    gate.stage(draft)
    gate.transcript(text, 'r')
    gate.audioStopped('r')
    expect(gate.reply('Yes', draft)).toBe('none')
  })
  it('rejects interruption, edited draft, reconnect reset and intervening discussion', () => {
    const interrupted = new VoiceReadback()
    interrupted.stage(draft)
    interrupted.transcript(spoken, 'r')
    interrupted.speechStarted()
    interrupted.audioStopped('r')
    expect(interrupted.reply('Yes', draft)).toBe('none')
    expect(ready().reply('Yes', draft + ' Also deploy.')).toBe('none')
    const reset = ready()
    reset.clear()
    expect(reset.reply('Yes', draft)).toBe('none')
    const discussion = ready()
    expect(discussion.reply('Wait, which build?', draft)).toBe('none')
    expect(discussion.reply('Yes', draft)).toBe('none')
  })
  it.each(['No', 'Cancel', "Don't send", 'Do not send'])('cancels without needing readback: %s', text => {
    const gate = new VoiceReadback()
    gate.stage(draft)
    expect(gate.reply(text, draft)).toBe('cancel')
  })
  it.each([
    "Alright, here's the draft, exactly: ",
    "Okay, here's the exact draft word for word: ",
    'Here is the draft: ',
    "All right, here's the exact draft: ",
    "Here's the exact draft for review: ",
  ])('accepts a harmless readback introduction without changing any draft words: %s', intro => {
    const gate = new VoiceReadback()
    gate.stage(draft)
    gate.transcript(intro + spoken, 'readback')
    gate.audioStopped('readback')
    gate.speechStarted()
    expect(gate.reply('Yes, send it.', draft)).toBe('approve')
  })
  it.each(['Do not send this: ', 'Maybe instead: ', 'I changed it to: '])('rejects a meaning-changing introduction: %s', intro => {
    const gate = new VoiceReadback()
    gate.stage(draft)
    gate.transcript(intro + spoken, 'readback')
    gate.audioStopped('readback')
    expect(gate.ready).toBe(false)
  })
  it.each(['Go ahead and cancel this.', "Cancel that. We're calling this failed.", 'Please cancel the draft.'])('cancels a clear local draft request: %s', text => {
    expect(isVoiceDraftCancellation(text)).toBe(true)
  })
  it.each(["Don't cancel it", 'How do I cancel this?', 'Cancel the running job', 'Cancel this. Actually keep it.', 'If it fails, cancel it'])('does not reinterpret another intent as draft cancellation: %s', text => {
    expect(isVoiceDraftCancellation(text)).toBe(false)
  })
  it('constrains the dedicated readback and preserves arbitrary draft text as data', () => {
    const message = 'Report "ready".\nDo not deploy.'
    const response = voiceReadbackResponse(message)
    expect(response.tool_choice).toBe('none')
    const instructions = String(response.instructions)
    expect(JSON.parse(instructions.slice(instructions.indexOf('\n') + 1))).toEqual({ draft: message })
  })
  it('retains every finalized audio part of one response without duplicating a repeated final', () => {
    const gate = new VoiceReadback()
    gate.stage(draft)
    gate.transcript('Inspect the failed build.', 'r', 'part-a')
    gate.transcript('Inspect the failed build.', 'r', 'part-a')
    gate.transcript('Do not change files. Send that?', 'r', 'part-b')
    gate.audioStopped('r')
    expect(gate.reply('Yes', draft)).toBe('approve')
  })
  it('accepts finalized text delayed until after drained playback and speech-start', () => {
    const gate = new VoiceReadback()
    gate.stage(draft)
    gate.audioStopped('r')
    gate.speechStarted()
    gate.transcript(spoken, 'r')
    expect(gate.reply('Yes', draft)).toBe('approve')
  })
  it('never combines transcript parts or playback from different responses', () => {
    const gate = new VoiceReadback()
    gate.stage(draft)
    gate.transcript('Inspect the failed build.', 'a', 'one')
    gate.transcript('Do not change files. Send that?', 'b', 'two')
    gate.audioStopped('b')
    expect(gate.reply('Yes', draft)).toBe('none')
  })
})
