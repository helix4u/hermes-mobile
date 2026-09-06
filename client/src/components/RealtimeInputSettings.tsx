import { useEffect, useState } from 'react'
import { microphoneChoices, type MicrophoneChoice } from '../realtime-input'
import { HermesNative, isNativeHermesClient } from '../transport/native-bridge'

export interface RealtimeInputSettingsProps {
  selected: string
  disabled: boolean
  onChange: (id: string) => void
  onTest?: () => Promise<void>
  status?: string
  level?: number
  onStopTest?: () => void
}

export function RealtimeInputSettings({ selected, disabled, onChange, onTest, status, level, onStopTest }: RealtimeInputSettingsProps) {
  const [devices, setDevices] = useState<MicrophoneChoice[]>([{ id: '', label: 'System default' }])
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [nativeInventory, setNativeInventory] = useState<string[]>([])
  const [communicationRoute, setCommunicationRoute] = useState('')
  useEffect(() => {
    let alive = true
    const media = navigator.mediaDevices
    const refresh = async () => {
      try {
        if (!media?.enumerateDevices) throw new Error('Input discovery unavailable')
        const choices = microphoneChoices(await media.enumerateDevices())
        if (alive) { setDevices(choices); setError(''); setLoaded(true) }
        if (isNativeHermesClient()) {
          try {
            const inventory = await HermesNative.getAudioInputInventory()
            const names: Record<number, string> = { 7: 'Bluetooth call input', 15: 'Built-in microphone', 3: 'Wired headset', 11: 'USB input', 22: 'USB headset', 26: 'Bluetooth LE headset' }
            if (alive) {
              setNativeInventory([...new Set(inventory.inputs.map(input => `${input.label} (${names[input.type] || 'Audio input'})`))])
              setCommunicationRoute(inventory.communicationRoute || '')
            }
          } catch {
            if (alive) { setNativeInventory([]); setCommunicationRoute('') }
          }
        }
      } catch { if (alive) setError('Cannot list microphones. Check microphone permission in Android settings.') }
    }
    void refresh()
    media?.addEventListener?.('devicechange', refresh)
    return () => { alive = false; media?.removeEventListener?.('devicechange', refresh) }
  }, [])
  const missing = selected && !devices.some(device => device.id === selected)
  return <div className="realtime-input-settings">
    <label>Live voice microphone
      <select aria-label="Live voice microphone" disabled={disabled} value={selected}
        onChange={event => onChange(event.target.value)}>
        {devices.map(device => <option key={device.id} value={device.id}>{device.label}</option>)}
        {missing && <option value={selected}>{loaded ? 'Saved microphone not currently listed' : 'Saved microphone (detecting inputs)'}</option>}
      </select>
    </label>
    <small>{error || 'Detected inputs on this device. Applies to the next live voice call, including Support. Android route names can include the paired speaker.'}</small>
    {nativeInventory.length > 0 && <small>Android inputs: {nativeInventory.join('; ')}. The capturing route is shown during a call; Android and browser device identifiers are different.</small>}
    {communicationRoute && <small>Android communication route: {communicationRoute}. This is the OS route, not proof of which microphone WebRTC captured.</small>}
    {onStopTest ? <button type="button" onClick={onStopTest}>Stop mic test</button>
      : onTest && <button type="button" disabled={disabled} onClick={() => void onTest()}>Test microphone locally</button>}
    {status && <div role="status"><span>{status}</span><meter aria-label="Microphone input level" min={0} max={1} value={level || 0} /></div>}
  </div>
}
