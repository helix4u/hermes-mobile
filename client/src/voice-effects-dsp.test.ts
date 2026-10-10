import { describe, expect, it } from 'vitest'
import { VoicePitchProcessor } from './voice-effects-dsp'

function signal(pitch: number, rate = 48000) {
  const dsp = new VoicePitchProcessor(rate)
  dsp.setPitch(pitch)
  const samples = new Float32Array(rate)
  for (let offset = 0; offset < samples.length; offset += 128) {
    const input = Float32Array.from({ length: Math.min(128, samples.length - offset) }, (_, index) =>
      0.5 * Math.sin(2 * Math.PI * 440 * (offset + index) / rate))
    dsp.process(input, samples.subarray(offset, offset + input.length))
  }
  return samples.subarray(Math.round(rate / 2))
}

function dominantFrequency(samples: Float32Array, rate: number) {
  let best = 0, frequency = 0
  for (let hz = 190; hz <= 910; hz += 2) {
    let real = 0, imaginary = 0
    for (let i = 0; i < samples.length; i++) {
      const angle = 2 * Math.PI * hz * i / rate
      real += samples[i]! * Math.cos(angle)
      imaginary += samples[i]! * Math.sin(angle)
    }
    const power = real * real + imaginary * imaginary
    if (power > best) { best = power; frequency = hz }
  }
  return frequency
}

describe('streaming pitch DSP', () => {
  it.each([-12, -4, 4, 12])('shifts a real sine by %s semitones without changing its sample count', pitch => {
    const samples = signal(pitch)
    expect(samples).toHaveLength(24000)
    expect(dominantFrequency(samples, 48000)).toBeCloseTo(440 * 2 ** (pitch / 12), -1)
    expect(samples.every(Number.isFinite)).toBe(true)
    expect(Math.max(...samples.map(Math.abs))).toBeLessThanOrEqual(0.51)
  })
  it('supports the 44.1 kHz device clock', () => {
    expect(dominantFrequency(signal(12, 44100), 44100)).toBeCloseTo(880, -1)
  })
  it('passes neutral audio through sample for sample', () => {
    const dsp = new VoicePitchProcessor(48000)
    const input = Float32Array.from([0.2, -0.4, 0.1, 0])
    const output = new Float32Array(input.length)
    dsp.process(input, output)
    expect(output).toEqual(input)
  })
  it('immediately silences and flushes old sound across an interruption', () => {
    const dsp = new VoicePitchProcessor(48000)
    dsp.setPitch(7)
    const output = new Float32Array(128)
    for (let i = 0; i < 50; i++) dsp.process(new Float32Array(128).fill(0.5), output)
    dsp.setMuted(true)
    dsp.process(new Float32Array(128).fill(0.8), output)
    expect(output.every(value => value === 0)).toBe(true)
    dsp.setMuted(false)
    for (let i = 0; i < 50; i++) {
      dsp.process(new Float32Array(128), output)
      expect(output.every(value => value === 0)).toBe(true)
    }
  })
  it('remains bounded during a continuous pitch bend and missing input', () => {
    const dsp = new VoicePitchProcessor(48000)
    const output = new Float32Array(128)
    for (let i = 0; i < 200; i++) {
      dsp.setPitch(i % 2 ? -12 : 12)
      dsp.process(new Float32Array(128).fill(0.5), output)
      // Spectral remapping can change peaks. The output must stay in the PCM range.
      expect(output.every(value => Number.isFinite(value) && Math.abs(value) <= 1)).toBe(true)
    }
    dsp.process(undefined, output)
    expect(output.every(value => value === 0)).toBe(true)
  })
})
