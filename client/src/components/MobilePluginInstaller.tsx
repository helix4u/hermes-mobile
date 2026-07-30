import { useEffect, useMemo, useState } from 'react'
import {
  formatByteCount,
  inspectMobilePluginHost,
  installBundledMobilePlugin,
  MANAGED_FILE_UPLOAD_LIMIT_BYTES,
  mobilePluginUploadUnavailableReason,
  type MobilePluginHostInspection,
  type MobilePluginInstallProgress,
  type MobilePluginInstallResult,
} from '../plugin-installer'
import {
  bundledPluginBytes,
  MOBILE_PLUGIN_FILES,
  MOBILE_PLUGIN_VERSION,
} from '../plugin-package'
import type { HermesTransport } from '../transport/hermes-transport'

interface MobilePluginInstallerProps {
  connected: boolean
  transport: HermesTransport
  onNotice: (message: string) => void
}

export function MobilePluginInstaller({
  connected,
  onNotice,
  transport,
}: MobilePluginInstallerProps) {
  const [inspection, setInspection] =
    useState<MobilePluginHostInspection | null>(null)
  const [progress, setProgress] =
    useState<MobilePluginInstallProgress | null>(null)
  const [result, setResult] = useState<MobilePluginInstallResult | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const packageBytes = useMemo(() => bundledPluginBytes(), [])

  async function inspect() {
    if (!connected || busy) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const next = await inspectMobilePluginHost(transport)
      setInspection(next)
      setReviewing(false)
    } catch (caught) {
      setInspection(null)
      setError(caught instanceof Error ? caught.message : 'Host check failed')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    setInspection(null)
    setProgress(null)
    setResult(null)
    setReviewing(false)
    setError('')
  }, [transport])

  async function install() {
    if (!inspection?.targetPath || busy) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const installed = await installBundledMobilePlugin(
        transport,
        inspection.targetPath,
        setProgress,
      )
      setResult(installed)
      setReviewing(false)
      onNotice(
        `Hermes Mobile ${installed.version} uploaded and enabled. Restart the Hermes host to activate it.`,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Plugin upload failed')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const summary = result
    ? 'Uploaded, host restart required'
    : inspection?.installed
      ? `Installed ${inspection.installedVersion}`
      : inspection
        ? 'Not installed'
        : 'Check, upload, and enable'
  const uploadUnavailableReason = inspection
    ? mobilePluginUploadUnavailableReason(inspection)
    : ''

  return (
    <details className="control-section">
      <summary>
        <span>
          <strong>Mobile server plugin</strong>
          <small>{summary}</small>
        </span>
        <span className="disclosure-glyph">+</span>
      </summary>
      <div className="control-body plugin-installer">
        <p className="advanced-copy">
          Mobile carries its own {MOBILE_PLUGIN_VERSION} server package. It can
          upload that package through this connection, without GitHub
          credentials or a repository clone.
        </p>

        <div className="plugin-package-facts">
          <span>{MOBILE_PLUGIN_FILES.length} source files</span>
          <span>{formatByteCount(packageBytes)} total</span>
          <span>
            {formatByteCount(MANAGED_FILE_UPLOAD_LIMIT_BYTES)} host per-file
            limit
          </span>
        </div>

        <button
          className="quiet-button"
          disabled={!connected || busy}
          type="button"
          onClick={() => void inspect()}
        >
          {busy && !progress ? 'Checking host…' : 'Check host'}
        </button>

        {inspection && (
          <div className="plugin-status-card">
            <strong>
              {inspection.installed
                ? `Mobile plugin ${inspection.installedVersion} is active`
                : 'Mobile plugin API is not active'}
            </strong>
            <small>
              Hermes {inspection.capabilities.hermes_version || 'version unknown'} ·{' '}
              {inspection.capabilities.status}
            </small>
            {inspection.targetPath && (
              <>
                <span>Upload target</span>
                <code>{inspection.targetPath}</code>
              </>
            )}
            {uploadUnavailableReason && (
              <p className="inline-error">
                {uploadUnavailableReason}
              </p>
            )}
          </div>
        )}

        {inspection?.canUpload &&
          !inspection.installed &&
          !result &&
          !reviewing && (
            <button
              className="primary-button"
              disabled={busy}
              type="button"
              onClick={() => setReviewing(true)}
            >
              Review upload
            </button>
          )}

        {reviewing && inspection?.targetPath && (
          <div className="plugin-confirm-card" role="group">
            <strong>Upload and enable Mobile plugin?</strong>
            <p>
              This overwrites only the bundled plugin files beneath the exact
              target shown above, then enables <code>hermes-mobile</code> in
              the host config. It does not upload credentials.
            </p>
            <p>
              The Hermes host must be restarted afterward because plugin API
              routes are mounted during server startup.
            </p>
            <div className="request-actions">
              <button
                className="quiet-button"
                disabled={busy}
                type="button"
                onClick={() => setReviewing(false)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy}
                type="button"
                onClick={() => void install()}
              >
                Upload and enable
              </button>
            </div>
          </div>
        )}

        {progress && (
          <div className="plugin-progress" aria-live="polite">
            <progress
              max={progress.total + 1}
              value={
                progress.phase === 'enabling'
                  ? progress.total + 1
                  : progress.completed
              }
            />
            <span>
              {progress.phase === 'enabling'
                ? 'Enabling plugin…'
                : `Uploading ${progress.completed + 1} of ${progress.total}: ${progress.relativePath}`}
            </span>
          </div>
        )}

        {result && (
          <div className="plugin-result-card" aria-live="polite">
            <strong>Upload complete</strong>
            <p>
              {result.fileCount} files ({formatByteCount(result.byteCount)})
              were verified and the plugin was enabled.
            </p>
            <p>
              Restart this Hermes host, reconnect, then tap Check host. Mobile
              will report the active plugin version instead of core-gateway.
            </p>
          </div>
        )}

        <p className="advanced-copy">
          This installs the Mobile compatibility plugin. Reader, speech, and
          file-browser routes that belong to Hermes core still depend on the
          host's Hermes version; Mobile reports those route errors separately.
        </p>

        {error && <p className="inline-error">{error}</p>}
      </div>
    </details>
  )
}
