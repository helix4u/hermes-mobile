import { describe, expect, it } from 'vitest'
import { VoiceReadback } from './voice-readback'

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
})
