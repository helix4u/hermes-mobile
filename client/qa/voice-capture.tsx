// Production dictation/speech hook with synthetic devices and transport only.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useVoice } from '../src/voice'
import type { HermesTransport } from '../src/transport/hermes-transport'

const witness = { starts: 0, stops: 0, plays: 0, tracksStopped: 0, transcripts: [] as string[], errors: [] as string[], transcribes: 0, nativeStarts: 0, nativeStops: 0 }
let holdStart = false
let rejectStart = false
let releaseStart: (() => void) | null = null
let holdTranscription = false
let releaseTranscription: (() => void) | null = null
class Recorder extends EventTarget {
  static isTypeSupported() { return true }
  mimeType = 'audio/webm'
  start() { witness.starts++ }
  stop() {
    witness.stops++
    const data = new Event('dataavailable')
    Object.defineProperty(data, 'data', { value: new Blob(['synthetic capture'], { type: this.mimeType }) })
    this.dispatchEvent(data)
    this.dispatchEvent(new Event('stop'))
  }
}
Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: Recorder })
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
  if (holdStart) await new Promise<void>(resolve => { releaseStart = resolve })
  if (rejectStart) throw new Error('Synthetic microphone failure')
  return { getTracks: () => [{ stop: () => witness.tracksStopped++ }] }
} })
const audios: Audio[] = []
class Audio extends EventTarget {
  duration = 0.1
  defaultPlaybackRate = 1
  playbackRate = 1
  preservesPitch = true
  constructor(_src: string) { super(); audios.push(this) }
  async play() { witness.plays++; this.dispatchEvent(new Event('playing')) }
  pause() {}
  removeAttribute() {}
  load() {}
}
Object.defineProperty(window, 'Audio', { configurable: true, value: Audio })
const transport = { async requestJson(path: string) {
  if (path === '/api/audio/transcribe') {
    witness.transcribes++
    if (holdTranscription) await new Promise<void>(resolve => { releaseTranscription = resolve })
    return { transcript: 'Synthetic dictated message.' }
  }
  if (path === '/api/audio/speak') return { data_url: 'data:audio/wav;base64,U1lOVEhFVElD' }
  throw new Error(`Unexpected fixture path ${path}`)
} } as unknown as HermesTransport
function Fixture() {
  const [connection, setConnection] = useState('synthetic-one')
  const voice = useVoice({ connectionId: connection, nativeClient: false,
    getTransport: () => transport, getDefaultTtsConfig: () => ({ provider: 'synthetic' }),
    onError: message => { if (message) witness.errors.push(message) },
    onTranscript: text => witness.transcripts.push(text),
  })
  ;(window as any).qa = { voice, witness,
    pet: () => voice.speak('Synthetic pet comment.', 'pet-sidechat'),
    finishAudio: () => audios.at(-1)?.dispatchEvent(new Event('ended')),
    startOptions: (hold: boolean, fail: boolean) => { holdStart = hold; rejectStart = fail },
    releaseStart: () => { holdStart = false; releaseStart?.(); releaseStart = null },
    holdTranscription: () => { holdTranscription = true },
    releaseTranscription: () => { holdTranscription = false; releaseTranscription?.(); releaseTranscription = null },
    switchTarget: () => setConnection('synthetic-two'),
    unmount: () => root.unmount(),
  }
  return <><output data-testid="phase">{voice.phase}</output><button onClick={voice.toggleRecording}>{voice.phase === 'recording' ? 'Stop recording and transcribe' : voice.phase === 'transcribing' ? 'Transcribing' : 'Record'}</button></>
}
const root = createRoot(document.getElementById('root')!)
root.render(<Fixture />)
