import type { PluginListenerHandle } from '@capacitor/core'
import { HermesNative } from './transport/native-bridge'

export interface SpeechAudio extends EventTarget {
  duration: number
  defaultPlaybackRate: number
  playbackRate: number
  preservesPitch: boolean
  play(): Promise<void>
  pause(): void
  removeAttribute(name: string): void
  load(): void
}

export interface SpeechAudioBridge {
  startSpeech(options: { playbackId: string; dataUrl: string; rate: number }): Promise<void>
  pauseSpeech(options: { playbackId: string }): Promise<void>
  stopSpeech(options: { playbackId: string }): Promise<void>
  addListener(event: 'speechPlayback', listener: (event: {
    playbackId: string
    state: 'playing' | 'ended' | 'error'
    durationMs?: number
  }) => void): Promise<PluginListenerHandle>
}

/** Android TTS bypasses WebView media focus. Ordinary browser media is unchanged. */
export class NativeSpeechAudio extends EventTarget implements SpeechAudio {
  duration = Number.NaN
  defaultPlaybackRate = 1
  playbackRate = 1
  preservesPitch = true
  private readonly playbackId = `speech-${crypto.randomUUID()}`
  private listener: Promise<PluginListenerHandle> | null = null
  private commands: Promise<void> = Promise.resolve()
  private disposed = false
  private paused = true

  constructor(
    private readonly dataUrl: string,
    private readonly bridge: SpeechAudioBridge,
  ) {
    super()
  }

  async play(): Promise<void> {
    if (this.disposed) return
    this.paused = false
    this.listener ??= this.bridge.addListener('speechPlayback', event => {
      if (this.disposed || event.playbackId !== this.playbackId) return
      if (event.state === 'playing') {
        this.duration = (event.durationMs ?? 0) / 1000
        this.dispatchEvent(new Event('loadedmetadata'))
        if (!this.paused) this.dispatchEvent(new Event('playing'))
      } else {
        this.dispatchEvent(new Event(event.state))
        this.dispose()
      }
    })
    await this.listener
    if (this.disposed || this.paused) return
    await this.command(() => this.bridge.startSpeech({
      playbackId: this.playbackId,
      dataUrl: this.dataUrl,
      rate: this.playbackRate,
    }))
  }

  pause(): void {
    this.paused = true
    if (!this.disposed) {
      void this.command(() => this.bridge.pauseSpeech({ playbackId: this.playbackId }))
    }
  }

  removeAttribute(name: string): void {
    if (name === 'src') this.dispose()
  }

  load(): void {
    // Removing the source already releases native playback.
  }

  private command(action: () => Promise<void>): Promise<void> {
    const result = this.commands.then(action)
    this.commands = result.catch(() => {
      if (!this.disposed) {
        this.dispatchEvent(new Event('error'))
        this.dispose()
      } else {
        console.warn('Native speech cleanup failed')
      }
    })
    return result
  }

  private dispose(): void {
    if (this.disposed) return
    this.disposed = true
    void this.command(() => this.bridge.stopSpeech({ playbackId: this.playbackId }))
    void this.listener?.then(handle => handle.remove()).catch(() => {
      console.warn('Native speech listener cleanup failed')
    })
  }
}

export function createSpeechAudio(
  dataUrl: string,
  nativeClient: boolean,
): SpeechAudio {
  return nativeClient
    ? new NativeSpeechAudio(dataUrl, HermesNative)
    : new Audio(dataUrl)
}
