import { describe, expect, test } from 'vitest'
import { audioBufferToMonoPcm16, encodePcm16Wav } from './voice'

describe('full reader render helpers', () => {
  test('mixes channels and resamples to mono PCM', () => {
    const left = new Float32Array([0, 1, 0, -1])
    const right = new Float32Array([0, 0.5, 0, -0.5])
    const pcm = audioBufferToMonoPcm16(
      {
        getChannelData: channel => (channel === 0 ? left : right),
        length: left.length,
        numberOfChannels: 2,
        sampleRate: 4,
      },
      4,
    )

    expect([...pcm]).toEqual([0, 24575, 0, -24576])
  })

  test('writes one valid mono PCM WAV from ordered chunks', () => {
    const wav = encodePcm16Wav(
      [new Int16Array([1, 2]), new Int16Array([-3])],
      24_000,
    )
    const view = new DataView(wav)
    const ascii = (start: number, length: number) =>
      String.fromCharCode(...new Uint8Array(wav.slice(start, start + length)))

    expect(ascii(0, 4)).toBe('RIFF')
    expect(ascii(8, 4)).toBe('WAVE')
    expect(ascii(36, 4)).toBe('data')
    expect(view.getUint32(24, true)).toBe(24_000)
    expect(view.getUint32(40, true)).toBe(6)
    expect(view.getInt16(48, true)).toBe(-3)
  })
})
