import type { GatewayEvent } from './protocol/types'

export interface PetCommentaryPresentation {
  eventId: string
  source: 'generated' | 'interaction'
  text: string
}

export function petCommentaryPresentation(
  event: GatewayEvent,
): PetCommentaryPresentation | null {
  if (event.type !== 'pet.commentary.recorded') return null
  const payload =
    event.payload && typeof event.payload === 'object'
      ? (event.payload as Record<string, unknown>)
      : {}
  const eventId = String(payload.commentary_id ?? payload.id ?? '').trim()
  const text = String(payload.text ?? '').trim()
  const metadata =
    payload.display_metadata && typeof payload.display_metadata === 'object'
      ? (payload.display_metadata as Record<string, unknown>)
      : {}

  if (!eventId || !text) return null

  return {
    eventId,
    source:
      String(metadata.source ?? '') === 'interaction'
        ? 'interaction'
        : 'generated',
    text,
  }
}

export function claimPetCommentaryPresentation(
  current: string[],
  eventId: string,
  maxEntries = 128,
): { accepted: boolean; ids: string[] } {
  const clean = eventId.trim()
  if (!clean || current.includes(clean)) {
    return { accepted: false, ids: current }
  }

  const limit = Math.max(1, Math.round(maxEntries))
  return {
    accepted: true,
    ids: [...current.slice(-(limit - 1)), clean],
  }
}
