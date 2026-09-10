/**
 * WebRTC floor ownership. VAD records utterance ordering without silencing
 * output. Only accepted speech ASR takes the floor. Generation completion is not playback completion.
 * Kept portable for the independently shipped Desktop and Mobile clients.
 */
export class RealtimeFloor {
  epoch = 0
  blocked = false
  private generating = false
  private playing = false
  private playingResponse = ''
  private playbackStartedAt = 0
  private pending: { response: Record<string, unknown>; epoch: number } | null = null
  private responseEpochs = new Map<string, number>()
  private inputSequence = 0
  private lastSpeechSequence = 0
  private inputs = new Map<string, { sequence: number; onSpeech?: () => void }>()
  private unassignedInputs: { sequence: number; onSpeech?: () => void }[] = []
  private seenInputs = new Set<string>()
  private outputResponse = ''
  private drainedResponse = ''
  inputHasStart = false

  constructor(
    private send: (event: Record<string, unknown>) => boolean,
    private mute: (muted: boolean) => void,
    private trace: (phase: string, epoch: number, elapsedMs?: number) => void = () => undefined
  ) {}

  request(response: Record<string, unknown> = {}, epoch = this.epoch): boolean {
    if (this.blocked || epoch !== this.epoch || this.generating) return false
    // Tool completion is not speaker completion. Finish the current audio
    // buffer before asking for a continuation on the same floor.
    if (this.playing) {
      this.pending = { response, epoch }
      this.trace('response_waiting_for_playback', epoch)
      return true
    }
    const sent = this.send({
      type: 'response.create',
      response: { ...response, metadata: { pet_turn: String(epoch) } }
    })
    if (sent) {
      this.generating = true
      this.trace('response_requested', epoch)
    }
    return sent
  }

  private silence(): void {
    this.pending = null
    this.mute(true)
    // Cancel generation AND discard buffered WebRTC audio, including after response.done.
    if (this.generating) this.send({ type: 'response.cancel' })
    this.send({ type: 'output_audio_buffer.clear' })
    this.generating = false
    this.playing = false
    this.playingResponse = ''
    this.drainedResponse = ''
    if (this.playbackStartedAt) this.trace('playback_interrupted', this.epoch, Date.now() - this.playbackStartedAt)
    this.playbackStartedAt = 0
  }

  acceptInput(raw: unknown, speech = true): boolean {
    const event = raw as { item_id?: string }
    const id = event.item_id
    const input = id ? this.inputs.get(id) : undefined
    // Documented VAD/commit IDs are the authority. Do not reassign a delayed,
    // unknown ASR to the latest utterance or infer identity from ASR arrival
    // order. Transcription completions can arrive out of order.
    if (!id || this.seenInputs.has(id) || (this.inputSequence && !input) ||
      (input && input.sequence <= this.lastSpeechSequence)) return false
    if (id) {
      this.seenInputs.add(id)
      if (this.seenInputs.size > 256) this.seenInputs.delete(this.seenInputs.values().next().value!)
    }
    this.inputHasStart = Boolean(input?.onSpeech)
    if (speech) {
      // Only confirmed speech supersedes earlier input. A later noise VAD/ASR
      // must not invalidate an otherwise valid delayed approval.
      this.lastSpeechSequence = input?.sequence ?? ++this.inputSequence
      input?.onSpeech?.()
      this.epoch++
      this.silence()
      this.blocked = false
      this.trace('barge_in', this.epoch)
    }
    return true
  }

  stayQuiet(): void {
    this.blocked = true
    this.silence()
    this.trace('quiet', this.epoch)
  }

  handle(raw: unknown, onSpeech?: () => void): boolean {
    const event = raw as {
      type?: string; item_id?: string; response_id?: string
      error?: { code?: string }
      response?: { id?: string; metadata?: { pet_turn?: string } }
    }
    const type = event.type || ''
    if (type === 'error' && event.error?.code === 'response_cancel_not_active') return false
    if (type === 'input_audio_buffer.committed' && event.item_id && !this.inputs.has(event.item_id)) {
      if (this.seenInputs.has(event.item_id)) return false
      this.inputs.set(event.item_id, this.unassignedInputs.shift() ?? { sequence: ++this.inputSequence })
      if (this.inputs.size > 256) this.inputs.delete(this.inputs.keys().next().value!)
    }
    if (type === 'input_audio_buffer.speech_started') {
      if (event.item_id && (this.inputs.has(event.item_id) || this.seenInputs.has(event.item_id))) return false
      const input = { sequence: ++this.inputSequence, onSpeech }
      if (event.item_id) {
        this.inputs.set(event.item_id, input)
        if (this.inputs.size > 256) this.inputs.delete(this.inputs.keys().next().value!)
      } else {
        this.unassignedInputs.push(input)
        if (this.unassignedInputs.length > 256) this.unassignedInputs.shift()
      }
      return true
    }
    const id = event.response?.id || event.response_id || ''
    if (type === 'response.created') {
      const tag = event.response?.metadata?.pet_turn
      const epoch = tag === undefined ? this.epoch : Number(tag)
      if (id) {
        this.responseEpochs.set(id, epoch)
        if (this.responseEpochs.size > 256) this.responseEpochs.delete(this.responseEpochs.keys().next().value!)
      }
    }
    if (type.startsWith('response.') || type.startsWith('output_audio_buffer.')) {
      const stale = id && this.responseEpochs.has(id) && this.responseEpochs.get(id) !== this.epoch
      if (this.blocked || stale) {
        if (type === 'response.created') {
          this.send({ type: 'response.cancel', ...(id ? { response_id: id } : {}) })
        }
        return false
      }
      if (type === 'response.created') {
        this.generating = true
        if (this.outputResponse !== id) this.drainedResponse = ''
        this.outputResponse = id
      }
      if (type === 'response.done') this.generating = false
      if (type === 'output_audio_buffer.started') {
        this.playing = true
        this.playingResponse = id
        this.playbackStartedAt = Date.now()
        this.mute(false)
        this.trace('playback_started', this.epoch)
      }
      if (type === 'output_audio_buffer.stopped' || type === 'output_audio_buffer.cleared') {
        if (id && this.playingResponse && id !== this.playingResponse) return false
        this.playing = false
        this.playingResponse = ''
        if (id === this.outputResponse) this.drainedResponse = type === 'output_audio_buffer.stopped' ? id : ''
        this.trace(type === 'output_audio_buffer.cleared' ? 'playback_cleared' : 'playback_stopped', this.epoch,
          this.playbackStartedAt ? Date.now() - this.playbackStartedAt : 0)
        this.playbackStartedAt = 0
        const pending = this.pending
        this.pending = null
        if (pending) this.request(pending.response, pending.epoch)
      }
    }
    return true
  }

  get speaking(): boolean { return this.playing }
  get responseId(): string { return this.outputResponse }
  get playbackDrained(): boolean { return Boolean(this.outputResponse) && this.drainedResponse === this.outputResponse && !this.playing }

  reset(): void {
    this.epoch++
    this.blocked = false
    this.generating = false
    this.playing = false
    this.playingResponse = ''
    this.pending = null
    this.playbackStartedAt = 0
    this.responseEpochs.clear()
    this.inputs.clear()
    this.unassignedInputs = []
    this.inputSequence = 0
    this.lastSpeechSequence = 0
    this.inputHasStart = false
    this.outputResponse = ''
    this.drainedResponse = ''
    this.seenInputs.clear()
  }
}

/** Deliberately exact: quoted commands, "don't stop", and stop-the-agent requests are not silence. */
export function realtimeWantsSilence(text: string): boolean {
  const clean = text.toLowerCase().trim().replace(/[.!?,;]+/g, ' ').replace(/\s+/g, ' ').trim()
  return /^(?:(?:please|hey|okay|ok) )?(?:stop(?: talking| speaking)?|shut (?:the (?:fuck|hell) )?up|be quiet|quiet|let me (?:talk|speak|finish))(?:(?: please)|(?: now))?$/.test(clean)
}
