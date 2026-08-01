import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useEmbedPreferences } from '../embeds'
import type { JsonRpcGatewayClient } from '../protocol/json-rpc-client'
import type { VoiceSelection } from '../reader'
import type {
  MobilePetInfo,
  PetHostCapabilities,
  PetPersonalityData,
  PetPersonalityOverride,
  PetPersonalitySummary,
  PetPreferences,
  PetSpeechProfile,
} from '../pet'
import { modelConfigValue, nextRunLabel } from '../state/control'
import { MOBILE_THEME_OPTIONS, type MobileThemeSelection } from '../state/theme'
import { formatDisplayValue, redactDisplayValue } from '../state/transcript'
import type { HermesTransport } from '../transport/hermes-transport'
import type { VoicePhase } from '../voice'
import type { WakeWordMode, WakeWordStatus } from '../wake-word'
import { configPatch, HostSettings } from './HostSettings'
import { MobileCompanionSettings } from './MobileCompanionSettings'
import { MobilePluginInstaller } from './MobilePluginInstaller'
import { PetSettings } from './PetSettings'
import { ProviderSetup } from './ProviderSetup'
import { VoiceSettings } from './VoiceSettings'

interface ModelProvider {
  slug: string
  name: string
  models?: string[]
  is_current?: boolean
  warning?: string
}

interface ModelOptions {
  model?: string
  provider?: string
  providers?: ModelProvider[]
}

interface ToolsetRow {
  name: string
  description: string
  tool_count: number
  enabled: boolean
  tools?: string[]
}

interface CronJob {
  job_id: string
  name: string
  prompt_preview?: string
  schedule?: string
  next_run_at?: string | number | null
  last_status?: string | null
  enabled?: boolean
  state?: string
}

interface ControlPanelProps {
  gateway: JsonRpcGatewayClient | null
  connected: boolean
  runtimeSessionId: string
  profile: string
  sessionCwd: string
  preferredWorkspace: string
  activeSkinName: string
  themeSelection: MobileThemeSelection
  autoSpeak: boolean
  wakeWordAvailable: boolean
  wakeWordMode: WakeWordMode
  wakeWordStatus: WakeWordStatus
  transport: HermesTransport | null
  voiceSelection: VoiceSelection
  voicePhase: VoicePhase
  pet: {
    catalog: PetPersonalitySummary[]
    desktopSpeech: PetSpeechProfile | null
    desktopSpeechStatus: 'idle' | 'loading' | 'ready' | 'missing'
    error: string
    hostCapabilities: PetHostCapabilities
    info: MobilePetInfo
    personality: PetPersonalityData | null
    personalityEdited: boolean
    preferences: PetPreferences
    status: 'idle' | 'loading' | 'ready' | 'unavailable'
    onPreferences: (patch: Partial<PetPreferences>) => void
    onPersonalityChange: (patch: Partial<PetPersonalityOverride>) => void
    onPersonalityReset: () => void
    onPreviewVoice: () => void
    onRefreshDesktopSpeech: () => void | Promise<void>
    onTest: () => void | Promise<void>
  }
  onAutoSpeakChange: (enabled: boolean) => void
  onWakeWordModeChange: (mode: WakeWordMode) => void
  onThemeSelectionChange: (selection: MobileThemeSelection) => void
  onNotice: (message: string) => void
  onOpenWorkspace: () => void
  onStopSpeech: () => void
  onToolDetailModeChange: (value: string) => void
  onVoiceSelectionChange: (selection: VoiceSelection) => void
}

interface ConfigValues {
  reasoning: string
  fast: string
  approval: string
  details: string
}

const emptyConfig: ConfigValues = {
  reasoning: 'medium',
  fast: 'normal',
  approval: 'manual',
  details: 'collapsed',
}

function AppearanceSettings({
  activeSkinName,
  onThemeSelectionChange,
  themeSelection,
}: Pick<
  ControlPanelProps,
  'activeSkinName' | 'onThemeSelectionChange' | 'themeSelection'
>) {
  const {
    allowedProviders,
    clearAllowedProviders,
    mode: embedMode,
    setMode: setEmbedMode,
  } = useEmbedPreferences()
  const activeLabel =
    themeSelection === 'host'
      ? `Following ${activeSkinName || 'host'}`
      : MOBILE_THEME_OPTIONS.find(option => option.id === themeSelection)
          ?.label || 'Hermes Mobile'

  return (
    <details className="control-section">
      <summary>
        <span>
          <strong>Appearance</strong>
          <small>{activeLabel}</small>
        </span>
        <span className="disclosure-glyph">+</span>
      </summary>
      <div className="control-body">
        <p className="advanced-copy">
          Appearance is saved only on this phone for this connection. These
          choices never change the Hermes host theme.
        </p>
        <label>
          <span>Mobile appearance</span>
          <select
            value={themeSelection}
            onChange={event =>
              onThemeSelectionChange(event.target.value as MobileThemeSelection)
            }
          >
            {MOBILE_THEME_OPTIONS.map(option => (
              <option key={option.id} value={option.id}>
                {option.label} · {option.description}
              </option>
            ))}
            <option value="host">
              Follow host · {activeSkinName || 'default'}
            </option>
          </select>
        </label>
        <p className="advanced-copy">
          Follow host is read-only. It mirrors the active Hermes skin and live
          skin changes without writing to host configuration.
        </p>
        <label>
          <span>Rich link embeds</span>
          <select
            value={embedMode}
            onChange={event =>
              setEmbedMode(event.target.value as 'always' | 'ask' | 'off')
            }
          >
            <option value="ask">Ask before loading</option>
            <option value="always">Always load</option>
            <option value="off">Plain links only</option>
          </select>
        </label>
        <p className="advanced-copy">
          Like Desktop, third-party players wait for consent by default. This
          preference stays on this device and never changes the host.
        </p>
        {allowedProviders.length > 0 && (
          <button
            className="quiet-button"
            type="button"
            onClick={clearAllowedProviders}
          >
            Reset {allowedProviders.length} allowed{' '}
            {allowedProviders.length === 1 ? 'service' : 'services'}
          </button>
        )}
      </div>
    </details>
  )
}

export function ControlPanel({
  activeSkinName,
  autoSpeak,
  connected,
  gateway,
  onAutoSpeakChange,
  onWakeWordModeChange,
  onNotice,
  onOpenWorkspace,
  onStopSpeech,
  onThemeSelectionChange,
  onToolDetailModeChange,
  onVoiceSelectionChange,
  pet,
  runtimeSessionId,
  profile,
  sessionCwd,
  preferredWorkspace,
  themeSelection,
  transport,
  voiceSelection,
  voicePhase,
  wakeWordAvailable,
  wakeWordMode,
  wakeWordStatus,
}: ControlPanelProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [models, setModels] = useState<ModelOptions>({})
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [persistModel, setPersistModel] = useState(false)
  const [pendingModelConfirm, setPendingModelConfirm] = useState('')
  const [config, setConfig] = useState<ConfigValues>(emptyConfig)
  const [rawConfig, setRawConfig] = useState<unknown>(null)
  const [toolsets, setToolsets] = useState<ToolsetRow[]>([])
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [cronName, setCronName] = useState('')
  const [cronSchedule, setCronSchedule] = useState('')
  const [cronPrompt, setCronPrompt] = useState('')
  const [advancedKey, setAdvancedKey] = useState('')
  const [advancedValue, setAdvancedValue] = useState('')

  const selectedProvider = useMemo(
    () => models.providers?.find(row => row.slug === provider) ?? null,
    [models.providers, provider],
  )

  const request = useCallback(
    async <T,>(method: string, params: Record<string, unknown> = {}) => {
      if (!gateway || !connected) throw new Error('Connect to Hermes first')
      return gateway.request<T>(method, params)
    },
    [connected, gateway],
  )

  const loadModels = useCallback(async () => {
    const result = await request<ModelOptions>('model.options', {
      ...(runtimeSessionId ? { session_id: runtimeSessionId } : {}),
      explicit_only: true,
    })
    setModels(result)
    const initialProvider =
      result.provider ||
      result.providers?.find(row => row.is_current)?.slug ||
      result.providers?.[0]?.slug ||
      ''
    setProvider(current => current || initialProvider)
    setModel(current => current || result.model || '')
  }, [request, runtimeSessionId])

  const loadConfig = useCallback(async () => {
    const params = runtimeSessionId ? { session_id: runtimeSessionId } : {}
    const [reasoning, fast, approval, details] = await Promise.all([
      request<{ value?: string }>('config.get', {
        ...params,
        key: 'reasoning',
      }),
      request<{ value?: string }>('config.get', { ...params, key: 'fast' }),
      request<{ value?: string }>('config.get', {
        key: 'approvals.mode',
      }),
      request<{ value?: string }>('config.get', {
        key: 'details_mode',
      }),
    ])
    const nextDetails = details.value || 'collapsed'
    setConfig({
      reasoning: reasoning.value || 'medium',
      fast: fast.value || 'normal',
      approval: approval.value || 'manual',
      details: nextDetails,
    })
    onToolDetailModeChange(nextDetails)
  }, [onToolDetailModeChange, request, runtimeSessionId])

  const loadToolsets = useCallback(async () => {
    const result = await request<{ toolsets?: ToolsetRow[] }>('tools.list', {
      ...(runtimeSessionId ? { session_id: runtimeSessionId } : {}),
    })
    setToolsets(result.toolsets ?? [])
  }, [request, runtimeSessionId])

  const loadCron = useCallback(async () => {
    const result = await request<{ jobs?: CronJob[] }>('cron.manage', {
      action: 'list',
    })
    setJobs(result.jobs ?? [])
  }, [request])

  const refresh = useCallback(async () => {
    if (!connected) return
    setLoading(true)
    setError('')
    try {
      await Promise.all([
        loadModels(),
        loadConfig(),
        loadToolsets(),
        loadCron(),
      ])
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : String(loadError),
      )
    } finally {
      setLoading(false)
    }
  }, [connected, loadConfig, loadCron, loadModels, loadToolsets])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function applyModel(confirmExpensiveModel = false) {
    if (!provider || !model) return
    setLoading(true)
    setError('')
    try {
      const result = await request<{
        confirm_required?: boolean
        confirm_message?: string
        warning?: string
        value?: string
      }>('config.set', {
        confirm_expensive_model: confirmExpensiveModel,
        key: 'model',
        ...(runtimeSessionId ? { session_id: runtimeSessionId } : {}),
        value: modelConfigValue(
          model,
          provider,
          persistModel,
          Boolean(runtimeSessionId),
        ),
      })
      if (result.confirm_required) {
        setPendingModelConfirm(
          result.confirm_message ||
            result.warning ||
            'This model has unusually high known pricing.',
        )
        return
      }
      setPendingModelConfirm('')
      onNotice(`Model switched to ${result.value || model}`)
      await loadModels()
    } catch (modelError) {
      setError(
        modelError instanceof Error ? modelError.message : String(modelError),
      )
    } finally {
      setLoading(false)
    }
  }

  async function setConfigValue(
    key: string,
    value: string,
    localKey: keyof ConfigValues,
  ) {
    setLoading(true)
    setError('')
    try {
      const sessionScoped = key === 'reasoning' || key === 'fast'
      const result = await request<{ value?: string }>('config.set', {
        key,
        value,
        ...(sessionScoped && runtimeSessionId
          ? { session_id: runtimeSessionId }
          : {}),
      })
      setConfig(current => ({
        ...current,
        [localKey]: result.value || value,
      }))
      if (localKey === 'details') {
        onToolDetailModeChange(result.value || value)
      }
      onNotice(`${key} set to ${result.value || value}`)
    } catch (configError) {
      setError(
        configError instanceof Error
          ? configError.message
          : String(configError),
      )
    } finally {
      setLoading(false)
    }
  }

  async function loadRawConfig() {
    setLoading(true)
    setError('')
    try {
      if (!transport) throw new Error('Connect to Hermes first')
      const query =
        profile && profile !== 'default'
          ? `?profile=${encodeURIComponent(profile)}`
          : ''
      const result = await transport.requestJson<Record<string, unknown>>(
        `/api/config${query}`,
      )
      setRawConfig(redactDisplayValue(result))
    } catch (configError) {
      setError(
        configError instanceof Error
          ? configError.message
          : String(configError),
      )
    } finally {
      setLoading(false)
    }
  }

  async function setAdvancedConfig(event: FormEvent) {
    event.preventDefault()
    const key = advancedKey.trim()
    if (!key || !advancedValue.trim()) return
    setLoading(true)
    setError('')
    try {
      if (!transport) throw new Error('Connect to Hermes first')
      await transport.requestJson(
        '/api/config',
        {
          config: configPatch(key, advancedValue),
          ...(profile && profile !== 'default' ? { profile } : {}),
        },
        { method: 'PUT' },
      )
      onNotice(`${key} set to ${advancedValue}`)
      setAdvancedValue('')
      if (rawConfig !== null) await loadRawConfig()
    } catch (configError) {
      setError(
        configError instanceof Error
          ? configError.message
          : String(configError),
      )
    } finally {
      setLoading(false)
    }
  }

  async function toggleToolset(row: ToolsetRow) {
    setLoading(true)
    setError('')
    try {
      await request('tools.configure', {
        action: row.enabled ? 'disable' : 'enable',
        names: [row.name],
        ...(runtimeSessionId ? { session_id: runtimeSessionId } : {}),
      })
      onNotice(
        `${row.name} ${row.enabled ? 'disabled' : 'enabled'}. The active agent was refreshed.`,
      )
      await loadToolsets()
    } catch (toolError) {
      setError(
        toolError instanceof Error ? toolError.message : String(toolError),
      )
    } finally {
      setLoading(false)
    }
  }

  async function createCron(event: FormEvent) {
    event.preventDefault()
    if (!cronSchedule.trim() || !cronPrompt.trim()) return
    setLoading(true)
    setError('')
    try {
      await request('cron.manage', {
        action: 'add',
        name: cronName.trim(),
        schedule: cronSchedule.trim(),
        prompt: cronPrompt.trim(),
      })
      setCronName('')
      setCronSchedule('')
      setCronPrompt('')
      onNotice('Cron job created')
      await loadCron()
    } catch (cronError) {
      setError(
        cronError instanceof Error ? cronError.message : String(cronError),
      )
    } finally {
      setLoading(false)
    }
  }

  async function cronAction(
    action: 'pause' | 'resume' | 'remove',
    job: CronJob,
  ) {
    setLoading(true)
    setError('')
    try {
      await request('cron.manage', {
        action,
        name: job.job_id,
      })
      onNotice(`${job.name} ${action === 'remove' ? 'removed' : `${action}d`}`)
      await loadCron()
    } catch (cronError) {
      setError(
        cronError instanceof Error ? cronError.message : String(cronError),
      )
    } finally {
      setLoading(false)
    }
  }

  if (!connected) {
    return (
      <div className="control-panel">
        <div className="control-empty">
          <img
            alt="Nous"
            className="brand-glyph"
            src="./nous-sidecar-128.png"
          />
          <h3>Connect to manage this Hermes host.</h3>
          <p>
            Models, settings, tools, and scheduled work live on the selected
            host. Mobile appearance remains available offline.
          </p>
        </div>
        <AppearanceSettings
          activeSkinName={activeSkinName}
          onThemeSelectionChange={onThemeSelectionChange}
          themeSelection={themeSelection}
        />
        <MobileCompanionSettings onNotice={onNotice} />
        <PetSettings
          catalog={pet.catalog}
          desktopSpeech={pet.desktopSpeech}
          desktopSpeechStatus={pet.desktopSpeechStatus}
          error={pet.error}
          gateway={gateway}
          hostCapabilities={pet.hostCapabilities}
          info={pet.info}
          personality={pet.personality}
          personalityEdited={pet.personalityEdited}
          preferences={pet.preferences}
          profile={profile}
          status={pet.status}
          transport={transport}
          onPreferences={pet.onPreferences}
          onPersonalityChange={pet.onPersonalityChange}
          onPersonalityReset={pet.onPersonalityReset}
          onPreviewVoice={pet.onPreviewVoice}
          onRefreshDesktopSpeech={pet.onRefreshDesktopSpeech}
          onTest={pet.onTest}
        />
      </div>
    )
  }

  return (
    <div className="control-panel">
      <div className="control-hero">
        <div>
          <p className="eyebrow">Host controls</p>
          <h2>Make Hermes yours</h2>
          <p>Common controls stay close. The full config stays tucked away.</p>
        </div>
        <button
          aria-label="Refresh controls"
          className="icon-button"
          disabled={loading}
          onClick={() => void refresh()}
        >
          ↻
        </button>
      </div>

      {error && <p className="error-message sticky-error">{error}</p>}

      <details className="control-section">
        <summary>
          <span>
            <strong>Session workspace</strong>
            <small>{sessionCwd || preferredWorkspace || 'Not selected'}</small>
          </span>
          <span className="disclosure-glyph">+</span>
        </summary>
        <div className="control-body">
          <p className="advanced-copy">
            The current session cwd controls terminal and file tools. Your
            explicit choice is also used for new conversations on this
            connection.
          </p>
          <code className="workspace-path-value">
            {sessionCwd || preferredWorkspace || 'Choose a workspace'}
          </code>
          <button className="primary-button" onClick={onOpenWorkspace}>
            Change session workspace
          </button>
        </div>
      </details>

      <details className="control-section">
        <summary>
          <span>
            <strong>Providers</strong>
            <small>API credentials and account sign-in</small>
          </span>
          <span className="disclosure-glyph">+</span>
        </summary>
        <div className="control-body">
          <p className="advanced-copy">
            Configure the selected Hermes profile. Secret values are sent
            directly to the host and are never saved in Mobile storage.
          </p>
          <ProviderSetup
            connected={connected}
            profile={profile}
            transport={transport}
            onNotice={onNotice}
          />
        </div>
      </details>

      <details className="control-section">
        <summary>
          <span>
            <strong>Model</strong>
            <small>{models.model || 'Choose a model'}</small>
          </span>
          <span className="disclosure-glyph">+</span>
        </summary>
        <div className="control-body">
          <label>
            <span>Provider</span>
            <select
              value={provider}
              onChange={event => {
                setProvider(event.target.value)
                setModel('')
              }}
            >
              {(models.providers ?? []).map(row => (
                <option key={row.slug} value={row.slug}>
                  {row.name} ({row.models?.length ?? 0})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Model</span>
            <select
              value={model}
              onChange={event => setModel(event.target.value)}
            >
              <option value="">Select model</option>
              {(selectedProvider?.models ?? []).map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="toggle-row">
            <input
              checked={persistModel}
              type="checkbox"
              onChange={event => setPersistModel(event.target.checked)}
            />
            <span>Use as the default for new sessions</span>
          </label>
          {pendingModelConfirm && (
            <div className="confirm-card">
              <p>{pendingModelConfirm}</p>
              <button
                className="danger-button"
                onClick={() => void applyModel(true)}
              >
                Switch anyway
              </button>
            </div>
          )}
          <button
            className="primary-button"
            disabled={loading || !provider || !model}
            onClick={() => void applyModel()}
          >
            Switch model
          </button>
        </div>
      </details>

      <AppearanceSettings
        activeSkinName={activeSkinName}
        onThemeSelectionChange={onThemeSelectionChange}
        themeSelection={themeSelection}
      />

      <MobileCompanionSettings onNotice={onNotice} />

      <PetSettings
        catalog={pet.catalog}
        desktopSpeech={pet.desktopSpeech}
        desktopSpeechStatus={pet.desktopSpeechStatus}
        error={pet.error}
        gateway={gateway}
        hostCapabilities={pet.hostCapabilities}
        info={pet.info}
        personality={pet.personality}
        personalityEdited={pet.personalityEdited}
        preferences={pet.preferences}
        profile={profile}
        status={pet.status}
        transport={transport}
        onPreferences={pet.onPreferences}
        onPersonalityChange={pet.onPersonalityChange}
        onPersonalityReset={pet.onPersonalityReset}
        onPreviewVoice={pet.onPreviewVoice}
        onRefreshDesktopSpeech={pet.onRefreshDesktopSpeech}
        onTest={pet.onTest}
      />

      <details className="control-section">
        <summary>
          <span>
            <strong>Agent behavior</strong>
            <small>Reasoning, speed, approvals, and detail</small>
          </span>
          <span className="disclosure-glyph">+</span>
        </summary>
        <div className="control-body setting-grid">
          <label>
            <span>Reasoning effort</span>
            <select
              value={config.reasoning}
              onChange={event =>
                void setConfigValue(
                  'reasoning',
                  event.target.value,
                  'reasoning',
                )
              }
            >
              {['none', 'low', 'medium', 'high', 'xhigh'].map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Service tier</span>
            <select
              value={config.fast}
              onChange={event =>
                void setConfigValue('fast', event.target.value, 'fast')
              }
            >
              <option value="normal">normal</option>
              <option value="fast">fast</option>
            </select>
          </label>
          <label>
            <span>Approval mode</span>
            <select
              value={config.approval}
              onChange={event =>
                void setConfigValue(
                  'approvals.mode',
                  event.target.value,
                  'approval',
                )
              }
            >
              <option value="manual">manual</option>
              <option value="smart">smart</option>
              <option value="off">off</option>
            </select>
          </label>
          <label>
            <span>Default detail</span>
            <select
              value={config.details}
              onChange={event =>
                void setConfigValue(
                  'details_mode',
                  event.target.value,
                  'details',
                )
              }
            >
              <option value="hidden">hidden</option>
              <option value="collapsed">collapsed</option>
              <option value="expanded">expanded</option>
            </select>
          </label>
        </div>
      </details>

      <details className="control-section">
        <summary>
          <span>
            <strong>Voice</strong>
            <small>Phone microphone and reply playback</small>
          </span>
          <span className="disclosure-glyph">+</span>
        </summary>
        <div className="control-body">
          <p className="advanced-copy">
            Record on this phone, transcribe with the selected Hermes host, and
            play synthesized replies on this device. Captured recordings are
            discarded after transfer.
          </p>
          <label className="toggle-row">
            <input
              checked={autoSpeak}
              type="checkbox"
              onChange={event => onAutoSpeakChange(event.target.checked)}
            />
            <span>Automatically read completed replies aloud</span>
          </label>
          <label>
            <span>“Hey Hermes” behavior</span>
            <select
              disabled={!wakeWordAvailable}
              value={wakeWordMode}
              onChange={event =>
                onWakeWordModeChange(event.target.value as WakeWordMode)
              }
            >
              <option value="off">Off</option>
              <option value="review">Transcribe and review</option>
              <option value="send">Transcribe and send automatically</option>
            </select>
          </label>
          <p className="advanced-copy">
            {wakeWordStatus === 'listening'
              ? `Listening locally for “Hey Hermes” with the same openWakeWord model as Desktop. Begin the captured request with “${pet.preferences.sidechatCommands[0] || 'Pet'} …” or another configured alias to route it to private pet sidechat. Ambient audio is not sent to Hermes.`
              : wakeWordStatus === 'capturing'
                ? `Wake phrase heard. Listening locally until you pause; begin with “${pet.preferences.sidechatCommands[0] || 'Pet'}” or another configured alias for private pet sidechat.`
                : wakeWordStatus === 'transcribing'
                  ? 'Request ended. Transcribing it with the connected Hermes host…'
              : wakeWordStatus === 'starting'
                ? 'Loading the local openWakeWord model…'
                : wakeWordStatus === 'paused'
                  ? 'Paused until the app is foregrounded, connected, and other voice activity is idle.'
                  : wakeWordStatus === 'unsupported'
                    ? 'Local wake-word detection is unavailable on this device.'
                    : wakeWordStatus === 'error'
                      ? 'Wake-word listening stopped. Toggle it off and on to retry.'
                      : wakeWordAvailable
                        ? 'Off. The bundled openWakeWord model runs only on this Android device when enabled.'
                        : 'Wake word is available in the Android app.'}
          </p>
          <VoiceSettings
            connected={connected}
            selection={voiceSelection}
            transport={transport}
            onChange={onVoiceSelectionChange}
          />
          {(voicePhase === 'speaking' || voicePhase === 'synthesizing') && (
            <button className="quiet-button" onClick={onStopSpeech}>
              Stop reply audio
            </button>
          )}
        </div>
      </details>

      <details className="control-section">
        <summary>
          <span>
            <strong>Tools</strong>
            <small>
              {toolsets.filter(row => row.enabled).length} toolsets enabled
            </small>
          </span>
          <span className="disclosure-glyph">+</span>
        </summary>
        <div className="control-body toolset-list">
          {toolsets.map(row => (
            <div className="toolset-row" key={row.name}>
              <div>
                <strong>{row.name}</strong>
                <small>
                  {row.description} · {row.tool_count} tools
                </small>
              </div>
              <button
                className={`switch-button ${row.enabled ? 'on' : ''}`}
                aria-pressed={row.enabled}
                disabled={loading}
                onClick={() => void toggleToolset(row)}
              >
                {row.enabled ? 'On' : 'Off'}
              </button>
            </div>
          ))}
        </div>
      </details>

      <details className="control-section">
        <summary>
          <span>
            <strong>Scheduled work</strong>
            <small>{jobs.length} cron jobs</small>
          </span>
          <span className="disclosure-glyph">+</span>
        </summary>
        <div className="control-body">
          <form
            className="cron-form"
            onSubmit={event => void createCron(event)}
          >
            <label>
              <span>Name (optional)</span>
              <input
                placeholder="Morning brief"
                value={cronName}
                onChange={event => setCronName(event.target.value)}
              />
            </label>
            <label>
              <span>Schedule</span>
              <input
                placeholder="every monday 9am or 0 9 * * *"
                value={cronSchedule}
                onChange={event => setCronSchedule(event.target.value)}
              />
            </label>
            <label>
              <span>Prompt</span>
              <textarea
                placeholder="What should Hermes do?"
                rows={3}
                value={cronPrompt}
                onChange={event => setCronPrompt(event.target.value)}
              />
            </label>
            <button
              className="primary-button"
              disabled={loading || !cronSchedule.trim() || !cronPrompt.trim()}
              type="submit"
            >
              Create job
            </button>
          </form>

          <div className="cron-list">
            {jobs.map(job => {
              const paused = job.state === 'paused' || job.enabled === false
              return (
                <article className="cron-card" key={job.job_id}>
                  <div>
                    <strong>{job.name}</strong>
                    <p>{job.prompt_preview}</p>
                    <small>
                      {job.schedule || 'Unknown schedule'} ·{' '}
                      {nextRunLabel(job.next_run_at)}
                    </small>
                  </div>
                  <div className="request-actions">
                    <button
                      className="quiet-button"
                      disabled={loading}
                      onClick={() =>
                        void cronAction(paused ? 'resume' : 'pause', job)
                      }
                    >
                      {paused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      className="danger-button"
                      disabled={loading}
                      onClick={() => void cronAction('remove', job)}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </details>

      {transport && (
        <MobilePluginInstaller
          connected={connected}
          transport={transport}
          onNotice={onNotice}
        />
      )}

      {transport && (
        <details className="control-section">
          <summary>
            <span>
              <strong>All host settings</strong>
              <small>Search the complete Hermes config schema</small>
            </span>
            <span className="disclosure-glyph">+</span>
          </summary>
          <div className="control-body">
            <HostSettings
              profile={profile}
              transport={transport}
              onNotice={onNotice}
            />
          </div>
        </details>
      )}

      <details className="control-section advanced-section">
        <summary>
          <span>
            <strong>Advanced</strong>
            <small>Redacted full config view</small>
          </span>
          <span className="disclosure-glyph">+</span>
        </summary>
        <div className="control-body">
          <p className="advanced-copy">
            Common settings above use Hermes config RPCs. The full document is
            hidden until requested and sensitive-looking values are redacted.
          </p>
          <form
            className="advanced-config-form"
            onSubmit={event => void setAdvancedConfig(event)}
          >
            <label>
              <span>Config path</span>
              <input
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="display.background_process_notifications"
                value={advancedKey}
                onChange={event => setAdvancedKey(event.target.value)}
              />
            </label>
            <label>
              <span>Value</span>
              <input
                placeholder="result"
                value={advancedValue}
                onChange={event => setAdvancedValue(event.target.value)}
              />
            </label>
            <button
              className="primary-button"
              disabled={loading || !advancedKey.trim() || !advancedValue.trim()}
              type="submit"
            >
              Set config value
            </button>
          </form>
          <button
            className="quiet-button"
            disabled={loading}
            onClick={() => void loadRawConfig()}
          >
            {rawConfig ? 'Refresh config' : 'Show config'}
          </button>
          {rawConfig !== null && (
            <pre className="config-output">{formatDisplayValue(rawConfig)}</pre>
          )}
        </div>
      </details>
    </div>
  )
}
