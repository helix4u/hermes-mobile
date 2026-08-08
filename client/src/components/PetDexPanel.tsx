import { useCallback, useEffect, useMemo, useState } from 'react'
import type { JsonRpcGatewayClient } from '../protocol/json-rpc-client'
import type { GatewayEvent } from '../protocol/types'
import type { MobilePetInfo } from '../pet'
import { saveDataUrl } from '../save-data'

export interface GalleryPet {
  slug: string
  displayName: string
  installed: boolean
  spritesheetUrl?: string
  curated?: boolean
  generated?: boolean
}

interface PetGallery {
  enabled: boolean
  active: string
  pets: GalleryPet[]
}

interface PetDraft {
  index: number
  dataUri: string
}

interface PetGenProvider {
  name: string
  label: string
  default?: boolean
}

interface HatchedPet {
  slug: string
  displayName: string
  warnings?: string[]
  pet?: MobilePetInfo
}

interface PetDexPanelProps {
  gateway: JsonRpcGatewayClient | null
  profile: string
  onChanged: () => void | Promise<void>
}

const profileParams = (profile: string) => ({
  profile: profile === 'default' ? '' : profile,
})

export function rankPetDexPets(
  pets: GalleryPet[],
  search: string,
): GalleryPet[] {
  const needle = search.trim().toLowerCase()
  return pets
    .filter(
      (pet) =>
        !needle ||
        `${pet.displayName} ${pet.slug}`.toLowerCase().includes(needle),
    )
    .sort(
      (left, right) =>
        Number(Boolean(right.generated)) - Number(Boolean(left.generated)) ||
        Number(Boolean(right.installed)) - Number(Boolean(left.installed)) ||
        Number(Boolean(right.curated)) - Number(Boolean(left.curated)) ||
        left.displayName.localeCompare(right.displayName),
    )
}

export const petHatchCancelToken = (token: string): string =>
  `${token}-mobile-hatch`

function PetThumbnail({
  gateway,
  pet,
  profile,
}: PetDexPanelProps & { pet: GalleryPet }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    if (!gateway) return
    let active = true
    void gateway
      .request<{ ok?: boolean; dataUri?: string }>('pet.thumb', {
        ...profileParams(profile),
        slug: pet.slug,
        url: pet.spritesheetUrl || '',
      })
      .then((result) => {
        if (active && result.ok && result.dataUri) setSrc(result.dataUri)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [gateway, pet.slug, pet.spritesheetUrl, profile])
  return src ? (
    <img alt="" aria-hidden="true" src={src} />
  ) : (
    <span aria-hidden="true">?</span>
  )
}

function readFileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(new Error('Could not read the reference image'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })
}

export function PetDexPanel({ gateway, onChanged, profile }: PetDexPanelProps) {
  const [gallery, setGallery] = useState<PetGallery | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [genAvailable, setGenAvailable] = useState(false)
  const [providers, setProviders] = useState<PetGenProvider[]>([])
  const [provider, setProvider] = useState('')
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState('auto')
  const [count, setCount] = useState(4)
  const [referenceImage, setReferenceImage] = useState('')
  const [token, setToken] = useState('')
  const [drafts, setDrafts] = useState<PetDraft[]>([])
  const [selectedDraft, setSelectedDraft] = useState<number | null>(null)
  const [petName, setPetName] = useState('')
  const [description, setDescription] = useState('')
  const [hatchProgress, setHatchProgress] = useState('')
  const [hatched, setHatched] = useState<HatchedPet | null>(null)

  const refresh = useCallback(async () => {
    if (!gateway) return
    setLoading(true)
    setError('')
    try {
      const local = await gateway.request<PetGallery>('pet.gallery', {
        ...profileParams(profile),
        localOnly: true,
      })
      setGallery(local)
      void gateway
        .request<PetGallery>('pet.gallery', profileParams(profile), {
          timeoutMs: 90_000,
        })
        .then(setGallery)
        .catch(() => undefined)
      const generation = await gateway
        .request<{ available?: boolean; providers?: PetGenProvider[] }>(
          'pet.generate.status',
          profileParams(profile),
        )
        .catch(() => ({ available: false, providers: [] }))
      setGenAvailable(Boolean(generation.available))
      setProviders(generation.providers ?? [])
      setProvider((current) =>
        current && !generation.providers?.some((row) => row.name === current)
          ? ''
          : current,
      )
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : String(loadError),
      )
    } finally {
      setLoading(false)
    }
  }, [gateway, profile])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!gateway) return
    return gateway.onEvent((event: GatewayEvent) => {
      const payload = event.payload as Record<string, unknown>
      if (event.type === 'pet.changed') {
        void refresh()
      } else if (event.type === 'pet.generate.progress') {
        if (typeof payload.token === 'string') setToken(payload.token)
        if (
          typeof payload.index === 'number' &&
          typeof payload.dataUri === 'string'
        ) {
          setDrafts((current) =>
            [
              ...current.filter((row) => row.index !== payload.index),
              {
                index: payload.index as number,
                dataUri: payload.dataUri as string,
              },
            ].sort((left, right) => left.index - right.index),
          )
        }
      } else if (event.type === 'pet.hatch.progress') {
        if (payload.event === 'row') {
          setHatchProgress(
            `Drawing ${payload.state || 'animation'} ${payload.done || ''}/${payload.total || ''}`,
          )
        } else {
          setHatchProgress(
            payload.event === 'compose'
              ? 'Composing spritesheet'
              : payload.event === 'save'
                ? 'Saving your new pet'
                : 'Hatching',
          )
        }
      }
    })
  }, [gateway, refresh])

  const visiblePets = useMemo(() => {
    return rankPetDexPets(gallery?.pets ?? [], search)
  }, [gallery?.pets, search])

  async function mutate(
    label: string,
    operation: () => Promise<unknown>,
  ): Promise<boolean> {
    setBusy(label)
    setError('')
    try {
      await operation()
      await Promise.resolve(onChanged())
      await refresh()
      return true
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : String(mutationError),
      )
      return false
    } finally {
      setBusy('')
    }
  }

  async function generate() {
    if (!gateway || (!prompt.trim() && !referenceImage)) return
    setBusy('generate')
    setError('')
    setDrafts([])
    setSelectedDraft(null)
    setHatched(null)
    try {
      const result = await gateway.request<{
        token: string
        drafts?: PetDraft[]
      }>(
        'pet.generate',
        {
          ...profileParams(profile),
          prompt: prompt.trim(),
          count,
          style,
          ...(provider ? { provider } : {}),
          ...(referenceImage ? { referenceImage } : {}),
        },
        { timeoutMs: 420_000 },
      )
      setToken(result.token)
      setDrafts(result.drafts ?? [])
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : String(generateError),
      )
    } finally {
      setBusy('')
    }
  }

  async function hatch() {
    if (!gateway || !token || selectedDraft == null || !petName.trim()) return
    const cancelToken = petHatchCancelToken(token)
    setBusy('hatch')
    setError('')
    setHatchProgress('Warming the egg')
    try {
      const result = await gateway.request<HatchedPet>(
        'pet.hatch',
        {
          ...profileParams(profile),
          token,
          index: selectedDraft,
          cancelToken,
          name: petName.trim(),
          description: description.trim(),
          prompt: prompt.trim(),
          style,
          ...(provider ? { provider } : {}),
        },
        { timeoutMs: 3_600_000 },
      )
      setHatched(result)
      setHatchProgress('Hatched and ready to adopt')
      await refresh()
    } catch (hatchError) {
      setError(
        hatchError instanceof Error ? hatchError.message : String(hatchError),
      )
      setHatchProgress('')
    } finally {
      setBusy('')
    }
  }

  if (!gateway) {
    return (
      <p className="advanced-copy">
        Connect to a pet-capable Hermes host to open Petdex.
      </p>
    )
  }

  return (
    <details className="petdex-panel">
      <summary>
        <span>
          <strong>Petdex</strong>
          <small>
            {gallery
              ? `${gallery.pets.length} pets · ${gallery.active || 'none active'}`
              : 'Gallery and hatching'}
          </small>
        </span>
        <span className="disclosure-glyph">+</span>
      </summary>
      <div className="petdex-body">
        <div className="petdex-toolbar">
          <input
            placeholder="Search Petdex"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            disabled={loading || Boolean(busy)}
            onClick={() => void refresh()}
            type="button"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          {gallery?.enabled && (
            <button
              disabled={Boolean(busy)}
              onClick={() =>
                void mutate('disable', () =>
                  gateway.request('pet.disable', profileParams(profile)),
                )
              }
              type="button"
            >
              Hide active pet
            </button>
          )}
        </div>
        {error && <p className="inline-error">{error}</p>}
        <div className="petdex-grid">
          {visiblePets.map((pet) => (
            <article
              className={`petdex-card ${gallery?.active === pet.slug ? 'active' : ''}`}
              key={pet.slug}
            >
              <div className="petdex-thumb">
                <PetThumbnail
                  gateway={gateway}
                  onChanged={onChanged}
                  pet={pet}
                  profile={profile}
                />
              </div>
              <strong>{pet.displayName}</strong>
              <small>
                {[
                  pet.generated ? 'Hatched' : pet.curated ? 'Curated' : '',
                  pet.installed ? 'Installed' : 'Petdex',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </small>
              <div className="petdex-actions">
                <button
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void mutate(`select:${pet.slug}`, () =>
                      gateway.request(
                        'pet.select',
                        { ...profileParams(profile), slug: pet.slug },
                        { timeoutMs: 120_000 },
                      ),
                    )
                  }
                  type="button"
                >
                  {gallery?.active === pet.slug
                    ? 'Active'
                    : pet.installed
                      ? 'Use'
                      : 'Adopt'}
                </button>
                {pet.installed && (
                  <button
                    disabled={Boolean(busy)}
                    onClick={async () => {
                      const name = window
                        .prompt('Rename this pet', pet.displayName)
                        ?.trim()
                      if (name)
                        await mutate(`rename:${pet.slug}`, () =>
                          gateway.request('pet.rename', {
                            ...profileParams(profile),
                            slug: pet.slug,
                            name,
                          }),
                        )
                    }}
                    type="button"
                  >
                    Rename
                  </button>
                )}
                {pet.installed && (
                  <button
                    disabled={Boolean(busy)}
                    onClick={() =>
                      void mutate(`export:${pet.slug}`, async () => {
                        const result = await gateway.request<{
                          filename: string
                          zipBase64: string
                        }>('pet.export', {
                          ...profileParams(profile),
                          slug: pet.slug,
                        })
                        await saveDataUrl(
                          `data:application/zip;base64,${result.zipBase64}`,
                          result.filename,
                          'application/zip',
                        )
                      })
                    }
                    type="button"
                  >
                    Export
                  </button>
                )}
                {(pet.installed || pet.generated) && (
                  <button
                    disabled={Boolean(busy)}
                    onClick={() => {
                      if (window.confirm(`Remove ${pet.displayName}?`)) {
                        void mutate(`remove:${pet.slug}`, () =>
                          gateway.request('pet.remove', {
                            ...profileParams(profile),
                            slug: pet.slug,
                          }),
                        )
                      }
                    }}
                    type="button"
                  >
                    Remove
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>

        <details className="pet-hatch-panel">
          <summary>
            <span>
              <strong>Hatch a new pet</strong>
              <small>Generate a look, incubate the animation, then adopt</small>
            </span>
            <span className="disclosure-glyph">+</span>
          </summary>
          <div className="pet-hatch-body">
            {!genAvailable && (
              <p className="support-inline-warning">
                This host has no reference-capable image provider configured for
                pet generation.
              </p>
            )}
            <label>
              <span>Concept</span>
              <textarea
                rows={4}
                placeholder="A tiny moon moth mechanic with a battered tool belt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </label>
            <label>
              <span>Reference image</span>
              <input
                accept="image/*"
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file)
                    void readFileDataUrl(file)
                      .then(setReferenceImage)
                      .catch((error) => setError(String(error)))
                }}
              />
            </label>
            <div className="setting-grid">
              <label>
                <span>Provider</span>
                <select
                  value={provider}
                  onChange={(event) => setProvider(event.target.value)}
                >
                  <option value="">Host default</option>
                  {providers.map((row) => (
                    <option key={row.name} value={row.name}>
                      {row.label || row.name}
                      {row.default ? ' · default' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Style</span>
                <select
                  value={style}
                  onChange={(event) => setStyle(event.target.value)}
                >
                  <option value="auto">Auto</option>
                  <option value="pixel-art">Pixel art</option>
                  <option value="soft">Soft mascot</option>
                  <option value="retro">Retro game</option>
                </select>
              </label>
              <label>
                <span>Drafts</span>
                <select
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value))}
                >
                  {[1, 2, 3, 4].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              className="primary-button"
              disabled={
                !genAvailable ||
                Boolean(busy) ||
                (!prompt.trim() && !referenceImage)
              }
              onClick={() => void generate()}
              type="button"
            >
              {busy === 'generate' ? 'Generating drafts…' : 'Generate drafts'}
            </button>
            {busy === 'generate' && token && (
              <button
                onClick={() => void gateway.request('pet.cancel', { token })}
                type="button"
              >
                Stop generation
              </button>
            )}
            {drafts.length > 0 && (
              <div className="pet-draft-grid">
                {drafts.map((draft) => (
                  <button
                    aria-pressed={selectedDraft === draft.index}
                    key={draft.index}
                    onClick={() => setSelectedDraft(draft.index)}
                    type="button"
                  >
                    <img
                      alt={`Pet draft ${draft.index + 1}`}
                      src={draft.dataUri}
                    />
                  </button>
                ))}
              </div>
            )}
            {selectedDraft != null && !hatched && (
              <div className="pet-hatch-form">
                <label>
                  <span>Name</span>
                  <input
                    maxLength={80}
                    value={petName}
                    onChange={(event) => setPetName(event.target.value)}
                  />
                </label>
                <label>
                  <span>Description</span>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
                <button
                  className="primary-button"
                  disabled={Boolean(busy) || !petName.trim()}
                  onClick={() => void hatch()}
                  type="button"
                >
                  {busy === 'hatch' ? 'Hatching…' : 'Hatch selected pet'}
                </button>
              </div>
            )}
            {(busy === 'hatch' || hatchProgress) && (
              <div className="pet-incubator" aria-live="polite">
                <span className="pet-egg" aria-hidden="true">
                  ◇
                </span>
                <strong>{hatchProgress || 'Hatching'}</strong>
                {busy === 'hatch' && (
                  <button
                    onClick={() =>
                      void gateway.request('pet.cancel', {
                        token: petHatchCancelToken(token),
                      })
                    }
                    type="button"
                  >
                    Stop hatching
                  </button>
                )}
              </div>
            )}
            {hatched && (
              <div className="pet-hatched-result">
                {gallery?.pets.find((pet) => pet.slug === hatched.slug) && (
                  <div className="petdex-thumb">
                    <PetThumbnail
                      gateway={gateway}
                      onChanged={onChanged}
                      pet={gallery.pets.find(
                        (pet) => pet.slug === hatched.slug,
                      )!}
                      profile={profile}
                    />
                  </div>
                )}
                <strong>{hatched.displayName} hatched.</strong>
                {hatched.warnings?.map((warning) => (
                  <small key={warning}>{warning}</small>
                ))}
                <div className="petdex-actions">
                  <button
                    className="primary-button"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      void mutate('adopt-hatched', () =>
                        gateway.request('pet.select', {
                          ...profileParams(profile),
                          slug: hatched.slug,
                        }),
                      ).then((success) => {
                        if (success) setHatched(null)
                      })
                    }
                    type="button"
                  >
                    Adopt now
                  </button>
                  <button
                    disabled={Boolean(busy)}
                    onClick={() =>
                      void mutate('discard-hatched', () =>
                        gateway.request('pet.remove', {
                          ...profileParams(profile),
                          slug: hatched.slug,
                        }),
                      ).then((success) => {
                        if (success) setHatched(null)
                      })
                    }
                    type="button"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}
          </div>
        </details>
      </div>
    </details>
  )
}
