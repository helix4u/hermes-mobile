import { expect, it, vi } from 'vitest'
import { createSpeechAudio, NativeSpeechAudio, type SpeechAudioBridge } from './speech-audio'

function fixture() {
  let emit: Parameters<SpeechAudioBridge['addListener']>[1] = () => undefined
  const remove = vi.fn(async () => undefined)
  const bridge: SpeechAudioBridge = {
    startSpeech: vi.fn(async () => undefined),
    pauseSpeech: vi.fn(async () => undefined),
    stopSpeech: vi.fn(async () => undefined),
    addListener: vi.fn(async (_event, listener) => {
      emit = listener
      return { remove }
    }),
  }
  return { bridge, emit: (event: Parameters<typeof emit>[0]) => emit(event), remove }
}

it('uses native playback on Android and leaves browser audio alone', () => {
  const browser = vi.fn(function () { return new EventTarget() })
  vi.stubGlobal('Audio', browser)
  try {
    expect(createSpeechAudio('data:audio/wav;base64,AA==', true)).toBeInstanceOf(NativeSpeechAudio)
    expect(browser).not.toHaveBeenCalled()
    createSpeechAudio('browser-audio', false)
    expect(browser).toHaveBeenCalledWith('browser-audio')
  } finally {
    vi.unstubAllGlobals()
  }
})

it('keeps clip identity, duration, rate and pause/resume without a WebView player', async () => {
  const { bridge, emit, remove } = fixture()
  const audio = new NativeSpeechAudio('data:audio/wav;base64,AA==', bridge)
  const playing = vi.fn()
  const ended = vi.fn()
  audio.addEventListener('playing', playing)
  audio.addEventListener('ended', ended)
  audio.playbackRate = 1.2
  await audio.play()
  const clip = vi.mocked(bridge.startSpeech).mock.calls[0][0]
  expect(clip.rate).toBe(1.2)
  expect(playing).not.toHaveBeenCalled()
  emit({ playbackId: clip.playbackId, state: 'playing', durationMs: 2000 })
  expect(audio.duration).toBe(2)
  expect(playing).toHaveBeenCalledTimes(1)
  audio.pause()
  await audio.play()
  expect(bridge.pauseSpeech).toHaveBeenCalledWith({ playbackId: clip.playbackId })
  expect(vi.mocked(bridge.startSpeech).mock.calls[1][0].playbackId).toBe(clip.playbackId)
  emit({ playbackId: 'another-clip', state: 'ended' })
  expect(ended).not.toHaveBeenCalled()
  emit({ playbackId: clip.playbackId, state: 'ended' })
  await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
  expect(ended).toHaveBeenCalledOnce()
  expect(bridge.stopSpeech).toHaveBeenCalledWith({ playbackId: clip.playbackId })
})

it('cancel during listener setup cannot start late or leak a listener', async () => {
  const { bridge, remove } = fixture()
  let ready!: (handle: { remove: typeof remove }) => void
  bridge.addListener = vi.fn(() => new Promise<{ remove: typeof remove }>(resolve => { ready = resolve }))
  const audio = new NativeSpeechAudio('data:audio/wav;base64,AA==', bridge)
  const pending = audio.play()
  audio.pause()
  audio.removeAttribute('src')
  ready({ remove })
  await pending
  await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
  expect(bridge.startSpeech).not.toHaveBeenCalled()
})

it('surfaces native errors and never falls back to focus-stealing WebView audio', async () => {
  const { bridge, emit, remove } = fixture()
  const audio = new NativeSpeechAudio('data:audio/wav;base64,AA==', bridge)
  const error = vi.fn()
  audio.addEventListener('error', error)
  await audio.play()
  const clip = vi.mocked(bridge.startSpeech).mock.calls[0][0]
  emit({ playbackId: clip.playbackId, state: 'error' })
  await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
  expect(error).toHaveBeenCalledOnce()
  await audio.play()
  expect(bridge.startSpeech).toHaveBeenCalledOnce()
})

it('handles rejected commands and cancellation while native preparation is pending', async () => {
  const { bridge, remove } = fixture()
  let finish!: () => void
  bridge.startSpeech = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const audio = new NativeSpeechAudio('data:audio/wav;base64,AA==', bridge)
  const pending = audio.play()
  await vi.waitFor(() => expect(bridge.startSpeech).toHaveBeenCalledOnce())
  audio.removeAttribute('src')
  finish()
  await pending
  await vi.waitFor(() => expect(bridge.stopSpeech).toHaveBeenCalledOnce())
  expect(remove).toHaveBeenCalledOnce()

  const rejected = fixture()
  rejected.bridge.startSpeech = vi.fn(async () => { throw new Error('decoder failed') })
  const broken = new NativeSpeechAudio('invalid-audio', rejected.bridge)
  const onError = vi.fn()
  broken.addEventListener('error', onError)
  await expect(broken.play()).rejects.toThrow('decoder failed')
  expect(onError).toHaveBeenCalledOnce()
})
