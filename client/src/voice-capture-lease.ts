export type VoiceCapturePhase = 'idle' | 'starting' | 'recording' | 'transcribing'

/** Synchronous microphone ownership, independent of speech playback/React renders. */
export class VoiceCaptureLease {
  phase: VoiceCapturePhase = 'idle'
  private generation = 0
  private owner: number | null = null
  private stopRequested = false
  private waiting: Promise<void> | null = null
  private release: (() => void) | null = null

  constructor(private readonly onPhase: (phase: VoiceCapturePhase) => void) {}

  begin(): number | null {
    if (this.phase !== 'idle') return null
    this.owner = ++this.generation
    this.stopRequested = false
    this.waiting = new Promise(resolve => { this.release = resolve })
    this.update('starting')
    return this.owner
  }

  owns(owner: number): boolean { return this.owner === owner }

  recording(owner: number): boolean {
    if (!this.owns(owner) || this.phase !== 'starting') return false
    this.update('recording')
    return true
  }

  requestStop(): number | null {
    if (this.phase === 'starting') { this.stopRequested = true; return null }
    if (this.phase !== 'recording') return null
    this.update('transcribing')
    return this.owner
  }

  shouldStop(owner: number): boolean { return this.owns(owner) && this.stopRequested }

  finish(owner: number): void {
    if (!this.owns(owner)) return
    this.owner = null
    this.stopRequested = false
    const release = this.release
    this.release = null
    this.waiting = null
    this.update('idle')
    release?.()
  }

  /** Release blocked speech when the owning hook is torn down. */
  retire(): void { if (this.owner !== null) this.finish(this.owner) }

  /** Recheck after each release because a newer capture can reserve the floor. */
  async waitUntilIdle(): Promise<void> {
    while (this.waiting) await this.waiting
  }

  private update(phase: VoiceCapturePhase): void { this.phase = phase; this.onPhase(phase) }
}
