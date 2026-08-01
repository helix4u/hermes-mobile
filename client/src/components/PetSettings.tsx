import { useCallback, useEffect, useMemo, useState } from 'react'
import { isMissingCapabilityError } from '../capability-errors'
import type { JsonRpcGatewayClient } from '../protocol/json-rpc-client'
import { petSidechatPrompt } from '../pet'
import type {
  MobilePetInfo,
  PetHostCapabilities,
  PetPersonalityData,
  PetPersonalityOverride,
  PetPersonalitySummary,
  PetPreferences,
  PetSpeechProfile,
} from '../pet'
import type { HermesTransport } from '../transport/hermes-transport'
import { DEFAULT_XAI_TTS_SELECTION } from '../reader'
import { useVoiceCatalog } from './useVoiceCatalog'
import { XaiTtsControls } from './XaiTtsControls'

interface ModelProvider {
  slug: string
  name: string
  models?: string[]
  api_url?: string
}

interface ModelOptions {
  model?: string
  provider?: string
  providers?: ModelProvider[]
}

interface AuxiliaryAssignment {
  task: string
  provider: string
  model: string
  base_url?: string
}

interface PetSettingsProps {
  catalog: PetPersonalitySummary[]
  desktopSpeech: PetSpeechProfile | null
  desktopSpeechStatus: 'idle' | 'loading' | 'ready' | 'missing'
  error: string
  gateway: JsonRpcGatewayClient | null
  hostCapabilities: PetHostCapabilities
  info: MobilePetInfo
  personality: PetPersonalityData | null
  personalityEdited: boolean
  preferences: PetPreferences
  profile: string
  status: 'idle' | 'loading' | 'ready' | 'unavailable'
  transport: HermesTransport | null
  onPreferences: (patch: Partial<PetPreferences>) => void
  onPersonalityChange: (patch: Partial<PetPersonalityOverride>) => void
  onPersonalityReset: () => void
  onPreviewVoice: () => void
  onRefreshDesktopSpeech: () => void | Promise<void>
  onTest: () => void | Promise<void>
}

function profileQuery(profile: string): string {
  return profile && profile !== 'default'
    ? `?profile=${encodeURIComponent(profile)}`
    : ''
}

export function PetSettings({
  catalog,
  desktopSpeech,
  desktopSpeechStatus,
  error,
  gateway,
  hostCapabilities,
  info,
  onPreferences,
  onPersonalityChange,
  onPersonalityReset,
  onPreviewVoice,
  onRefreshDesktopSpeech,
  onTest,
  personality,
  personalityEdited,
  preferences,
  profile,
  status,
  transport,
}: PetSettingsProps) {
  const [models, setModels] = useState<ModelOptions>({})
  const [auxProvider, setAuxProvider] = useState('')
  const [auxModel, setAuxModel] = useState('')
  const [auxEffort, setAuxEffort] = useState('')
  const [saving, setSaving] = useState(false)
  const [auxError, setAuxError] = useState('')
  const serializedSidechatCommands = preferences.sidechatCommands.join(', ')
  const [sidechatCommandDraft, setSidechatCommandDraft] = useState(
    serializedSidechatCommands,
  )
  const [auxiliarySupported, setAuxiliarySupported] = useState<boolean | null>(
    null,
  )
  const voiceCatalog = useVoiceCatalog(transport, Boolean(transport))
  const customVoiceChoices = voiceCatalog.choices.filter(
    choice => choice.provider === preferences.speechProvider,
  )
  const customProvider = voiceCatalog.catalog.find(
    provider => provider.id === preferences.speechProvider,
  )
  const visualOnlyHost =
    hostCapabilities.mode === 'visual-only' && Boolean(transport)
  const localPersonalities = catalog.filter(
    row => row.source === 'mobile-local',
  )
  const adaptedPersonalities = catalog.filter(
    row => row.source === 'mobile-default',
  )
  const hostPersonalities = catalog.filter(
    row => row.source !== 'mobile-local' && row.source !== 'mobile-default',
  )

  const selectedProvider = useMemo(
    () => models.providers?.find(row => row.slug === auxProvider),
    [auxProvider, models.providers],
  )

  useEffect(() => {
    setSidechatCommandDraft(serializedSidechatCommands)
  }, [serializedSidechatCommands])

  const refreshAuxiliary = useCallback(async () => {
    if (!hostCapabilities.commentary || !gateway || !transport) {
      setModels({})
      setAuxError('')
      setAuxiliarySupported(false)
      return
    }
    setAuxError('')
    setAuxiliarySupported(null)
    try {
      const [options, auxiliary, config] = await Promise.all([
        gateway.request<ModelOptions>('model.options', { explicit_only: true }),
        transport.requestJson<{
          main?: { provider?: string; model?: string }
          tasks?: AuxiliaryAssignment[]
        }>(`/api/model/auxiliary${profileQuery(profile)}`),
        transport.requestJson<Record<string, unknown>>(
          `/api/config${profileQuery(profile)}`,
        ),
      ])
      const assignment = auxiliary.tasks?.find(
        row => row.task === 'pet_commentary',
      )
      const auxiliaryConfig =
        config.auxiliary &&
        typeof config.auxiliary === 'object' &&
        !Array.isArray(config.auxiliary)
          ? (config.auxiliary as Record<string, unknown>)
          : {}
      const petConfig =
        auxiliaryConfig.pet_commentary &&
        typeof auxiliaryConfig.pet_commentary === 'object' &&
        !Array.isArray(auxiliaryConfig.pet_commentary)
          ? (auxiliaryConfig.pet_commentary as Record<string, unknown>)
          : {}
      setModels(options)
      setAuxProvider(
        assignment?.provider && assignment.provider !== 'auto'
          ? assignment.provider
          : auxiliary.main?.provider || options.provider || '',
      )
      setAuxModel(assignment?.model || auxiliary.main?.model || options.model || '')
      setAuxEffort(String(petConfig.reasoning_effort ?? ''))
      setAuxiliarySupported(true)
    } catch (loadError) {
      setModels({})
      if (isMissingCapabilityError(loadError)) {
        setAuxiliarySupported(false)
        setAuxError('')
      } else {
        setAuxiliarySupported(null)
        setAuxError(
          loadError instanceof Error ? loadError.message : String(loadError),
        )
      }
    }
  }, [gateway, hostCapabilities.commentary, profile, transport])

  useEffect(() => {
    void refreshAuxiliary()
  }, [refreshAuxiliary])

  async function saveAuxiliary() {
    if (!transport || !auxProvider || !auxModel) return
    setSaving(true)
    setAuxError('')
    try {
      const provider = models.providers?.find(row => row.slug === auxProvider)
      await transport.requestJson(
        `/api/model/set${profileQuery(profile)}`,
        {
          scope: 'auxiliary',
          task: 'pet_commentary',
          provider: auxProvider,
          model: auxModel,
          ...(provider?.api_url ? { base_url: provider.api_url } : {}),
        },
        { method: 'POST' },
      )
      await transport.requestJson(
        `/api/config${profileQuery(profile)}`,
        {
          config: {
            auxiliary: {
              pet_commentary: {
                reasoning_effort: auxEffort,
              },
            },
          },
        },
        { method: 'PUT' },
      )
      await refreshAuxiliary()
    } catch (saveError) {
      setAuxError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <details className="control-section">
      <summary>
        <span>
          <strong>Pet companion</strong>
          <small>
            {visualOnlyHost
              ? `${personality?.displayName || info.displayName || 'Pet'} · visual only on this host`
              : hostCapabilities.mode === 'visual-only'
                ? `${personality?.displayName || info.displayName || 'Pet'} · built into Mobile`
              : personality?.displayName ||
                info.displayName ||
                (status === 'unavailable'
                  ? 'Unavailable on this host'
                  : 'Loading')}
          </small>
        </span>
        <span className="disclosure-glyph">+</span>
      </summary>
      <div className="control-body">
        <p className="advanced-copy">
          Pet visibility, position, roaming, and speech choices stay on this
          phone for this saved connection. Server-backed personality
          commentary, sidechat, and model assignment appear only when the
          selected Hermes host exposes them.
        </p>
        {hostCapabilities.mode === 'visual-only' && (
          <div className="pet-capability-note">
            <strong>Pet personalities are built into Mobile.</strong>
            <small>
              {visualOnlyHost
                ? 'This host does not provide pet AI commentary, sidechat, host-local personalities, or an auxiliary pet model. Bundled personality tap lines and roaming still work. Pet speech can use the same host-default TTS path as Listen and Reader.'
                : 'The bundled personalities, visual pet, tap lines, position, and roaming stay available while disconnected. Server-backed commentary, sidechat, and speech return with a capable connection.'}
            </small>
          </div>
        )}

        <label className="toggle-row">
          <input
            checked={preferences.visible}
            type="checkbox"
            onChange={event => onPreferences({ visible: event.target.checked })}
          />
          <span>Show my pet in the app</span>
        </label>
        <label className="toggle-row">
          <input
            checked={preferences.roam}
            type="checkbox"
            onChange={event => onPreferences({ roam: event.target.checked })}
          />
          <span>Let the pet walk around</span>
        </label>
        {hostCapabilities.commentary && (
          <label className="toggle-row">
            <input
              checked={preferences.commentary}
              type="checkbox"
              onChange={event =>
                onPreferences({ commentary: event.target.checked })
              }
            />
            <span>Generate personality commentary during long turns</span>
          </label>
        )}
        <label className="toggle-row">
          <input
            checked={preferences.speakCommentary}
            type="checkbox"
            onChange={event =>
              onPreferences({ speakCommentary: event.target.checked })
            }
          />
          <span>
            Speak pet interactions
            {hostCapabilities.commentary ? ' and generated commentary' : ''}
          </span>
        </label>
        <label>
          <span>Sidechat command words</span>
          <input
            maxLength={512}
            placeholder="Pet, Alien Child, Jaskass"
            value={sidechatCommandDraft}
            onChange={event => setSidechatCommandDraft(event.target.value)}
            onBlur={() =>
              onPreferences({
                sidechatCommands: sidechatCommandDraft.split(/[,;\n]/),
              })
            }
            onKeyDown={event => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />
          <small>
            After “Hey Hermes” or ordinary microphone capture, begin with any
            comma-separated alias above. Mobile strips the matched alias and
            sends the remainder to private pet sidechat. Add likely STT spellings
            as separate aliases.
          </small>
        </label>

        {preferences.speakCommentary && (
          <div className="pet-speech-settings">
            <label>
              <span>Pet voice source</span>
              <select
                value={preferences.speechMode}
                onChange={event =>
                  onPreferences({
                    speechMode:
                      event.target.value === 'custom' ? 'custom' : 'desktop',
                  })
                }
              >
                <option value="desktop">
                  Follow Desktop pet voice for this connection
                </option>
                <option value="custom">Independent Mobile pet voice</option>
              </select>
            </label>

            {preferences.speechMode === 'desktop' ? (
              <div className="pet-voice-summary">
                <strong>
                  {desktopSpeechStatus === 'loading'
                    ? 'Reading Desktop pet voice…'
                    : desktopSpeech?.enabled && desktopSpeech.mode === 'hermes'
                      ? `${
                          desktopSpeech.provider === 'inherit'
                            ? 'Main host TTS'
                            : desktopSpeech.provider
                        }${
                          desktopSpeech.voice
                            ? ` · ${desktopSpeech.voice}`
                            : ''
                        }`
                      : 'Host TTS fallback'}
                </strong>
                <small>
                  {desktopSpeech?.enabled && desktopSpeech.mode === 'hermes'
                    ? `${desktopSpeech.speed.toFixed(2)}× · ${
                        desktopSpeech.pitch > 0 ? '+' : ''
                      }${desktopSpeech.pitch.toFixed(1)} tone · ${Math.round(
                        desktopSpeech.volume * 100,
                      )}%`
                    : visualOnlyHost
                      ? 'This host does not publish a Desktop pet voice, so Mobile uses its ordinary host-default speech.'
                      : 'Open Pet settings once in the rebuilt Desktop app to mirror its current pet voice into this profile.'}
                </small>
              </div>
            ) : (
              <div className="pet-custom-voice">
                <label>
                  <span>Provider</span>
                  <select
                    value={preferences.speechProvider}
                    onChange={event =>
                      onPreferences({
                        speechProvider: event.target.value,
                        speechVoice: '',
                        ...(event.target.value === 'xai'
                          ? {
                              speechXai:
                                preferences.speechXai ??
                                DEFAULT_XAI_TTS_SELECTION,
                            }
                          : {}),
                      })
                    }
                  >
                    <option value="">Host default TTS</option>
                    {voiceCatalog.providers.map(provider => (
                      <option key={provider} value={provider}>
                        {voiceCatalog.catalog.find(row => row.id === provider)
                          ?.display ??
                          (provider === 'xai' ? 'xAI' : provider)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Voice</span>
                  {customVoiceChoices.length ? (
                    <select
                      disabled={!preferences.speechProvider}
                      value={preferences.speechVoice}
                      onChange={event =>
                        onPreferences({ speechVoice: event.target.value })
                      }
                    >
                      <option value="">Provider default</option>
                      {customVoiceChoices.map(choice => (
                        <option
                          key={`${choice.provider}:${choice.voice}`}
                          value={choice.voice}
                        >
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      disabled={!preferences.speechProvider}
                      placeholder={
                        preferences.speechProvider
                          ? 'Enter a voice ID'
                          : 'Host default'
                      }
                      value={preferences.speechVoice}
                      onChange={event =>
                        onPreferences({ speechVoice: event.target.value })
                      }
                    />
                  )}
                  {customProvider && (
                    <small>
                      {customVoiceChoices.length
                        ? `${customVoiceChoices.length} voices available`
                        : 'This provider did not report a voice catalog.'}
                    </small>
                  )}
                </label>
                <div className="setting-grid">
                  <label className="voice-speed-field">
                    <span>
                      Speed
                      <output>{preferences.speechSpeed.toFixed(2)}×</output>
                    </span>
                    <input
                      max="2"
                      min="0.5"
                      step="0.05"
                      type="range"
                      value={preferences.speechSpeed}
                      onChange={event =>
                        onPreferences({
                          speechSpeed: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="voice-speed-field">
                    <span>
                      Pitch
                      <output>
                        {preferences.speechPitch > 0 ? '+' : ''}
                        {preferences.speechPitch.toFixed(1)}
                      </output>
                    </span>
                    <input
                      max="12"
                      min="-12"
                      step="0.5"
                      type="range"
                      value={preferences.speechPitch}
                      onChange={event =>
                        onPreferences({
                          speechPitch: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <label className="voice-speed-field">
                  <span>
                    Volume
                    <output>
                      {Math.round(preferences.speechVolume * 100)}%
                    </output>
                  </span>
                  <input
                    max="1"
                    min="0"
                    step="0.05"
                    type="range"
                    value={preferences.speechVolume}
                    onChange={event =>
                      onPreferences({
                        speechVolume: Number(event.target.value),
                      })
                    }
                  />
                </label>
                {preferences.speechProvider === 'xai' && (
                  <XaiTtsControls
                    language={preferences.speechXaiLanguage}
                    value={preferences.speechXai}
                    onChange={(speechXai, speechXaiLanguage) =>
                      onPreferences({ speechXai, speechXaiLanguage })
                    }
                  />
                )}
              </div>
            )}

            <button
              className="quiet-button"
              disabled={!transport}
              type="button"
              onClick={onPreviewVoice}
            >
              Preview pet voice
            </button>
            {preferences.speechMode === 'desktop' && (
              <button
                className="quiet-button"
                disabled={!transport || desktopSpeechStatus === 'loading'}
                type="button"
                onClick={() => void onRefreshDesktopSpeech()}
              >
                {desktopSpeechStatus === 'loading'
                  ? 'Refreshing Desktop voice…'
                  : 'Refresh Desktop pet voice'}
              </button>
            )}
            {voiceCatalog.error && (
              <p className="inline-error">{voiceCatalog.error}</p>
            )}
          </div>
        )}

        <label>
          <span>Personality</span>
          <select
            disabled={catalog.length === 0}
            value={preferences.personalitySlug}
            onChange={event =>
              onPreferences({ personalitySlug: event.target.value })
            }
          >
            {localPersonalities.length > 0 && (
              <optgroup label="Your pet presets">
                {localPersonalities.map(row => (
                  <option key={row.slug} value={row.slug}>
                    {row.displayName}
                  </option>
                ))}
              </optgroup>
            )}
            {adaptedPersonalities.length > 0 && (
              <optgroup label="Adapted Hermes defaults">
                {adaptedPersonalities.map(row => (
                  <option key={row.slug} value={row.slug}>
                    {row.displayName}
                  </option>
                ))}
              </optgroup>
            )}
            {hostPersonalities.length > 0 && (
              <optgroup label="This Hermes host">
                {hostPersonalities.map(row => (
                  <option key={row.slug} value={row.slug}>
                    {row.displayName}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <small>
            {personality?.description ||
              'Choose a bundled or host-provided personality.'}
          </small>
        </label>

        {personality && (
          <details className="pet-personality-editor">
            <summary>
              <span>
                <strong>Edit selected personality</strong>
                <small>
                  {personalityEdited
                    ? 'Customized for this saved connection'
                    : 'Connection-scoped local override'}
                </small>
              </span>
              <span className="disclosure-glyph">+</span>
            </summary>
            <div className="pet-personality-editor-body">
              <p className="advanced-copy">
                These edits stay on this phone for this saved connection. The
                bundled preset and host files are never overwritten.
              </p>
              <label>
                <span>Display name</span>
                <input
                  maxLength={120}
                  value={personality.displayName}
                  onChange={event =>
                    onPersonalityChange({ displayName: event.target.value })
                  }
                />
                <small>
                  This name controls the pet’s identity and labels. Voice routing
                  uses the separate sidechat command aliases above.
                </small>
              </label>
              <label>
                <span>Description</span>
                <textarea
                  maxLength={500}
                  rows={3}
                  value={personality.description}
                  onChange={event =>
                    onPersonalityChange({ description: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Tap lines</span>
                <textarea
                  maxLength={25_000}
                  placeholder="One pet reaction per line"
                  rows={5}
                  value={(personality.interactions?.click ?? []).join('\n')}
                  onChange={event =>
                    onPersonalityChange({
                      clickLines: event.target.value
                        .split(/\r?\n/)
                        .map(line => line.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <label>
                <span>Ambient commentary prompt</span>
                <textarea
                  maxLength={20_000}
                  rows={7}
                  value={personality.commentary?.prompt ?? ''}
                  onChange={event =>
                    onPersonalityChange({
                      commentaryPrompt: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                <span>Private sidechat prompt</span>
                <textarea
                  maxLength={20_000}
                  placeholder="Leave the preset wording in place for full character embodiment."
                  rows={8}
                  value={
                    personality.sidechat?.prompt ??
                    petSidechatPrompt(personality)
                  }
                  onChange={event =>
                    onPersonalityChange({
                      sidechatPrompt: event.target.value,
                    })
                  }
                />
              </label>
              <button
                className="quiet-button"
                disabled={!personalityEdited}
                type="button"
                onClick={onPersonalityReset}
              >
                Reset selected personality
              </button>
            </div>
          </details>
        )}

        {hostCapabilities.commentary && (
          <>
            <div className="pet-commentary-settings">
          <label>
            <span>Commentary lens</span>
            <select
              value={preferences.commentaryLens}
              onChange={event =>
                onPreferences({
                  commentaryLens:
                    event.target.value === 'progress'
                      ? 'progress'
                      : event.target.value === 'tool'
                        ? 'tool'
                        : 'companion',
                })
              }
            >
              <option value="companion">Companion conversation</option>
              <option value="progress">Progress observer</option>
              <option value="tool">Tool evidence observer</option>
            </select>
            <small>
              {preferences.commentaryLens === 'companion'
                ? 'Uses recent visible conversation and bounded tool status.'
                : preferences.commentaryLens === 'progress'
                  ? 'Comments only when the observed work phase or tool lifecycle advances.'
                  : 'Waits for concrete tool evidence and can reference bounded, force-redacted arguments and results.'}
            </small>
          </label>

          <div className="setting-grid">
            {preferences.commentaryLens === 'companion' && (
              <label>
                <span>Conversation turns</span>
                <select
                  value={preferences.contextTurns}
                  onChange={event =>
                    onPreferences({
                      contextTurns: Number(event.target.value),
                    })
                  }
                >
                  {[1, 2, 3, 5, 8, 10].map(value => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span>Tool observations</span>
              <select
                value={preferences.toolTurns}
                onChange={event =>
                  onPreferences({ toolTurns: Number(event.target.value) })
                }
              >
                {[0, 2, 4, 6, 10, 15, 20].map(value => (
                  <option key={value} value={value}>
                    {value === 0 ? 'None' : value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Avoid recent comments</span>
              <select
                value={preferences.commentaryHistory}
                onChange={event =>
                  onPreferences({
                    commentaryHistory: Number(event.target.value),
                  })
                }
              >
                {[0, 3, 5, 8, 12, 20].map(value => (
                  <option key={value} value={value}>
                    {value === 0 ? 'Off' : value}
                  </option>
                ))}
              </select>
            </label>
          </div>
            </div>

            <div className="setting-grid">
          <label>
            <span>First comment after</span>
            <select
              value={preferences.delaySeconds}
              onChange={event =>
                onPreferences({ delaySeconds: Number(event.target.value) })
              }
            >
              {[5, 8, 12, 20, 30, 60].map(seconds => (
                <option key={seconds} value={seconds}>
                  {seconds} seconds
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Repeat every</span>
            <select
              value={preferences.intervalSeconds}
              onChange={event =>
                onPreferences({ intervalSeconds: Number(event.target.value) })
              }
            >
              {[20, 30, 45, 60, 90, 120, 300].map(seconds => (
                <option key={seconds} value={seconds}>
                  {seconds < 60 ? `${seconds} seconds` : `${seconds / 60} minutes`}
                </option>
              ))}
            </select>
          </label>
            </div>

            <button
              className="quiet-button"
              disabled={
                !gateway ||
                status !== 'ready' ||
                !personality?.commentary?.prompt
              }
              type="button"
              onClick={() => void onTest()}
            >
              Test {personality?.displayName || 'pet'} commentary
            </button>

            {auxiliarySupported === false ? (
              <div className="pet-capability-note">
                <strong>Host-managed commentary model</strong>
                <small>
                  This host can generate pet commentary, but it does not expose
                  custom auxiliary-model assignment to Mobile.
                </small>
              </div>
            ) : (
              <div className="pet-aux-settings">
          <div>
            <strong>Commentary model</strong>
            <small>
              This assignment updates `auxiliary.pet_commentary` on the
              connected Hermes profile.
            </small>
          </div>
          <label>
            <span>Provider</span>
            <select
              value={auxProvider}
              onChange={event => {
                setAuxProvider(event.target.value)
                setAuxModel('')
              }}
            >
              {(models.providers ?? []).map(row => (
                <option key={row.slug} value={row.slug}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Model</span>
            <select
              value={auxModel}
              onChange={event => setAuxModel(event.target.value)}
            >
              <option value="">Select model</option>
              {auxModel &&
                !(selectedProvider?.models ?? []).includes(auxModel) && (
                  <option value={auxModel}>{auxModel}</option>
                )}
              {(selectedProvider?.models ?? []).map(model => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Reasoning effort</span>
            <select
              value={auxEffort}
              onChange={event => setAuxEffort(event.target.value)}
            >
              <option value="">Provider default</option>
              {['none', 'low', 'medium', 'high', 'xhigh'].map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary-button"
            disabled={saving || !auxProvider || !auxModel}
            type="button"
            onClick={() => void saveAuxiliary()}
          >
            {saving ? 'Saving…' : 'Save commentary model'}
          </button>
              </div>
            )}
          </>
        )}

        {(error || auxError) && (
          <p className="error-message">{error || auxError}</p>
        )}
      </div>
    </details>
  )
}
