import rootInit from '../../server-plugin/__init__.py?raw'
import pluginYaml from '../../server-plugin/plugin.yaml?raw'
import dashboardManifest from '../../server-plugin/dashboard/manifest.json?raw'
import dashboardPluginApi from '../../server-plugin/dashboard/plugin_api.py?raw'
import mobileInit from '../../server-plugin/mobile_server/__init__.py?raw'
import mobileApi from '../../server-plugin/mobile_server/api.py?raw'
import mobileCompatibility from '../../server-plugin/mobile_server/compatibility.py?raw'
import mobileContract from '../../server-plugin/mobile_server/contract.py?raw'
import mobileGateway from '../../server-plugin/mobile_server/gateway.py?raw'
import mobileObservers from '../../server-plugin/mobile_server/observers.py?raw'
import mobileTickets from '../../server-plugin/mobile_server/tickets.py?raw'
import mobileTtsAdapter from '../../server-plugin/mobile_server/tts_adapter.py?raw'

export interface BundledPluginFile {
  relativePath: string
  content: string
}

// Keep the discovery files last. A host restart during an interrupted upload
// cannot discover a half-written plugin, and enablement happens only after
// every source file has been verified by the managed-files API.
export const MOBILE_PLUGIN_FILES: readonly BundledPluginFile[] = [
  {
    relativePath: 'dashboard/manifest.json',
    content: dashboardManifest,
  },
  {
    relativePath: 'dashboard/plugin_api.py',
    content: dashboardPluginApi,
  },
  {
    relativePath: 'mobile_server/__init__.py',
    content: mobileInit,
  },
  {
    relativePath: 'mobile_server/api.py',
    content: mobileApi,
  },
  {
    relativePath: 'mobile_server/compatibility.py',
    content: mobileCompatibility,
  },
  {
    relativePath: 'mobile_server/contract.py',
    content: mobileContract,
  },
  {
    relativePath: 'mobile_server/gateway.py',
    content: mobileGateway,
  },
  {
    relativePath: 'mobile_server/observers.py',
    content: mobileObservers,
  },
  {
    relativePath: 'mobile_server/tickets.py',
    content: mobileTickets,
  },
  {
    relativePath: 'mobile_server/tts_adapter.py',
    content: mobileTtsAdapter,
  },
  {
    relativePath: 'plugin.yaml',
    content: pluginYaml,
  },
  {
    relativePath: '__init__.py',
    content: rootInit,
  },
]

export const MOBILE_PLUGIN_VERSION = '0.1.0'

export function bundledPluginBytes(
  files: readonly BundledPluginFile[] = MOBILE_PLUGIN_FILES,
): number {
  const encoder = new TextEncoder()
  return files.reduce(
    (total, file) => total + encoder.encode(file.content).byteLength,
    0,
  )
}
