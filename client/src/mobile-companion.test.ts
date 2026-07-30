import { describe, expect, test } from 'vitest'
import {
  batteryLabel,
  deviceLabel,
  mobileCompanionSummary,
  networkLabel,
} from './mobile-companion'
import type { MobileCompanionStatus } from './transport/native-bridge'

const status: MobileCompanionStatus = {
  androidVersion: '16',
  batteryPercent: 71.4,
  canOpenDebuggingSettings: true,
  charging: true,
  manufacturer: 'Samsung',
  model: 'SM-S918U',
  networkConnected: true,
  networkTransport: 'wifi',
  networkValidated: true,
  platform: 'android',
  powerSource: 'usb',
  screenInteractive: true,
  sdkInt: 36,
}

describe('mobile companion presentation', () => {
  test('formats the privacy-safe device facts', () => {
    expect(deviceLabel(status)).toBe('Samsung SM-S918U')
    expect(batteryLabel(status)).toBe('71% · charging · usb')
    expect(networkLabel(status)).toBe('Wifi · online')
  })

  test('distinguishes local-only and disconnected networks', () => {
    expect(
      networkLabel({
        networkConnected: true,
        networkTransport: 'vpn',
        networkValidated: false,
      }),
    ).toBe('Vpn · local')
    expect(
      networkLabel({
        networkConnected: false,
        networkTransport: 'none',
        networkValidated: false,
      }),
    ).toBe('Offline')
  })

  test('keeps browser and native summaries explicit', () => {
    expect(mobileCompanionSummary(null, false)).toBe(
      'Available in the Android app',
    )
    expect(mobileCompanionSummary(status, true)).toContain('71% · charging')
  })
})
