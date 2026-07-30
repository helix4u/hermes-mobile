import { useCallback, useEffect, useState } from 'react'
import {
  batteryLabel,
  deviceLabel,
  mobileCompanionSummary,
  networkLabel,
} from '../mobile-companion'
import {
  HermesNative,
  isNativeHermesClient,
  type MobileCompanionStatus,
} from '../transport/native-bridge'

interface MobileCompanionSettingsProps {
  onNotice: (message: string) => void
}

export function MobileCompanionSettings({
  onNotice,
}: MobileCompanionSettingsProps) {
  const native = isNativeHermesClient()
  const [status, setStatus] = useState<MobileCompanionStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!native) return
    setLoading(true)
    setError('')
    try {
      setStatus(await HermesNative.getMobileCompanionStatus())
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not read Android device status',
      )
    } finally {
      setLoading(false)
    }
  }, [native])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function openWirelessDebugging() {
    setLoading(true)
    setError('')
    try {
      const result = await HermesNative.openWirelessDebuggingSettings()
      if (!result.opened) {
        throw new Error('Android did not expose its debugging settings')
      }
      const notice = {
        'wireless-debugging': 'Opened Android Wireless debugging.',
        'developer-options':
          'Opened Android developer settings. Select Wireless debugging.',
        settings:
          'Opened Android settings. Open Developer options, then Wireless debugging.',
      }[result.destination]
      onNotice(notice)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not open Android debugging settings',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <details className="control-section">
      <summary>
        <span>
          <strong>Mobile companion</strong>
          <small>{mobileCompanionSummary(status, native)}</small>
        </span>
        <span className="disclosure-glyph">+</span>
      </summary>
      <div className="control-body">
        {!native ? (
          <p className="advanced-copy">
            Device telemetry and Android Wireless debugging shortcuts are
            available in the installed Android app.
          </p>
        ) : (
          <>
            {status && (
              <div className="mobile-companion-grid">
                <span>
                  <small>Device</small>
                  <strong>{deviceLabel(status)}</strong>
                </span>
                <span>
                  <small>Android</small>
                  <strong>
                    {status.androidVersion} · API {status.sdkInt}
                  </strong>
                </span>
                <span>
                  <small>Power</small>
                  <strong>{batteryLabel(status)}</strong>
                </span>
                <span>
                  <small>Connection</small>
                  <strong>{networkLabel(status)}</strong>
                </span>
                <span>
                  <small>Screen</small>
                  <strong>
                    {status.screenInteractive ? 'Interactive' : 'Off or ambient'}
                  </strong>
                </span>
              </div>
            )}
            <p className="advanced-copy">
              Android owns the Wireless debugging switch and rotating ADB port.
              Hermes can open the protected settings screen, but it cannot
              silently turn debugging on. The checked-in workstation helper
              discovers the current port from the paired device.
            </p>
            <div className="request-actions">
              <button
                className="primary-button"
                disabled={
                  loading ||
                  status?.canOpenDebuggingSettings === false
                }
                type="button"
                onClick={() => void openWirelessDebugging()}
              >
                Open Wireless debugging
              </button>
              <button
                className="quiet-button"
                disabled={loading}
                type="button"
                onClick={() => void refresh()}
              >
                {loading ? 'Refreshing…' : 'Refresh device status'}
              </button>
            </div>
          </>
        )}
        {error && <p className="error-message">{error}</p>}
      </div>
    </details>
  )
}
