import { useState } from 'react'
import type { HermesTransport } from '../transport/hermes-transport'
import type { VoiceProviderCatalogItem } from './useVoiceCatalog'

type VoiceCreateMode = 'clone' | 'design'

interface VoiceCreateResponse {
  ok?: boolean
  voice?: {
    display?: string
    id?: string
  }
}

interface VoiceLibraryProps {
  connected: boolean
  onRefresh: () => Promise<void>
  onSelectVoice: (voiceId: string) => void
  provider: VoiceProviderCatalogItem
  selectedVoice: string
  transport: HermesTransport | null
}

const MAX_REFERENCE_BYTES = 25 * 1024 * 1024
const VOICE_CREATE_TIMEOUT_MS = 15 * 60 * 1000

function audioMimeType(file: File): string {
  if (file.type.startsWith('audio/')) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase()
  return (
    {
      m4a: 'audio/mp4',
      mp3: 'audio/mpeg',
      ogg: 'audio/ogg',
      opus: 'audio/ogg',
      wav: 'audio/wav',
      webm: 'audio/webm',
    }[extension ?? ''] ?? 'audio/wav'
  )
}

function readAudioDataUrl(file: File): Promise<string> {
  if (file.size > MAX_REFERENCE_BYTES) {
    return Promise.reject(new Error('Reference audio must be 25 MB or smaller'))
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(reader.error ?? new Error('Could not read reference audio'))
    reader.onload = () => {
      const value = String(reader.result ?? '')
      const comma = value.indexOf(',')
      if (comma < 0) {
        reject(new Error('Could not encode reference audio'))
        return
      }
      resolve(`data:${audioMimeType(file)};base64,${value.slice(comma + 1)}`)
    }
    reader.readAsDataURL(file)
  })
}

export function VoiceLibrary({
  connected,
  onRefresh,
  onSelectVoice,
  provider,
  selectedVoice,
  transport,
}: VoiceLibraryProps) {
  const canClone = Boolean(provider.capabilities?.voice_cloning)
  const canDesign = Boolean(provider.capabilities?.voice_design)
  const [mode, setMode] = useState<VoiceCreateMode>(
    canClone ? 'clone' : 'design',
  )
  const languages = provider.capabilities?.languages?.length
    ? provider.capabilities.languages
    : ['Auto', 'English']
  const [name, setName] = useState('')
  const [language, setLanguage] = useState(
    languages.includes('English') ? 'English' : languages[0],
  )
  const [referenceText, setReferenceText] = useState('')
  const [instruct, setInstruct] = useState('')
  const [audioDataUrl, setAudioDataUrl] = useState('')
  const [audioName, setAudioName] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  if (!canClone && !canDesign) return null

  const ready =
    connected &&
    Boolean(transport) &&
    Boolean(name.trim()) &&
    (mode === 'clone' ? Boolean(audioDataUrl) : Boolean(instruct.trim()))

  const createVoice = async () => {
    if (!transport || !ready) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await transport.requestJson<VoiceCreateResponse>(
        `/api/audio/tts/providers/${encodeURIComponent(provider.id)}/voices`,
        {
          name: name.trim(),
          mode,
          language,
          ...(mode === 'clone'
            ? { reference_audio_data_url: audioDataUrl }
            : {}),
          ...(referenceText.trim()
            ? { reference_text: referenceText.trim() }
            : {}),
          ...(instruct.trim() ? { instruct: instruct.trim() } : {}),
        },
        { timeoutMs: VOICE_CREATE_TIMEOUT_MS },
      )
      const createdId = String(result.voice?.id ?? '').trim()
      await onRefresh()
      if (createdId) onSelectVoice(createdId)
      setNotice(
        `Created ${result.voice?.display || createdId || name.trim()}`,
      )
      setName('')
      setReferenceText('')
      setInstruct('')
      setAudioDataUrl('')
      setAudioName('')
      setFileInputKey(value => value + 1)
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : String(createError),
      )
    } finally {
      setBusy(false)
    }
  }

  const deleteVoice = async (voiceId: string, display: string) => {
    if (
      !transport ||
      !window.confirm(`Delete the saved voice “${display}”?`)
    ) {
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await transport.requestJson(
        `/api/audio/tts/providers/${encodeURIComponent(provider.id)}/voices/delete`,
        { voice_id: voiceId },
        { timeoutMs: 60_000 },
      )
      if (selectedVoice === voiceId) onSelectVoice('')
      await onRefresh()
      setNotice(`Deleted ${display}`)
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : String(deleteError),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="voice-library">
      <div className="voice-library-heading">
        <strong>Custom voice library</strong>
        <small>
          Create reusable voices on {provider.display ?? provider.id}.
        </small>
      </div>

      {canClone && canDesign && (
        <label>
          Creation mode
          <select
            disabled={busy}
            value={mode}
            onChange={event =>
              setMode(event.target.value as VoiceCreateMode)
            }
          >
            <option value="clone">Clone reference audio</option>
            <option value="design">Design from instructions</option>
          </select>
        </label>
      )}

      <label>
        Voice name
        <input
          disabled={busy}
          placeholder="Podcast narrator"
          value={name}
          onChange={event => setName(event.target.value)}
        />
      </label>

      <label>
        Language
        <select
          disabled={busy}
          value={language}
          onChange={event => setLanguage(event.target.value)}
        >
          {languages.map(item => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      {mode === 'clone' && (
        <label>
          Reference audio
          <input
            accept="audio/*"
            capture="user"
            disabled={busy}
            key={fileInputKey}
            type="file"
            onChange={event => {
              const file = event.target.files?.[0]
              if (!file) return
              setError('')
              setAudioName(file.name)
              void readAudioDataUrl(file)
                .then(setAudioDataUrl)
                .catch(readError => {
                  setAudioDataUrl('')
                  setAudioName('')
                  setError(
                    readError instanceof Error
                      ? readError.message
                      : String(readError),
                  )
                })
            }}
          />
          <small>
            {audioName ||
              'Record or choose a short, clean clip. Audio stays ephemeral during upload.'}
          </small>
        </label>
      )}

      <label>
        {mode === 'clone' ? 'Reference transcript' : 'Sample text'}
        <textarea
          disabled={busy}
          placeholder={
            mode === 'clone'
              ? 'Optional exact transcript of the reference clip'
              : 'Optional text used to build the reusable reference'
          }
          value={referenceText}
          onChange={event => setReferenceText(event.target.value)}
        />
      </label>

      {mode === 'design' && (
        <label>
          Voice design instructions
          <textarea
            disabled={busy}
            placeholder="Warm, confident narrator with measured pacing and a gentle rasp"
            value={instruct}
            onChange={event => setInstruct(event.target.value)}
          />
        </label>
      )}

      <button
        className="primary-button"
        disabled={busy || !ready}
        onClick={() => void createVoice()}
      >
        {busy ? 'Creating voice…' : mode === 'clone' ? 'Create clone' : 'Create design'}
      </button>

      <div className="voice-library-list">
        <strong>Saved voices</strong>
        {(provider.voices ?? []).length === 0 ? (
          <p className="section-help">No reusable voices saved yet.</p>
        ) : (
          provider.voices?.map(voice => (
            <div className="voice-library-row" key={voice.id}>
              <button
                className="voice-library-select"
                disabled={busy}
                onClick={() => onSelectVoice(voice.id)}
              >
                <strong>{voice.display ?? voice.id}</strong>
                <small>
                  {[voice.kind, voice.language, voice.profile]
                    .filter(Boolean)
                    .join(' · ') || voice.id}
                </small>
              </button>
              {provider.capabilities?.voice_delete &&
                voice.deletable !== false && (
                  <button
                    className="danger-button"
                    disabled={busy}
                    onClick={() =>
                      void deleteVoice(
                        voice.id,
                        voice.display ?? voice.id,
                      )
                    }
                  >
                    Delete
                  </button>
                )}
            </div>
          ))
        )}
      </div>

      {notice && (
        <p aria-live="polite" className="inline-success">
          {notice}
        </p>
      )}
      {error && (
        <p aria-live="assertive" className="inline-error">
          {error}
        </p>
      )}
    </section>
  )
}
