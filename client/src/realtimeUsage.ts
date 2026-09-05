// Portable mirror: Desktop pet/realtime-usage.ts and Mobile realtimeUsage.ts.
// Rate card verified 2026-09-04: https://developers.openai.com/api/docs/pricing
// Response-only estimate. Input transcription and external tools are separate bills.
export const REALTIME_PRICE_DATE = '2026-09-04'
type Modality = 'text' | 'audio' | 'image'
interface Rate { input: number; cached: number; output: number }
type Rates = Record<Modality, Rate>
const full: Rates = {
  text: { input: 4, cached: 0.4, output: 16 },
  audio: { input: 32, cached: 0.4, output: 64 },
  image: { input: 5, cached: 0.5, output: 0 }
}
const mini: Rates = {
  text: { input: 0.6, cached: 0.06, output: 2.4 },
  audio: { input: 10, cached: 0.3, output: 20 },
  image: { input: 0.8, cached: 0.08, output: 0 }
}
const second: Rates = { ...full, text: { ...full.text, output: 24 } }
const rates: Record<string, Rates> = {
  'gpt-realtime': full, 'gpt-realtime-1.5': full,
  'gpt-realtime-2': second, 'gpt-realtime-2.1': second,
  'gpt-realtime-mini': mini, 'gpt-realtime-2.1-mini': mini
}
export interface RealtimeBilling {
  model: string
  input: number
  output: number
  total: number
  cached: number
  usd: number
  pricedResponses: number
  unpricedResponses: number
  transcriptions: number
}
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null

/** Per user-started call, retained across reconnects/targets. Never reads content. */
export class RealtimeUsageMeter {
  private seen = new Set<string>()
  private state: RealtimeBilling = {
    model: '', input: 0, output: 0, total: 0, cached: 0, usd: 0,
    pricedResponses: 0, unpricedResponses: 0, transcriptions: 0
  }
  get snapshot(): RealtimeBilling { return { ...this.state } }
  setModel(model: string): void { this.state = { ...this.state, model } }
  accept(raw: unknown): boolean {
    const event = object(raw)
    if (event.type === 'session.created' || event.type === 'session.updated') {
      const model = object(event.session).model
      if (typeof model === 'string') this.setModel(model)
      return false
    }
    const transcription = event.type === 'conversation.item.input_audio_transcription.completed'
    if (!transcription && event.type !== 'response.done') return false
    const response = object(event.response)
    const id = transcription ? event.item_id : response.id
    // Missing IDs cannot be safely deduplicated; one explicit coverage gap.
    const key = typeof id === 'string' && id ? `${event.type}:${id}` : `${event.type}:missing-id`
    if (this.seen.has(key)) return false
    this.seen.add(key)
    if (transcription) {
      this.state = { ...this.state, transcriptions: this.state.transcriptions + 1 }
      return true
    }
    const usage = object(response.usage)
    const input = count(usage.input_tokens)
    const output = count(usage.output_tokens)
    const details = object(usage.input_token_details)
    const cached = count(details.cached_tokens)
    const cachedDetails = object(details.cached_tokens_details)
    const outputDetails = object(usage.output_token_details)
    const model = typeof response.model === 'string' ? response.model : this.state.model
    const rate = rates[model]
    let cost = 0
    let valid = Boolean(rate && typeof id === 'string' && id && input !== null && output !== null && cached !== null)
    let inSum = 0, outSum = 0, cacheSum = 0
    for (const modality of ['text', 'audio', 'image'] as const) {
      const tokenKey = `${modality}_tokens`
      // Image is optional for audio-only sessions. Text/audio detail is required.
      const n = count(details[tokenKey]) ?? (modality === 'image' ? 0 : null)
      const o = modality === 'image' ? (count(outputDetails[tokenKey]) ?? 0) : count(outputDetails[tokenKey])
      const c = count(cachedDetails[tokenKey]) ?? (cached === 0 || modality === 'image' ? 0 : null)
      if (n === null || o === null || c === null || c > n || (modality === 'image' && o > 0)) {
        valid = false
        continue
      }
      inSum += n; outSum += o; cacheSum += c
      if (rate) cost += ((n - c) * rate[modality].input + c * rate[modality].cached + o * rate[modality].output) / 1_000_000
    }
    valid = valid && inSum === input && outSum === output && cacheSum === cached
    this.state = {
      ...this.state, model,
      input: this.state.input + (input ?? 0),
      output: this.state.output + (output ?? 0),
      total: this.state.total + ((input ?? 0) + (output ?? 0)),
      cached: this.state.cached + (cached ?? 0),
      usd: this.state.usd + (valid ? cost : 0),
      pricedResponses: this.state.pricedResponses + (valid ? 1 : 0),
      unpricedResponses: this.state.unpricedResponses + (valid ? 0 : 1)
    }
    return true
  }
}
