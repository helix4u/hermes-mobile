import workletUrl from './voice-effects-worklet?worker&url'
import { normalizeVoiceEffects, type VoiceEffectsSettings } from './voice-effects-settings'

interface EffectsGraph {
  context: AudioContext
  source: MediaStreamAudioSourceNode
  pitch: AudioWorkletNode
  bass: BiquadFilterNode
  treble: BiquadFilterNode
  highpass: BiquadFilterNode
  lowpass: BiquadFilterNode
  gain: GainNode
  dry: GainNode
  spatial: PannerNode
  wet: GainNode
}

/** Keep WebRTC's receiver sink alive, and render effects to the device output. */
export class VoiceEffectsPlayback {
  private graph: EffectsGraph | null = null
  private pending: Promise<void> | null = null
  private disposed = false
  private settings = normalizeVoiceEffects(null)
  private bend = 0
  private muted: boolean
  private clockWatch: ReturnType<typeof setInterval> | null = null

  constructor(private readonly audio: HTMLAudioElement, private readonly remote: MediaStream,
    private readonly warning: (message: string) => void,
    private readonly contextFactory: () => AudioContext = () => new AudioContext({ latencyHint: 'interactive' })) {
    this.muted = audio.muted
    audio.srcObject = remote
  }

  async update(value: VoiceEffectsSettings | undefined): Promise<void> {
    if (this.disposed) return
    this.settings = normalizeVoiceEffects(value)
    if (!this.settings.enabled) {
      this.bend = 0
      this.releaseGraph()
      this.rebind()
      this.warning('')
      return
    }
    if (!this.graph) {
      this.pending ??= this.createGraph().finally(() => { this.pending = null })
      await this.pending
    }
    if (this.disposed) return
    if (!this.settings.enabled) this.releaseGraph()
    this.apply()
    this.rebind()
  }

  private async createGraph(): Promise<void> {
    let context: AudioContext | null = null
    const nodes: AudioNode[] = []
    const own = <T extends AudioNode>(node: T): T => { nodes.push(node); return node }
    let pitch: AudioWorkletNode | null = null
    let published = false
    try {
      context = this.contextFactory()
      await context.audioWorklet.addModule(workletUrl)
      if (this.disposed || !this.settings.enabled) { await context.close(); return }
      const source = own(context.createMediaStreamSource(this.remote))
      pitch = own(new AudioWorkletNode(context, 'hermes-voice-effects', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
        channelCount: 1, channelCountMode: 'explicit',
      }))
      const bass = own(context.createBiquadFilter()); bass.type = 'lowshelf'; bass.frequency.value = 240
      const treble = own(context.createBiquadFilter()); treble.type = 'highshelf'; treble.frequency.value = 3200
      const highpass = own(context.createBiquadFilter()); highpass.type = 'highpass'; highpass.Q.value = 0.7
      const lowpass = own(context.createBiquadFilter()); lowpass.type = 'lowpass'; lowpass.Q.value = 0.7
      const gain = own(context.createGain())
      gain.gain.value = 0
      const dry = own(context.createGain()); dry.gain.value = 1
      const spatial = own(context.createPanner())
      spatial.panningModel = 'HRTF'
      spatial.distanceModel = 'inverse'
      spatial.refDistance = 1
      spatial.maxDistance = 5
      spatial.rolloffFactor = 1
      spatial.positionZ.value = -1
      const wet = own(context.createGain()); wet.gain.value = 0
      this.graph = { context, source, pitch, bass, treble, highpass, lowpass, gain, dry, spatial, wet }
      published = true
      source.connect(pitch).connect(bass).connect(treble).connect(highpass).connect(lowpass)
      // Both branches, including the HRTF tail, are behind the final immediate mute gate.
      lowpass.connect(dry).connect(gain)
      lowpass.connect(spatial).connect(wet).connect(gain)
      gain.connect(context.destination)
      pitch.onprocessorerror = () => this.fail()
      context.onstatechange = () => {
        if (!this.disposed && this.settings.enabled && context?.state === 'suspended') {
          this.fail()
        }
      }
      this.setMuted(this.muted)
      await context.resume()
      if (this.disposed || this.graph?.context !== context || !this.settings.enabled) return
      let observedTime = context.currentTime
      const clock = context
      this.clockWatch = setInterval(() => {
        if (this.graph?.context !== clock || this.disposed) return
        if (clock.state !== 'running' || clock.currentTime <= observedTime) this.fail()
        observedTime = clock.currentTime
      }, 2500)
      this.warning('')
    } catch {
      if (context && !published) {
        // Setup may fail before the complete graph is published, e.g. unsupported HRTF.
        for (const node of nodes) node.disconnect()
        pitch?.port.close()
        await context.close().catch(() => undefined)
      }
      if (this.settings.enabled && (!published || this.graph?.context === context)) this.fail()
    }
  }

  private fail(): void {
    if (this.disposed) return
    this.releaseGraph()
    this.audio.srcObject = this.remote
    this.audio.volume = 1
    this.audio.muted = this.muted
    this.warning('Voice effects unavailable. Playing the original voice. Toggle effects to retry.')
    void this.audio.play().catch(() => {
      if (!this.disposed) this.warning('Voice playback failed. Stop and restart live voice.')
    })
  }

  private apply(): void {
    const graph = this.graph
    if (!graph) return
    const now = graph.context.currentTime
    graph.pitch.port.postMessage({ type: 'pitch', value: this.settings.pitch + this.bend })
    graph.bass.gain.setTargetAtTime(this.settings.bass, now, 0.015)
    graph.treble.gain.setTargetAtTime(this.settings.treble, now, 0.015)
    graph.highpass.frequency.setTargetAtTime(this.settings.radio ? 400 : 20, now, 0.015)
    graph.lowpass.frequency.setTargetAtTime(this.settings.radio ? 2800 : Math.min(20000, graph.context.sampleRate * 0.45), now, 0.015)
    // Static placement on a front-facing arc. Radius owns distance independently of azimuth.
    const angle = this.settings.spatialPosition * Math.PI / 3
    graph.spatial.positionX.setTargetAtTime(Math.sin(angle) * this.settings.spatialDistance, now, 0.03)
    graph.spatial.positionY.setTargetAtTime(0, now, 0.03)
    graph.spatial.positionZ.setTargetAtTime(-Math.cos(angle) * this.settings.spatialDistance, now, 0.03)
    graph.dry.gain.setTargetAtTime(this.settings.spatial ? 0 : 1, now, 0.015)
    graph.wet.gain.setTargetAtTime(this.settings.spatial ? 1 : 0, now, 0.015)
    this.setMuted(this.muted)
  }

  setBend(value: number): void {
    this.bend = this.settings.enabled && Number.isFinite(value) ? Math.max(-12, Math.min(12, value)) : 0
    this.graph?.pitch.port.postMessage({ type: 'pitch', value: this.settings.pitch + this.bend })
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.audio.muted = muted
    // The receiver stays attached to its original element. Only one route is audible.
    this.audio.volume = this.settings.enabled && this.graph ? 0 : 1
    const graph = this.graph
    if (!graph) return
    // Gate immediately, before the asynchronous worklet message clears its delay.
    graph.gain.gain.cancelScheduledValues(graph.context.currentTime)
    graph.gain.gain.value = muted || !this.settings.enabled ? 0 : 10 ** (-Math.max(0, this.settings.bass, this.settings.treble) / 20)
    graph.pitch.port.postMessage({ type: 'mute', value: muted || !this.settings.enabled })
  }

  rebind(force = false): void {
    if (this.disposed) return
    const stream = this.remote
    if (force || this.audio.srcObject !== stream) {
      if (force) this.audio.srcObject = null
      this.audio.srcObject = stream
      void this.audio.play().catch(() => {
        if (!this.disposed) this.warning('Voice playback failed. Stop and restart live voice.')
      })
    }
    this.setMuted(this.muted)
  }

  private releaseGraph(): void {
    if (this.clockWatch) clearInterval(this.clockWatch)
    this.clockWatch = null
    const graph = this.graph
    this.graph = null
    if (!graph) return
    graph.pitch.onprocessorerror = null
    graph.context.onstatechange = null
    graph.gain.gain.value = 0
    for (const node of [graph.source, graph.pitch, graph.bass, graph.treble, graph.highpass, graph.lowpass,
      graph.dry, graph.spatial, graph.wet, graph.gain]) node.disconnect()
    graph.pitch.port.close()
    void graph.context.close().catch(() => undefined)
  }

  dispose(): void {
    this.disposed = true
    this.releaseGraph()
  }
}
