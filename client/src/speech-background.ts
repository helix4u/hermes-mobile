export interface SpeechBackgroundBridge {
  retainSpeechQueue(options: { leaseId: string }): Promise<void>
  releaseSpeechQueue(options: { leaseId: string }): Promise<void>
}

/** One owner for the whole queue, including gaps between synthesized clips. */
export class SpeechBackgroundLease {
  private readonly leaseId = `speech-queue-${crypto.randomUUID()}`
  private wanted = false
  private retained = false
  private pending: Promise<void> = Promise.resolve()

  constructor(
    private readonly bridge: SpeechBackgroundBridge,
    private readonly onError: (error: unknown) => void,
  ) {}

  setActive(active: boolean): Promise<void> {
    this.wanted = active
    this.pending = this.pending.then(async () => {
      while (this.retained !== this.wanted) {
        const retaining = this.wanted
        if (retaining) await this.bridge.retainSpeechQueue({ leaseId: this.leaseId })
        else await this.bridge.releaseSpeechQueue({ leaseId: this.leaseId })
        this.retained = retaining
      }
    }).catch(this.onError)
    return this.pending
  }
}
