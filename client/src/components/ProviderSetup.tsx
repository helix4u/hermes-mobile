import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  HermesNative,
  isNativeHermesClient,
} from '../transport/native-bridge'
import type { HermesTransport } from '../transport/hermes-transport'
import {
  isMissingProviderSetupError,
  profileApiPath,
  providerCredentialGroups,
  type OAuthPollResponse,
  type OAuthProvider,
  type OAuthProvidersResponse,
  type OAuthStartResponse,
  type ProviderEnvInfo,
} from '../provider-setup'

interface ProviderSetupProps {
  connected: boolean
  profile: string
  transport: HermesTransport | null
  onNotice: (message: string) => void
}

interface ActiveOAuth {
  provider: OAuthProvider
  sessionId?: string
  authUrl?: string
  verificationUrl?: string
  userCode?: string
  pollInterval?: number
}

interface ValidationResponse {
  message?: string
  ok: boolean
  reachable?: boolean
}

async function openExternalUrl(url: string): Promise<void> {
  if (isNativeHermesClient()) {
    await HermesNative.openExternalUrl({ url })
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function ProviderSetup({
  connected,
  onNotice,
  profile,
  transport,
}: ProviderSetupProps) {
  const [envVars, setEnvVars] = useState<Record<string, ProviderEnvInfo>>({})
  const [oauthProviders, setOAuthProviders] = useState<OAuthProvider[]>([])
  const [secretValues, setSecretValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [envSupported, setEnvSupported] = useState(true)
  const [oauthSupported, setOAuthSupported] = useState(true)
  const [activeOAuth, setActiveOAuth] = useState<ActiveOAuth | null>(null)
  const [oauthCode, setOAuthCode] = useState('')

  const groups = useMemo(() => providerCredentialGroups(envVars), [envVars])
  const path = useCallback(
    (value: string) => profileApiPath(value, profile),
    [profile],
  )

  const load = useCallback(async () => {
    if (!connected || !transport) {
      setEnvVars({})
      setOAuthProviders([])
      return
    }
    setError('')
    const [envResult, oauthResult] = await Promise.allSettled([
      transport.requestJson<Record<string, ProviderEnvInfo>>(path('/api/env')),
      transport.requestJson<OAuthProvidersResponse>(
        path('/api/providers/oauth'),
      ),
    ])

    if (envResult.status === 'fulfilled') {
      setEnvVars(envResult.value)
      setEnvSupported(true)
    } else {
      setEnvVars({})
      setEnvSupported(!isMissingProviderSetupError(envResult.reason))
      if (!isMissingProviderSetupError(envResult.reason)) {
        setError(
          envResult.reason instanceof Error
            ? envResult.reason.message
            : String(envResult.reason),
        )
      }
    }

    if (oauthResult.status === 'fulfilled') {
      setOAuthProviders(oauthResult.value.providers ?? [])
      setOAuthSupported(true)
    } else {
      setOAuthProviders([])
      setOAuthSupported(!isMissingProviderSetupError(oauthResult.reason))
      if (
        !isMissingProviderSetupError(oauthResult.reason) &&
        envResult.status === 'fulfilled'
      ) {
        setError(
          oauthResult.reason instanceof Error
            ? oauthResult.reason.message
            : String(oauthResult.reason),
        )
      }
    }
  }, [connected, path, transport])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!activeOAuth?.sessionId || !activeOAuth.pollInterval || !transport) {
      return
    }
    let disposed = false
    const timer = window.setInterval(async () => {
      try {
        const result = await transport.requestJson<OAuthPollResponse>(
          path(
            `/api/providers/oauth/${encodeURIComponent(
              activeOAuth.provider.id,
            )}/poll/${encodeURIComponent(activeOAuth.sessionId ?? '')}`,
          ),
        )
        if (disposed || result.status === 'pending') return
        window.clearInterval(timer)
        if (result.status === 'approved') {
          setActiveOAuth(null)
          onNotice(`${activeOAuth.provider.name} connected`)
          await load()
          return
        }
        setError(
          result.error_message ||
            `${activeOAuth.provider.name} sign-in ${result.status}`,
        )
      } catch (pollError) {
        if (!disposed) {
          setError(
            pollError instanceof Error ? pollError.message : String(pollError),
          )
        }
      }
    }, Math.max(2, activeOAuth.pollInterval) * 1000)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [activeOAuth, load, onNotice, path, transport])

  const saveCredential = async (key: string) => {
    if (!transport) return
    const value = secretValues[key]?.trim() ?? ''
    if (!value) {
      setError(`Enter a value for ${key}`)
      return
    }
    setBusy(`env:${key}`)
    setError('')
    try {
      try {
        const validation = await transport.requestJson<ValidationResponse>(
          path('/api/providers/validate'),
          { api_key: '', key, value },
        )
        if (!validation.ok) {
          throw new Error(validation.message || `${key} was not accepted`)
        }
      } catch (validationError) {
        if (!isMissingProviderSetupError(validationError)) {
          throw validationError
        }
      }
      await transport.requestJson(
        path('/api/env'),
        { key, value },
        { method: 'PUT' },
      )
      setSecretValues(current => ({ ...current, [key]: '' }))
      onNotice(`${key} saved on this Hermes host`)
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setBusy('')
    }
  }

  const removeCredential = async (key: string) => {
    if (!transport) return
    setBusy(`env:${key}`)
    setError('')
    try {
      await transport.requestJson(
        path('/api/env'),
        { key },
        { method: 'DELETE' },
      )
      setSecretValues(current => ({ ...current, [key]: '' }))
      onNotice(`${key} removed from this Hermes host`)
      await load()
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : String(removeError),
      )
    } finally {
      setBusy('')
    }
  }

  const startOAuth = async (provider: OAuthProvider) => {
    if (!transport) return
    setBusy(`oauth:${provider.id}`)
    setError('')
    setOAuthCode('')
    try {
      if (provider.flow === 'external') {
        setActiveOAuth({ provider })
        return
      }
      const result = await transport.requestJson<OAuthStartResponse>(
        path(`/api/providers/oauth/${encodeURIComponent(provider.id)}/start`),
        {},
      )
      if (result.flow === 'device_code') {
        setActiveOAuth({
          provider,
          sessionId: result.session_id,
          verificationUrl: result.verification_url,
          userCode: result.user_code,
          pollInterval: result.poll_interval,
        })
        await openExternalUrl(result.verification_url)
      } else {
        setActiveOAuth({
          provider,
          sessionId: result.session_id,
          authUrl: result.auth_url,
        })
        await openExternalUrl(result.auth_url)
      }
    } catch (oauthError) {
      setError(
        oauthError instanceof Error ? oauthError.message : String(oauthError),
      )
    } finally {
      setBusy('')
    }
  }

  const submitOAuthCode = async () => {
    if (!transport || !activeOAuth?.sessionId || !oauthCode.trim()) return
    setBusy(`oauth:${activeOAuth.provider.id}`)
    setError('')
    try {
      await transport.requestJson(
        path(
          `/api/providers/oauth/${encodeURIComponent(
            activeOAuth.provider.id,
          )}/submit`,
        ),
        { code: oauthCode.trim(), session_id: activeOAuth.sessionId },
      )
      onNotice(`${activeOAuth.provider.name} connected`)
      setActiveOAuth(null)
      setOAuthCode('')
      await load()
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : String(submitError),
      )
    } finally {
      setBusy('')
    }
  }

  const disconnectOAuth = async (provider: OAuthProvider) => {
    if (!transport) return
    setBusy(`oauth:${provider.id}`)
    setError('')
    try {
      await transport.requestJson(
        path(`/api/providers/oauth/${encodeURIComponent(provider.id)}`),
        undefined,
        { method: 'DELETE' },
      )
      onNotice(`${provider.name} disconnected`)
      await load()
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : String(disconnectError),
      )
    } finally {
      setBusy('')
    }
  }

  const closeOAuth = async () => {
    const sessionId = activeOAuth?.sessionId
    setActiveOAuth(null)
    setOAuthCode('')
    if (!sessionId || !transport) return
    try {
      await transport.requestJson(
        path(
          `/api/providers/oauth/sessions/${encodeURIComponent(sessionId)}`,
        ),
        undefined,
        { method: 'DELETE' },
      )
    } catch {
      // Closing the local flow is still authoritative. Server sessions expire.
    }
  }

  const copyText = async (value: string, notice: string) => {
    try {
      await navigator.clipboard.writeText(value)
      onNotice(notice)
    } catch {
      setError('Could not copy to the clipboard')
    }
  }

  if (!connected || !transport) {
    return <p className="advanced-copy">Connect to a Hermes host to manage providers.</p>
  }

  if (!envSupported && !oauthSupported) {
    return (
      <p className="advanced-copy">
        This Hermes host does not expose provider setup. Update the host to use
        API keys and account sign-in from Mobile.
      </p>
    )
  }

  return (
    <div className="provider-setup">
      {error && <p className="inline-error">{error}</p>}

      {oauthSupported && oauthProviders.length > 0 && (
        <section className="provider-setup-group">
          <div>
            <strong>Account sign-in</strong>
            <small>OAuth sessions and account-backed providers</small>
          </div>
          {oauthProviders.map(provider => {
            const connectedProvider = provider.status?.logged_in
            return (
              <div className="provider-setup-card" key={provider.id}>
                <div className="provider-setup-title">
                  <span>
                    <strong>{provider.name}</strong>
                    <small>
                      {connectedProvider
                        ? provider.status.source_label || 'Connected'
                        : provider.flow === 'external'
                          ? 'Hermes CLI sign-in'
                          : `${provider.flow.replace('_', ' ')} sign-in`}
                    </small>
                  </span>
                  <span className={`state-chip ${connectedProvider ? 'ok' : ''}`}>
                    {connectedProvider ? 'Connected' : 'Not connected'}
                  </span>
                </div>
                <div className="provider-setup-actions">
                  <button
                    className="quiet-button"
                    disabled={busy === `oauth:${provider.id}`}
                    type="button"
                    onClick={() => void startOAuth(provider)}
                  >
                    {connectedProvider ? 'Sign in again' : 'Connect'}
                  </button>
                  {connectedProvider &&
                    (provider.disconnectable ?? provider.flow !== 'external') && (
                      <button
                        className="quiet-button danger"
                        disabled={busy === `oauth:${provider.id}`}
                        type="button"
                        onClick={() => void disconnectOAuth(provider)}
                      >
                        Disconnect
                      </button>
                    )}
                </div>
              </div>
            )
          })}
        </section>
      )}

      {activeOAuth && (
        <div className="provider-oauth-flow">
          <div>
            <strong>{activeOAuth.provider.name}</strong>
            <small>
              {activeOAuth.provider.flow === 'external'
                ? 'Run this verified Hermes command on the connected host.'
                : activeOAuth.userCode
                  ? 'Finish sign-in in the opened browser. Mobile will check automatically.'
                  : 'Finish sign-in in the opened browser, then paste the returned code.'}
            </small>
          </div>
          {activeOAuth.userCode && (
            <button
              className="oauth-code"
              type="button"
              onClick={() =>
                void copyText(activeOAuth.userCode ?? '', 'Sign-in code copied')
              }
            >
              {activeOAuth.userCode}
            </button>
          )}
          {activeOAuth.provider.flow === 'external' && (
            <button
              className="oauth-command"
              type="button"
              onClick={() =>
                void copyText(
                  activeOAuth.provider.cli_command,
                  'Hermes sign-in command copied',
                )
              }
            >
              {activeOAuth.provider.cli_command}
            </button>
          )}
          {activeOAuth.authUrl && (
            <label>
              Returned authorization code
              <input
                autoCapitalize="none"
                autoComplete="off"
                value={oauthCode}
                onChange={event => setOAuthCode(event.target.value)}
              />
            </label>
          )}
          <div className="provider-setup-actions">
            {(activeOAuth.authUrl || activeOAuth.verificationUrl) && (
              <button
                className="quiet-button"
                type="button"
                onClick={() =>
                  void openExternalUrl(
                    activeOAuth.authUrl ??
                      activeOAuth.verificationUrl ??
                      '',
                  )
                }
              >
                Open sign-in
              </button>
            )}
            {activeOAuth.authUrl && (
              <button
                className="primary-button"
                disabled={!oauthCode.trim() || Boolean(busy)}
                type="button"
                onClick={() => void submitOAuthCode()}
              >
                Finish sign-in
              </button>
            )}
            <button
              className="quiet-button"
              type="button"
              onClick={() => void closeOAuth()}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {envSupported && groups.length > 0 && (
        <section className="provider-setup-group">
          <div>
            <strong>API credentials</strong>
            <small>Saved only in this Hermes profile, never in Mobile storage</small>
          </div>
          {groups.map(group => (
            <details className="provider-credential-card" key={group.id}>
              <summary>
                <span>
                  <strong>{group.label}</strong>
                  <small>
                    {group.credentials.some(row => row.info.is_set)
                      ? 'Configured'
                      : 'Not configured'}
                  </small>
                </span>
                <span className="disclosure-glyph">+</span>
              </summary>
              <div>
                {group.credentials.map(({ info, key }) => (
                  <div className="provider-credential-row" key={key}>
                    <label>
                      <span>{key}</span>
                      <input
                        autoCapitalize="none"
                        autoComplete="off"
                        placeholder={
                          info.is_set
                            ? info.redacted_value || 'Configured'
                            : info.description
                        }
                        type={info.is_password ? 'password' : 'text'}
                        value={secretValues[key] ?? ''}
                        onChange={event =>
                          setSecretValues(current => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <small>{info.description}</small>
                    <div className="provider-setup-actions">
                      <button
                        className="primary-button"
                        disabled={busy === `env:${key}`}
                        type="button"
                        onClick={() => void saveCredential(key)}
                      >
                        {info.is_set ? 'Replace' : 'Save'}
                      </button>
                      {info.is_set && (
                        <button
                          className="quiet-button danger"
                          disabled={busy === `env:${key}`}
                          type="button"
                          onClick={() => void removeCredential(key)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </section>
      )}

      <button className="quiet-button" type="button" onClick={() => void load()}>
        Refresh provider status
      </button>
    </div>
  )
}
