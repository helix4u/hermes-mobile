export interface ProviderEnvInfo {
  advanced: boolean
  category: string
  channel_managed?: boolean
  description: string
  is_password: boolean
  is_set: boolean
  provider?: string
  provider_label?: string
  redacted_value: null | string
  tools: string[]
  url: null | string
}

export interface ProviderCredential {
  info: ProviderEnvInfo
  key: string
}

export interface ProviderCredentialGroup {
  credentials: ProviderCredential[]
  id: string
  label: string
}

export interface OAuthProviderStatus {
  error?: string
  logged_in: boolean
  source_label?: null | string
  token_preview?: null | string
}

export interface OAuthProvider {
  cli_command: string
  disconnect_command?: null | string
  disconnect_hint?: null | string
  disconnectable?: boolean
  docs_url: string
  flow: 'device_code' | 'external' | 'pkce'
  id: string
  name: string
  status: OAuthProviderStatus
}

export interface OAuthProvidersResponse {
  providers: OAuthProvider[]
}

export type OAuthStartResponse =
  | {
      auth_url: string
      expires_in: number
      flow: 'pkce'
      session_id: string
    }
  | {
      expires_in: number
      flow: 'device_code'
      poll_interval: number
      session_id: string
      user_code: string
      verification_url: string
    }

export interface OAuthPollResponse {
  error_message?: null | string
  session_id: string
  status: 'approved' | 'denied' | 'error' | 'expired' | 'pending'
}

export function profileApiPath(path: string, profile: string): string {
  const value = profile.trim()
  if (!value || value === 'default') return path
  return `${path}${path.includes('?') ? '&' : '?'}profile=${encodeURIComponent(value)}`
}

export function providerCredentialGroups(
  vars: Record<string, ProviderEnvInfo>,
): ProviderCredentialGroup[] {
  const groups = new Map<string, ProviderCredentialGroup>()
  for (const [key, info] of Object.entries(vars)) {
    if (info.category !== 'provider' || info.channel_managed) continue
    const id = info.provider?.trim() || key.split('_', 1)[0].toLowerCase()
    const label =
      info.provider_label?.trim() ||
      info.provider?.trim() ||
      key.replace(/_(?:API_)?KEY$|_TOKEN$/i, '').replaceAll('_', ' ')
    const current = groups.get(id) ?? { credentials: [], id, label }
    current.credentials.push({ info, key })
    groups.set(id, current)
  }

  return [...groups.values()]
    .map(group => ({
      ...group,
      credentials: group.credentials.sort(
        (a, b) =>
          Number(a.info.advanced) - Number(b.info.advanced) ||
          a.key.localeCompare(b.key),
      ),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function isMissingProviderSetupError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /(?:404|not found|no such api endpoint|unknown endpoint)/i.test(message)
}
