import { useState } from 'react'
import type { MobileCapabilities } from '../protocol/types'
import type { BrowserConnection } from '../transport/browser-transport'
import type {
  CloudAgent,
  CloudOrganization,
} from '../transport/native-bridge'
import {
  cloudAgentConnectable,
  cloudAgentStatus,
  isNousCloudAgentUrl,
} from '../state/cloud'

interface ConnectionSheetProps {
  open: boolean
  busy: boolean
  nativeClient: boolean
  connection: BrowserConnection
  capabilities: MobileCapabilities | null
  cloudSignedIn: boolean
  cloudAgents: CloudAgent[]
  cloudOrgs: CloudOrganization[]
  savedConnections: BrowserConnection[]
  onClose: () => void
  onConnectionChange: (connection: BrowserConnection) => void
  onNewDirect: () => void
  onSavedConnection: (connection: BrowserConnection) => Promise<void>
  onEditConnection: (connection: BrowserConnection) => void
  onSaveConnection: () => void
  onDeleteConnection: (connection: BrowserConnection) => Promise<void>
  onConnect: () => Promise<void>
  onDisconnect: () => void
  onCloudLogin: () => Promise<void>
  onCloudLogout: () => Promise<void>
  onCloudDiscover: (org?: string) => Promise<void>
  onCloudAgent: (agent: CloudAgent) => Promise<unknown>
  connected: boolean
}

export function ConnectionSheet(props: ConnectionSheetProps) {
  const [editingId, setEditingId] = useState('')
  if (!props.open) return null
  const {
    busy,
    capabilities,
    cloudAgents,
    cloudOrgs,
    cloudSignedIn,
    connected,
    connection,
    nativeClient,
  } = props
  const nousCloudUrl =
    connection.connectionType !== 'cloud' &&
    isNousCloudAgentUrl(connection.baseUrl)

  return (
    <div
      className="sheet-backdrop"
      onMouseDown={event => {
        if (event.currentTarget === event.target) props.onClose()
      }}
    >
      <section
        aria-label="Connections"
        aria-modal="true"
        className="connection-sheet"
        role="dialog"
      >
        <div className="sheet-handle" />
        <div className="sheet-heading">
          <div>
            <p className="eyebrow">Connections</p>
            <h2>Where Hermes runs</h2>
          </div>
          <button
            aria-label="Close connections"
            className="icon-button"
            onClick={props.onClose}
          >
            ×
          </button>
        </div>

        {props.savedConnections.length > 0 && (
          <div className="connection-section">
            <div className="section-title-row">
              <div>
                <h3>Saved hosts</h3>
                <p>Credentials stay attached to each host on this device.</p>
              </div>
            </div>
            <div className="choice-grid saved-connection-grid">
              {props.savedConnections.map(saved => {
                const selected = saved.id === connection.id
                return (
                  <div className="saved-connection-row" key={saved.id}>
                    <button
                      className={`choice-card ${selected ? 'selected' : ''}`}
                      disabled={busy}
                      onClick={() => {
                        setEditingId('')
                        void props.onSavedConnection(saved)
                      }}
                    >
                      <span className="saved-connection-heading">
                        <strong>{saved.name || 'Hermes host'}</strong>
                        {selected && connected && (
                          <span className="mini-status online">connected</span>
                        )}
                      </span>
                      <small>
                        {saved.connectionType === 'cloud'
                          ? 'Hermes Cloud'
                          : saved.connectionType === 'tailnet'
                            ? 'Tailnet'
                            : 'Direct'}{' '}
                        · {saved.baseUrl.replace(/^https?:\/\//, '')}
                      </small>
                    </button>
                    <div className="saved-connection-actions">
                      <button
                        className="quiet-button"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(saved.id)
                          props.onEditConnection(saved)
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="danger-button"
                        disabled={busy}
                        onClick={() => void props.onDeleteConnection(saved)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <button
              className="quiet-button new-host-button"
              disabled={busy}
              onClick={props.onNewDirect}
            >
              ＋ Add direct or Tailnet host
            </button>
          </div>
        )}

        {nativeClient && (
          <div className="connection-section">
            <div className="section-title-row">
              <div>
                <h3>Hermes Cloud</h3>
                <p>Sign in to connect to your Nous-hosted agents.</p>
              </div>
              <span className={`mini-status ${cloudSignedIn ? 'online' : ''}`}>
                {cloudSignedIn ? 'signed in' : 'signed out'}
              </span>
            </div>
            <div className="button-row">
              {cloudSignedIn ? (
                <>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => void props.onCloudDiscover()}
                  >
                    Load agents
                  </button>
                  <button
                    className="quiet-button"
                    disabled={busy}
                    onClick={() => void props.onCloudLogout()}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void props.onCloudLogin()}
                >
                  Sign in with Nous
                </button>
              )}
            </div>

            {cloudOrgs.length > 0 && (
              <div className="choice-grid">
                {cloudOrgs.map(org => (
                  <button
                    className="choice-card"
                    key={org.id}
                    onClick={() =>
                      void props.onCloudDiscover(org.slug || org.id)
                    }
                  >
                    <strong>{org.name}</strong>
                    <small>Select organization</small>
                  </button>
                ))}
              </div>
            )}

            {cloudAgents.length > 0 && (
              <div className="choice-grid">
                {cloudAgents.map(agent => (
                  <button
                    className="choice-card"
                    disabled={busy || !cloudAgentConnectable(agent)}
                    key={agent.id}
                    onClick={() => void props.onCloudAgent(agent)}
                  >
                    <strong>{agent.name}</strong>
                    <small>{cloudAgentStatus(agent)}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {connection.connectionType === 'cloud' &&
        editingId !== connection.id ? (
          <div className="connection-section cloud-active-card">
            <div>
              <h3>{connection.name}</h3>
              <p>
                This Cloud host is saved. Choose another saved host above or
                add a direct/Tailnet connection.
              </p>
            </div>
            <button
              className="quiet-button"
              disabled={busy}
              onClick={props.onNewDirect}
            >
              ＋ Add direct host
            </button>
          </div>
        ) : (
          <div className="connection-section">
            <div className="section-title-row">
              <div>
                <h3>Connect a host</h3>
                <p>
                  Paste a Nous Cloud agent URL, or use an HTTPS address for a
                  workstation or server.
                </p>
              </div>
            </div>
            <div className="field-grid">
            {connection.connectionType === 'cloud' ? (
              <label>
                <span>Type</span>
                <input disabled value="Hermes Cloud" />
              </label>
            ) : (
              <label>
                <span>Type</span>
                <select
                  value={connection.connectionType}
                  onChange={event =>
                    props.onConnectionChange({
                      ...connection,
                      authMode: 'token',
                      connectionType: event.target.value as
                        | 'direct'
                        | 'tailnet',
                    })
                  }
                >
                  <option value="direct">Direct HTTPS / local</option>
                  <option value="tailnet">Tailnet HTTPS</option>
                </select>
              </label>
            )}
            <label>
              <span>Name</span>
              <input
                value={connection.name}
                onChange={event =>
                  props.onConnectionChange({
                    ...connection,
                    name: event.target.value,
                  })
                }
              />
            </label>
            <label className="wide-field">
              <span>Hermes URL</span>
              <input
                disabled={connection.connectionType === 'cloud'}
                inputMode="url"
                placeholder="https://workstation.example.ts.net"
                value={connection.baseUrl}
                onChange={event =>
                  props.onConnectionChange({
                    ...connection,
                    authMode: 'token',
                    baseUrl: event.target.value,
                  })
                }
              />
            </label>
            <label>
              <span>Profile</span>
              <input
                value={connection.profile}
                onChange={event =>
                  props.onConnectionChange({
                    ...connection,
                    profile: event.target.value,
                  })
                }
              />
            </label>
            {connection.authMode === 'token' && !nousCloudUrl && (
              <label className="wide-field">
                <span>Session token</span>
                <input
                  autoComplete="off"
                  placeholder="Stored by Android Keystore after Connect"
                  type="password"
                  value={connection.token}
                  onChange={event =>
                    props.onConnectionChange({
                      ...connection,
                      token: event.target.value,
                    })
                  }
                />
              </label>
            )}
            {connection.authMode === 'oauth' && (
              <p className="compatibility-line wide-field">
                This host uses gateway sign-in. Connect will reuse the protected
                Android session or open the host's sign-in page when needed.
              </p>
            )}
            {nousCloudUrl && (
              <p className="compatibility-line wide-field">
                Nous Cloud agent detected. Connect will sign in with Nous,
                find this agent in your account, and use its built-in Hermes
                gateway. The Mobile server plugin is not required.
              </p>
            )}
            </div>
            <div className="button-row">
              {editingId === connection.id && (
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => {
                    props.onSaveConnection()
                    setEditingId('')
                  }}
                >
                  Save changes
                </button>
              )}
              {connection.connectionType !== 'cloud' && (
                <button
                  className={
                    editingId === connection.id
                      ? 'quiet-button'
                      : 'primary-button'
                  }
                  disabled={busy}
                  onClick={() => void props.onConnect()}
                >
                  {nousCloudUrl
                    ? 'Connect with Nous'
                    : connected
                      ? 'Reconnect'
                      : 'Connect'}
                </button>
              )}
              {connected && (
                <button className="quiet-button" onClick={props.onDisconnect}>
                  Disconnect
                </button>
              )}
            </div>
            {capabilities && (
              <p className="compatibility-line">
                {capabilities.plugin_version} · Hermes{' '}
                {capabilities.hermes_version} · contract{' '}
                {capabilities.contract_version}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
