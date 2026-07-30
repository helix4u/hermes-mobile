import type { MobileCompanionStatus } from './transport/native-bridge'

export function deviceLabel(
  status: Pick<MobileCompanionStatus, 'manufacturer' | 'model'>,
): string {
  const manufacturer = status.manufacturer.trim()
  const model = status.model.trim()
  if (!manufacturer) return model || 'Android device'
  if (!model) return manufacturer
  if (model.toLowerCase().startsWith(manufacturer.toLowerCase())) return model
  return `${manufacturer} ${model}`
}

export function batteryLabel(
  status: Pick<
    MobileCompanionStatus,
    'batteryPercent' | 'charging' | 'powerSource'
  >,
): string {
  const percent =
    status.batteryPercent === null
      ? 'Battery unknown'
      : `${Math.max(0, Math.min(100, Math.round(status.batteryPercent)))}%`
  if (!status.charging) return percent
  const source =
    status.powerSource === 'battery' || status.powerSource === 'unknown'
      ? ''
      : ` · ${status.powerSource}`
  return `${percent} · charging${source}`
}

export function networkLabel(
  status: Pick<
    MobileCompanionStatus,
    'networkConnected' | 'networkTransport' | 'networkValidated'
  >,
): string {
  if (!status.networkConnected) return 'Offline'
  const transport =
    status.networkTransport === 'none'
      ? 'Network'
      : status.networkTransport.charAt(0).toUpperCase() +
        status.networkTransport.slice(1)
  return status.networkValidated ? `${transport} · online` : `${transport} · local`
}

export function mobileCompanionSummary(
  status: MobileCompanionStatus | null,
  native: boolean,
): string {
  if (!native) return 'Available in the Android app'
  if (!status) return 'Device status and Wireless debugging'
  return `${batteryLabel(status)} · ${networkLabel(status)}`
}
