import { useEffect, useState } from 'react'
import type { JsonRpcGatewayClient } from '../protocol/json-rpc-client'
import { contextMeterValues, type ContextSnapshot } from '../context-meter'

export function ContextMeter({ gateway, sessionId, active }: {
  gateway: JsonRpcGatewayClient | null
  sessionId: string
  active: boolean
}) {
  const [snapshot, setSnapshot] = useState<ContextSnapshot | null>(null)
  useEffect(() => {
    setSnapshot(null)
    if (!active || !gateway || !sessionId) return
    let disposed = false
    let pending = false
    let dirty = false
    let revision = 0
    let compacting = false
    let compressions = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const refresh = async () => {
      if (pending || disposed || compacting) { dirty = true; return }
      pending = true
      const requestedRevision = revision
      try {
        const value = await gateway.request<ContextSnapshot>('session.context_breakdown', { session_id: sessionId })
        if (!disposed && requestedRevision === revision) setSnapshot(value)
      } catch {
        if (!disposed) setSnapshot(null)
      } finally {
        pending = false
        if (dirty && !disposed && !timer) {
          dirty = false
          timer = setTimeout(() => { timer = null; void refresh() }, 2000)
        }
      }
    }
    const remove = gateway.onEvent(event => {
      if (event.session_id !== sessionId || !['session.info', 'session.usage', 'message.complete', 'status.update', 'error'].includes(event.type)) return
      if (event.type === 'status.update' && event.payload.kind !== 'compacting') return
      const usage = event.payload.usage as { compressions?: number } | undefined
      const compressed = typeof usage?.compressions === 'number' && usage.compressions > compressions
      if (typeof usage?.compressions === 'number') compressions = usage.compressions
      if (event.type === 'status.update' || compressed || event.type === 'session.info') {
        revision += 1
        setSnapshot(null)
      }
      if (event.type === 'status.update') compacting = true
      else if (compressed || ['session.info', 'message.complete', 'error'].includes(event.type)) compacting = false
      dirty = pending
      if (compacting) return
      if (!timer) timer = setTimeout(() => { timer = null; void refresh() }, 2000)
    })
    void refresh()
    return () => { disposed = true; remove(); if (timer) clearTimeout(timer) }
  }, [active, gateway, sessionId])
  const values = contextMeterValues(snapshot)
  const count = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)
  if (!sessionId) return null
  return <details className="context-meter">
    <summary aria-label={values ? `Context ${values.percent}% used. ${count(values.remaining)} tokens remaining.` : 'Context usage unavailable'}>
      {values ? <ContextRing used={values.used} maximum={values.maximum} threshold={values.threshold} /> : <ContextRing used={0} maximum={1} threshold={null} empty />}
      {values && <span className="context-meter-percent">{values.estimated ? '~' : ''}{values.percent}%</span>}
    </summary>
    <div className="context-meter-detail">
      {values ? <><strong>Context {values.estimated ? '(estimated)' : ''}</strong>
        <span>{count(values.used)} used / {count(values.maximum)} total</span>
        <span>{count(values.remaining)} tokens remaining</span>
        <span>{values.threshold !== null ? `Compression at ${count(values.threshold)} tokens (${Math.round(values.threshold / values.maximum * 100)}%)` : 'Compression threshold unavailable on this host'}</span>
      </> : <span>Waiting for the selected session's context measurement.</span>}
    </div>
  </details>
}

// A 16px ring, Desktop-style: a track, the consumed arc filled from 12
// o'clock, and a tick where compression kicks in. Past the threshold the arc
// switches to the warning colour so "about to compact" reads at a glance.
function ContextRing({ used, maximum, threshold, empty = false }: {
  used: number
  maximum: number
  threshold: number | null
  empty?: boolean
}) {
  const radius = 6.25
  const circumference = 2 * Math.PI * radius
  const fraction = maximum > 0 ? Math.min(1, Math.max(0, used / maximum)) : 0
  const thresholdFraction = threshold !== null && maximum > 0 ? Math.min(1, threshold / maximum) : null
  const over = thresholdFraction !== null && fraction >= thresholdFraction
  const angle = thresholdFraction !== null ? thresholdFraction * 2 * Math.PI - Math.PI / 2 : 0
  return (
    <svg aria-hidden="true" className={`context-ring${over ? ' over' : ''}${empty ? ' empty' : ''}`} height="16" viewBox="0 0 16 16" width="16">
      <circle className="context-ring-track" cx="8" cy="8" r={radius} />
      {!empty && fraction > 0 && (
        <circle
          className="context-ring-fill"
          cx="8"
          cy="8"
          r={radius}
          strokeDasharray={`${fraction * circumference} ${circumference}`}
          transform="rotate(-90 8 8)"
        />
      )}
      {thresholdFraction !== null && (
        <line
          className="context-ring-threshold"
          data-threshold={`${Math.round(thresholdFraction * 100)}%`}
          x1={8 + Math.cos(angle) * 4.25}
          x2={8 + Math.cos(angle) * 8}
          y1={8 + Math.sin(angle) * 4.25}
          y2={8 + Math.sin(angle) * 8}
        />
      )}
    </svg>
  )
}
