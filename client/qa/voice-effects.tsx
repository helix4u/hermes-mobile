import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { VoiceEffectsControls } from '../src/components/VoiceEffectsControls'
import { VoiceEffectsPlayback } from '../src/voice-effects-playback'
import { DEFAULT_VOICE_EFFECTS, type VoiceEffectsSettings } from '../src/voice-effects-settings'

let owner: VoiceEffectsPlayback | null = null
let context: AudioContext | null = null
let oscillator: OscillatorNode | null = null
let analyser: AnalyserNode | null = null
let probe: MediaStreamAudioSourceNode | null = null
let audio: HTMLAudioElement | null = null
let current = DEFAULT_VOICE_EFFECTS
let muted = false
let updating = false
let ready = false
let effectsContext: AudioContext | null = null
let effectsMonitor: MediaStreamAudioDestinationNode | null = null
let sender: RTCPeerConnection | null = null
let receiver: RTCPeerConnection | null = null
let incomingStream: MediaStream | null = null
let effectsContextsCreated = 0

function Fixture() {
  const [settings, setSettings] = useState(DEFAULT_VOICE_EFFECTS)
  const [warning, setWarning] = useState('')
  const [bend, setBend] = useState(0)
  const update = async (value: VoiceEffectsSettings) => {
    current = value; setSettings(value)
    updating = true
    try { await owner?.update(value) } finally { updating = false }
  }
  const start = async () => {
    context = new AudioContext()
    oscillator = context.createOscillator(); oscillator.frequency.value = 440
    const level = context.createGain(); level.gain.value = 0.1
    const remote = context.createMediaStreamDestination()
    oscillator.connect(level).connect(remote); oscillator.start()
    let incoming = remote.stream
    if (new URLSearchParams(location.search).has('rtc')) {
      sender = new RTCPeerConnection(); receiver = new RTCPeerConnection()
      const outgoing = sender, receiving = receiver
      outgoing.onicecandidate = event => { if (event.candidate) void receiving.addIceCandidate(event.candidate) }
      receiving.onicecandidate = event => { if (event.candidate) void outgoing.addIceCandidate(event.candidate) }
      const received = new Promise<MediaStream>(resolve => {
        receiving.ontrack = event => resolve(event.streams[0] ?? new MediaStream([event.track]))
      })
      remote.stream.getTracks().forEach(track => outgoing.addTrack(track, remote.stream))
      await outgoing.setLocalDescription(await outgoing.createOffer())
      await receiving.setRemoteDescription(outgoing.localDescription!)
      await receiving.setLocalDescription(await receiving.createAnswer())
      await outgoing.setRemoteDescription(receiving.localDescription!)
      incoming = await received
    }
    audio = document.createElement('audio'); audio.autoplay = true; document.body.append(audio)
    incomingStream = incoming
    owner = new VoiceEffectsPlayback(audio, incoming, setWarning, () => {
      const processing = new AudioContext({ latencyHint: 'interactive' })
      effectsContextsCreated++
      effectsContext = processing
      effectsMonitor = processing.createMediaStreamDestination()
      const createGain = processing.createGain.bind(processing)
      processing.createGain = () => {
        const gain = createGain()
        const connect = gain.connect
        // Observe only the final production output, never a pre-mute dry/wet branch.
        gain.connect = ((...args: unknown[]) => {
          if (args[0] === processing.destination) Reflect.apply(connect, gain, [effectsMonitor!])
          return Reflect.apply(connect, gain, args)
        }) as GainNode['connect']
        return gain
      }
      return processing
    })
    await context.resume(); await owner.update(current); await audio.play()
    ready = true
  }
  const spectrum = async () => {
    if (!context || !audio?.srcObject) throw new Error('Not started')
    probe?.disconnect()
    const output = current.enabled && effectsContext?.state === 'running' ? effectsMonitor!.stream : audio.srcObject as MediaStream
    probe = context.createMediaStreamSource(output)
    analyser ??= context.createAnalyser(); analyser.fftSize = 32768; analyser.smoothingTimeConstant = 0
    probe.connect(analyser)
    const silent = context.createGain(); silent.gain.value = 0
    analyser.connect(silent).connect(context.destination)
    await new Promise(resolve => setTimeout(resolve, 1100))
    const bins = new Float32Array(analyser.frequencyBinCount); analyser.getFloatFrequencyData(bins)
    let best = 0
    for (let i = 1; i < bins.length; i++) if (bins[i]! > bins[best]!) best = i
    const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples)
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)
    silent.disconnect(); analyser.disconnect()
    return { hz: best * context.sampleRate / analyser.fftSize, rms, sampleRate: context.sampleRate }
  }
  const stereo = async () => {
    if (!context || !effectsMonitor) throw new Error('Effects not started')
    const input = context.createMediaStreamSource(effectsMonitor.stream)
    const split = context.createChannelSplitter(2)
    const channels = [context.createAnalyser(), context.createAnalyser()]
    const silent = context.createGain(); silent.gain.value = 0
    input.connect(split)
    channels.forEach((channel, index) => { channel.fftSize = 32768; split.connect(channel, index); channel.connect(silent) })
    silent.connect(context.destination)
    try {
      await new Promise(resolve => setTimeout(resolve, 1100))
      return channels.map(channel => {
        const values = new Float32Array(channel.fftSize); channel.getFloatTimeDomainData(values)
        return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length)
      })
    } finally { input.disconnect(); split.disconnect(); channels.forEach(channel => channel.disconnect()); silent.disconnect() }
  }
  ;(window as any).voiceEffectsQA = {
    start, spectrum, stereo, ready: () => ready, settings: () => current, updating: () => updating,
    route: () => ({ sourceRetained: audio?.srcObject === incomingStream,
      directVolume: audio?.volume, clock: effectsContext?.currentTime, rtc: receiver?.connectionState, effectsContextsCreated }),
    mute: (value: boolean) => { muted = value; owner?.setMuted(value) },
    muted: () => muted && audio?.muted,
    dispose: async () => { owner?.dispose(); owner = null; oscillator?.stop(); probe?.disconnect();
      audio?.pause(); audio?.remove(); sender?.close(); receiver?.close();
      effectsMonitor?.stream.getTracks().forEach(track => track.stop()); await context?.close(); context = null },
  }
  return <main style={{ maxWidth: 440, padding: 16 }}>
    <h1>Isolated playback fixture</h1>
    <button onClick={() => void start()}>Start synthetic audio</button>
    <VoiceEffectsControls value={settings} onChange={value => void update(value)} warning={warning}
      onBend={value => { setBend(value); owner?.setBend(value) }} />
    <output aria-label="Current bend">{bend}</output>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
