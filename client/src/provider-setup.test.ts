import { describe, expect, test } from 'vitest'
import {
  isMissingProviderSetupError,
  profileApiPath,
  providerCredentialGroups,
  type ProviderEnvInfo,
} from './provider-setup'

const info = (
  patch: Partial<ProviderEnvInfo> = {},
): ProviderEnvInfo => ({
  advanced: false,
  category: 'provider',
  description: 'Provider credential',
  is_password: true,
  is_set: false,
  redacted_value: null,
  tools: [],
  url: null,
  ...patch,
})

describe('provider setup helpers', () => {
  test('groups provider credentials while excluding non-provider and channel-owned secrets', () => {
    const groups = providerCredentialGroups({
      OPENAI_API_KEY: info({
        provider: 'openai',
        provider_label: 'OpenAI',
      }),
      OPENAI_BASE_URL: info({
        advanced: true,
        is_password: false,
        provider: 'openai',
        provider_label: 'OpenAI',
      }),
      DISCORD_BOT_TOKEN: info({
        category: 'messaging',
      }),
      TELEGRAM_BOT_TOKEN: info({
        channel_managed: true,
        provider: 'telegram',
      }),
    })

    expect(groups).toEqual([
      {
        credentials: [
          expect.objectContaining({ key: 'OPENAI_API_KEY' }),
          expect.objectContaining({ key: 'OPENAI_BASE_URL' }),
        ],
        id: 'openai',
        label: 'OpenAI',
      },
    ])
  })

  test('scopes provider APIs to non-default profiles', () => {
    expect(profileApiPath('/api/env', 'default')).toBe('/api/env')
    expect(profileApiPath('/api/env', 'coding profile')).toBe(
      '/api/env?profile=coding%20profile',
    )
  })

  test('recognizes older hosts that do not expose provider setup', () => {
    expect(
      isMissingProviderSetupError(
        new Error('No such API endpoint: /api/providers/oauth'),
      ),
    ).toBe(true)
    expect(isMissingProviderSetupError(new Error('Unauthorized'))).toBe(false)
  })
})
