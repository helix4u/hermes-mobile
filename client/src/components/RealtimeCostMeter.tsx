import { REALTIME_PRICE_DATE, type RealtimeBilling } from '../realtimeUsage'

export function RealtimeCostMeter({ usage }: { usage: RealtimeBilling }) {
  return (
    <details className="pet-realtime-meter">
      <summary>
        Voice response estimate: {usage.pricedResponses ? `$${usage.usd.toFixed(4)} USD` : usage.unpricedResponses ? 'Pricing unavailable' : 'Awaiting usage'}
        {usage.unpricedResponses > 0 && ' (partial)'}
      </summary>
      <small>This call, across reconnects and targets. Response cost only; transcription and tools/agent work are extra. Rates checked {REALTIME_PRICE_DATE}. {usage.model}</small>
      <small>Provider tokens, not context size. Input / output / cached input: {usage.input.toLocaleString()} / {usage.output.toLocaleString()} / {usage.cached.toLocaleString()}</small>
      <small>Responses without complete pricing: {usage.unpricedResponses}. Transcription events (not priced here): {usage.transcriptions}.</small>
    </details>
  )
}
