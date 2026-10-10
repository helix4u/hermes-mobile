import { VoicePitchProcessor } from './voice-effects-dsp'

declare const sampleRate: number
declare class AudioWorkletProcessor { readonly port: MessagePort }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void

class VoiceEffectsProcessor extends AudioWorkletProcessor {
  private readonly pitch = new VoicePitchProcessor(sampleRate)
  constructor() {
    super()
    this.port.onmessage = (event: MessageEvent) => {
      const value = event.data
      if (value?.type === 'pitch') this.pitch.setPitch(value.value)
      if (value?.type === 'mute') this.pitch.setMuted(value.value === true)
      if (value?.type === 'reset') this.pitch.reset()
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0]
    for (const output of outputs[0] ?? []) this.pitch.process(input, output)
    return true
  }
}

registerProcessor('hermes-voice-effects', VoiceEffectsProcessor)
