import { useCallback, useEffect, useMemo, useState } from 'react'
import type { HermesTransport } from '../transport/hermes-transport'

interface ConfigFieldSchema {
  category?: string
  clearable?: boolean
  description?: string
  options?: unknown[]
  searchable?: boolean
  type?: 'boolean' | 'list' | 'number' | 'select' | 'string' | 'text'
}

interface ConfigSchemaResponse {
  category_order?: string[]
  fields?: Record<string, ConfigFieldSchema>
}

interface HostSettingsProps {
  profile: string
  transport: HermesTransport
  onNotice: (message: string) => void
}

const SECRET_KEY = /(?:api[_-]?key|password|secret|token|credential)/i

function valueAtPath(root: unknown, path: string): unknown {
  let value = root
  for (const part of path.split('.')) {
    if (!value || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[part]
  }
  return value
}

function inputValue(value: unknown, type: ConfigFieldSchema['type']): string {
  if (type === 'list') {
    return Array.isArray(value) ? value.map(String).join('\n') : ''
  }
  if (value === undefined || value === null) return ''
  return String(value)
}

function typedValue(value: string, type: ConfigFieldSchema['type']): unknown {
  if (type === 'number') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : value
  }
  if (type === 'list') {
    return value
      .split(/\r?\n/)
      .map(item => item.trim())
      .filter(Boolean)
  }
  return value
}

export function configPatch(
  path: string,
  value: unknown,
): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  let cursor = root
  const parts = path.split('.')
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      cursor[part] = value
      return
    }
    const child: Record<string, unknown> = {}
    cursor[part] = child
    cursor = child
  })
  return root
}

function optionValue(option: unknown): string {
  if (option && typeof option === 'object') {
    const row = option as Record<string, unknown>
    return String(row.value ?? row.id ?? row.name ?? '')
  }
  return String(option ?? '')
}

function optionLabel(option: unknown): string {
  if (option && typeof option === 'object') {
    const row = option as Record<string, unknown>
    return String(row.label ?? row.name ?? row.value ?? row.id ?? '')
  }
  return String(option ?? '')
}

export function HostSettings({
  onNotice,
  profile,
  transport,
}: HostSettingsProps) {
  const [schema, setSchema] = useState<ConfigSchemaResponse>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingKey, setSavingKey] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query =
        profile && profile !== 'default'
          ? `?profile=${encodeURIComponent(profile)}`
          : ''
      const [schemaResult, configResult] = await Promise.all([
        transport.requestJson<ConfigSchemaResponse>(
          `/api/config/schema${query}`,
        ),
        transport.requestJson<Record<string, unknown>>(`/api/config${query}`),
      ])
      setSchema(schemaResult)
      const nextDrafts: Record<string, string> = {}
      Object.entries(schemaResult.fields ?? {}).forEach(([key, field]) => {
        nextDrafts[key] = inputValue(valueAtPath(configResult, key), field.type)
      })
      setDrafts(nextDrafts)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [profile, transport])

  useEffect(() => {
    void load()
  }, [load])

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase()
    const rows = Object.entries(schema.fields ?? {}).filter(([key, field]) => {
      if (SECRET_KEY.test(key)) return false
      if (!field.type) return false
      if (!query) return true
      return `${key} ${field.description || ''} ${field.category || ''}`
        .toLowerCase()
        .includes(query)
    })
    const order = schema.category_order ?? []
    return [...new Set(rows.map(([, field]) => field.category || 'Other'))]
      .sort((a, b) => {
        const ai = order.indexOf(a)
        const bi = order.indexOf(b)
        if (ai < 0 && bi < 0) return a.localeCompare(b)
        if (ai < 0) return 1
        if (bi < 0) return -1
        return ai - bi
      })
      .map(category => ({
        category,
        fields: rows.filter(([, field]) => (field.category || 'Other') === category),
      }))
  }, [schema, search])

  async function save(key: string, field: ConfigFieldSchema, value: unknown) {
    setSavingKey(key)
    setError('')
    try {
      await transport.requestJson(
        '/api/config',
        {
          config: configPatch(key, value),
          ...(profile && profile !== 'default' ? { profile } : {}),
        },
        { method: 'PUT' },
      )
      const settled = value
      setDrafts(current => ({
        ...current,
        [key]: inputValue(settled, field.type),
      }))
      onNotice(`${key} updated`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSavingKey('')
    }
  }

  return (
    <div className="host-settings">
      <div className="host-settings-toolbar">
        <input
          aria-label="Search host settings"
          placeholder="Search settings"
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
        <button className="quiet-button" disabled={loading} onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {error && <p className="inline-error">{error}</p>}
      {loading && groups.length === 0 ? (
        <p className="section-help">Loading host settings…</p>
      ) : groups.length === 0 ? (
        <p className="section-help">No matching settings.</p>
      ) : (
        groups.map(group => (
          <details className="config-category" key={group.category}>
            <summary>
              <strong>{group.category}</strong>
              <small>{group.fields.length} settings</small>
            </summary>
            <div className="config-field-list">
              {group.fields.map(([key, field]) => {
                const draft = drafts[key] ?? ''
                const disabled = savingKey === key
                return (
                  <div className="config-field" key={key}>
                    <label>
                      <strong>{key}</strong>
                      {field.description && <small>{field.description}</small>}
                      {field.type === 'boolean' ? (
                        <input
                          checked={draft === 'true'}
                          disabled={disabled}
                          type="checkbox"
                          onChange={event => {
                            const value = event.target.checked
                            setDrafts(current => ({
                              ...current,
                              [key]: String(value),
                            }))
                            void save(key, field, value)
                          }}
                        />
                      ) : field.type === 'select' || field.options?.length ? (
                        <select
                          disabled={disabled}
                          value={draft}
                          onChange={event => {
                            const value = event.target.value
                            setDrafts(current => ({ ...current, [key]: value }))
                            void save(key, field, typedValue(value, field.type))
                          }}
                        >
                          {field.clearable && <option value="">Default</option>}
                          {(field.options ?? []).map(option => (
                            <option key={optionValue(option)} value={optionValue(option)}>
                              {optionLabel(option)}
                            </option>
                          ))}
                        </select>
                      ) : field.type === 'text' || field.type === 'list' ? (
                        <textarea
                          disabled={disabled}
                          rows={field.type === 'list' ? 4 : 3}
                          value={draft}
                          onChange={event =>
                            setDrafts(current => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                        />
                      ) : (
                        <input
                          disabled={disabled}
                          inputMode={field.type === 'number' ? 'decimal' : 'text'}
                          type={field.type === 'number' ? 'number' : 'text'}
                          value={draft}
                          onChange={event =>
                            setDrafts(current => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                        />
                      )}
                    </label>
                    {!(
                      field.type === 'boolean' ||
                      field.type === 'select' ||
                      field.options?.length
                    ) && (
                      <button
                        className="quiet-button"
                        disabled={disabled}
                        onClick={() =>
                          void save(key, field, typedValue(draft, field.type))
                        }
                      >
                        {disabled ? 'Saving…' : 'Save'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </details>
        ))
      )}
    </div>
  )
}
