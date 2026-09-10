import type { LiveSessionSummary } from './protocol/types'
import type { BrowserConnection } from './transport/browser-transport'

export interface HermesProfile {
  name: string
  display_name?: string
  description?: string
  model?: string
  provider?: string
}

/** Local UI state is an island per host and profile. Never use this as a credential ID. */
export function profileStateKey(connection: Pick<BrowserConnection, 'id' | 'profile'>): string {
  return JSON.stringify([connection.id, connection.profile || 'default'])
}

/** Upgrade the last saved connection's UI state once, without deleting legacy recovery data. */
export function migrateProfileState(connection: Pick<BrowserConnection, 'id' | 'profile'>, storage: Storage): void {
  const marker = `hermes-mobile.profile-state.v1.${connection.id}`
  if (storage.getItem(marker)) return
  const scoped = profileStateKey(connection)
  for (const [prefix, suffix] of [
    ['hermes-mobile.session.', '.selected'],
    ['hermes-mobile.workspace.', '.cwd'],
    ['hermes-mobile.draft.v1.', ''],
    ['hermes-mobile.pet.v1.', ''],
    ['hermes-mobile.pet-personalities.v1.', ''],
    ['hermes-mobile.reader.', '.draft'],
    ['hermes-mobile.reader.', '.assignments'],
    ['hermes-mobile.reader.', '.providers'],
    ['hermes-mobile.reader.', '.buffer-ahead'],
    ['hermes-mobile.reader.', '.synthesis-concurrency'],
  ]) {
    const source = storage.getItem(`${prefix}${connection.id}${suffix}`)
    const target = `${prefix}${scoped}${suffix}`
    if (source !== null && storage.getItem(target) === null) storage.setItem(target, source)
  }
  storage.setItem(marker, '1')
}

export function scopedRpcParams(profile: string, params: Record<string, unknown>): Record<string, unknown> {
  const selected = profile || 'default'
  if (params.profile && params.profile !== selected) {
    throw new Error('This request belongs to a different profile. Switch profiles first.')
  }
  return { ...params, profile: selected }
}

export function verifyProfileResult(profile: string, method: string, result: unknown): unknown {
  if (!['session.create', 'session.resume', 'session.activate'].includes(method)) return result
  const response = result as { info?: { profile_name?: string } } | null
  if (response?.info?.profile_name !== (profile || 'default')) {
    throw new Error('The host did not confirm the selected session profile. No message was sent. Update the host or choose the correct connection.')
  }
  return result
}

export function assertHttpProfile(path: string, profile: string, body?: Record<string, unknown>): void {
  if (['/api/config', '/api/env'].includes(path.split('?')[0]) && body?.profile && body.profile !== (profile || 'default')) {
    throw new Error('This request body belongs to a different profile. Switch profiles first.')
  }
}

/** Core REST profile selectors are query parameters. Host/plugin routes retain host ownership. */
export function scopedHttpPath(path: string, profile: string): string {
  if (path.split('?')[0] === '/api/fs/default-cwd' && profile !== 'default') {
    throw new Error('Choose a session workspace. This host does not expose a profile-scoped default directory.')
  }
  if (!/^\/api\/(config(?:[/?]|$)|env(?:[/?]|$)|sessions(?:[/?]|$)|cron\/|models?(?:[/?]|$)|providers(?:[/?]|$)|audio\/)/.test(path)) return path
  const url = new URL(path, 'https://hermes.invalid')
  const selected = profile || 'default'
  const requested = url.searchParams.get('profile')
  if (requested && requested !== selected) throw new Error('This request belongs to a different profile. Switch profiles first.')
  url.searchParams.set('profile', selected)
  return `${url.pathname}${url.search}`
}

/** Legacy active_list has no profile identity. Only a locally verified runtime is safe. */
export function profileLiveSessions(rows: LiveSessionSummary[], profile: string, ownedRuntimeId: string): LiveSessionSummary[] {
  return rows.filter(row => {
    const owner = (row as LiveSessionSummary & { profile_name?: string; profile?: string }).profile_name
      ?? (row as LiveSessionSummary & { profile?: string }).profile
    return owner ? owner === profile : row.id === ownedRuntimeId
  })
}

/** Older native notifications omit profile. Only the already verified runtime can prove ownership. */
export function canOpenProfileNotification(target: { connectionId: string; runtimeSessionId: string; profile?: string },
  currentConnectionId: string, ownedRuntimeId: string): boolean {
  return !!target.profile?.trim() || (target.connectionId === currentConnectionId && !!ownedRuntimeId && target.runtimeSessionId === ownedRuntimeId)
}
