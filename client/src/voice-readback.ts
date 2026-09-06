/** Exact spoken readback gate. Model text alone can never approve a handoff. */
export class VoiceReadback {
  private draft = ''
  private read = false
  private drained = false
  private interrupted = false
  private responseId = ''
  private drainedResponseId = ''

  stage(draft: string): void {
    this.draft = draft
    this.read = false
    this.drained = false
    this.interrupted = false
    this.responseId = ''
    this.drainedResponseId = ''
  }

  clear(): void { this.stage('') }

  private normalize(value: string): string {
    return (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).join(' ')
  }

  transcript(text: string, responseId: string): void {
    if (!this.draft || this.interrupted || !responseId) return
    const spoken = this.normalize(text)
    const exact = this.normalize(this.draft)
    this.read = Boolean(exact) && spoken === exact + ' send that'
    this.responseId = responseId
    this.drained = this.drainedResponseId === responseId
  }

  audioStopped(responseId: string): void {
    if (this.interrupted || !responseId) return
    this.drainedResponseId = responseId
    this.drained = this.responseId === responseId
  }
  speechStarted(): void {
    if (!this.ready) { this.interrupted = true; this.read = false }
  }
  get ready(): boolean { return Boolean(this.draft) && this.read && this.drained && !this.interrupted }

  reply(text: string, currentDraft: string): 'approve' | 'cancel' | 'none' {
    const words = this.normalize(text)
    if (this.draft && /^(no|no thanks|cancel|cancel it|dont send|don t send|do not send)$/.test(words)) {
      this.clear()
      return 'cancel'
    }
    const approve = this.ready && this.draft === currentDraft &&
      /^(yes|yes please|yes send it|send it|go ahead|okay send it|ok send it)$/.test(words)
    // Anything else changes the conversational frame. A later yes needs a new readback.
    this.clear()
    return approve ? 'approve' : 'none'
  }
}
