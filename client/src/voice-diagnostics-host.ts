import type { HermesTransport } from './transport/hermes-transport'

export interface VoiceDiagnosticEntry {
  phase: string
  elapsedMs: number
  epoch: number
  muted: boolean
  tracks: number
}

export interface VoiceDiagnosticsContext {
  transport: HermesTransport | null
  enabled: boolean
  /** Public numeric release version, optionally followed by a commit hash. */
  build?: string
}

const BASIC_PHASES = `output.muted output.unmuted review.cancelled review.approved review.reread
review.unverified microphone_muted microphone_unmuted provider_failure
review.state.idle review.state.interrupted review.state.awaiting_transcript
review.state.content_mismatch review.state.ready review.state.awaiting_audio
start.microphone start.credentials playback_failed microphone_ended
capture_suspended capture_resumed microphone_acquired event_handler_failed
start.connection_failed start.context_capacity start.requested start.permission
start.failed start.session_failed probe.signal probe.quiet input.suspended
input.signal input.quiet session.created input_audio_buffer.speech_started
input_audio_buffer.speech_stopped conversation.item.input_audio_transcription.completed
conversation.item.input_audio_transcription.failed response.created response.done error
output.unexpected_pause output.media_playing output.media_waiting output.media_unobservable
output.media_recovered output.media_progress output.media_stalled
response_waiting_for_playback response_requested playback_interrupted quiet barge_in
playback_started playback_cleared playback_stopped`.split(/\s+/)
const REASONS = `context_capacity cancel_already_complete response_busy empty_input
rate_limited authentication session_expired session_missing context_backend_error
disconnected timeout interrupted unknown`.split(/\s+/)
const TOOLS = `wait_for_user read_attached_context propose_attached_action draft_hermes_request
get_ui_context get_session_workers read_worker_activity draft_worker_steer
read_voice_conversation read_voice_memory recall_voice_memory save_voice_memory
forget_voice_memory search_voice_web read_voice_webpage get_context_snapshot
get_session_context get_pet_sidechat_history get_session_activity read_session_context
search_session_context unknown`.split(/\s+/)
const PHASES = new Set([
  ...BASIC_PHASES,
  ...['provider.error', 'provider.response_failed', 'tool.failure'].flatMap(prefix => REASONS.map(reason => `${prefix}.${reason}`)),
  ...TOOLS.flatMap(tool => ['started', 'completed', 'failed'].map(stage => `tool.${tool}.${stage}`)),
  ...['new', 'connecting', 'connected', 'disconnected', 'failed', 'closed'].map(state => `peer.${state}`),
  ...['unavailable', 'permission', 'busy', 'failed'].map(reason => `start.microphone_${reason}`),
])

export const VOICE_DIAGNOSTICS_ENDPOINT = '/api/plugins/hermes-mobile/v1/voice-diagnostics'
export const VOICE_DIAGNOSTICS_INTERVAL_MS = 10_000
export const VOICE_DIAGNOSTICS_MAX_ENTRIES = 32

/** Project fields explicitly. Extra raw event/error fields never leave this process. */
export function sanitizeVoiceDiagnostic(value: VoiceDiagnosticEntry): VoiceDiagnosticEntry | null {
  if (!value || !PHASES.has(value.phase) || typeof value.muted !== 'boolean') return null
  if (![value.elapsedMs, value.epoch, value.tracks].every(Number.isFinite)) return null
  const bound = (number: number, max: number) => Math.max(0, Math.min(max, Math.round(number)))
  return { phase: value.phase, elapsedMs: bound(value.elapsedMs, 120_000),
    epoch: bound(value.epoch, 2_147_483_647), muted: value.muted, tracks: bound(value.tracks, 32) }
}

/**
 * One instance per voice-hook owner. Configure on opt-in/transport/profile changes,
 * record from traceVoice, and dispose on unmount. No storage, listeners or retries.
 * A failed upload disables this context until it is replaced or opt-in is toggled.
 */
export class VoiceDiagnosticsHost {
  private transport: HermesTransport | null = null
  private scope = ''
  private enabled = false
  private build: string | undefined
  private generation = 0
  private disabled = false
  private disposed = false
  private inFlight = false
  private nextSend = 0
  private queue: VoiceDiagnosticEntry[] = []
  private timer: ReturnType<typeof setTimeout> | null = null

  configure(context: VoiceDiagnosticsContext): void {
    if (this.disposed) return
    const transport = context.transport
    const scope = this.transportScope(transport)
    const build = context.build && /^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}(?:\+[a-f0-9]{7,40})?$/.test(context.build) ? context.build : undefined
    if (transport === this.transport && scope === this.scope && context.enabled === this.enabled && build === this.build) return
    this.clear()
    this.generation += 1
    this.transport = transport
    this.scope = scope
    this.enabled = context.enabled
    this.build = build
    this.disabled = false
  }

  record(entry: VoiceDiagnosticEntry): void {
    if (!this.active()) return
    const clean = sanitizeVoiceDiagnostic(entry)
    if (!clean) return
    this.queue.push(clean)
    if (this.queue.length > VOICE_DIAGNOSTICS_MAX_ENTRIES) this.queue.shift()
    this.schedule()
  }

  dispose(): void {
    this.clear()
    this.generation += 1
    this.disposed = true
    this.transport = null
  }

  private transportScope(transport: HermesTransport | null): string {
    // Identity stays local. In particular, never serialize base URLs or connection IDs.
    return transport ? JSON.stringify([transport.connection.id, transport.connection.baseUrl, transport.connection.profile || 'default']) : ''
  }

  private active(): boolean {
    if (this.transportScope(this.transport) !== this.scope) {
      // A caller mutated the selected transport in place. Do not deliver old evidence.
      this.clear()
      this.disabled = true
    }
    return !this.disposed && this.enabled && !this.disabled && this.transport !== null
  }

  private clear(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.queue = []
  }

  private schedule(): void {
    if (this.timer !== null || this.inFlight || !this.queue.length || !this.active()) return
    this.timer = setTimeout(() => { this.timer = null; void this.send() },
      Math.max(VOICE_DIAGNOSTICS_INTERVAL_MS, this.nextSend - Date.now()))
  }

  private async send(): Promise<void> {
    if (!this.active() || !this.transport || !this.queue.length || this.inFlight) return
    const transport = this.transport
    const generation = this.generation
    const profile = transport.connection.profile || 'default'
    const entries = this.queue.splice(0, VOICE_DIAGNOSTICS_MAX_ENTRIES)
    this.inFlight = true
    this.nextSend = Date.now() + VOICE_DIAGNOSTICS_INTERVAL_MS
    try {
      // Plugin routes are host-owned by default, so supply the selected profile explicitly.
      await transport.requestJson(`${VOICE_DIAGNOSTICS_ENDPOINT}?profile=${encodeURIComponent(profile)}`,
        { schema: 1, optIn: true, transport: transport.kind, ...(this.build ? { build: this.build } : {}), entries },
        { method: 'POST', timeoutMs: 5000 })
    } catch {
      // Includes old-host 404, auth failures, rate limits and temporary disconnection.
      // Never log error bodies or make a failed diagnostics request disrupt voice.
      if (generation === this.generation) { this.disabled = true; this.clear() }
    } finally {
      this.inFlight = false
      this.schedule()
    }
  }
}
