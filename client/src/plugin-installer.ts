import type { MobileCapabilities } from './protocol/types'
import {
  bundledPluginBytes,
  MOBILE_PLUGIN_FILES,
  MOBILE_PLUGIN_VERSION,
  type BundledPluginFile,
} from './plugin-package'
import type { HermesTransport } from './transport/hermes-transport'

export const MANAGED_FILE_UPLOAD_LIMIT_BYTES = 100 * 1024 * 1024

export interface ManagedFilesListing {
  path?: string
  root?: string | null
  locked_root?: string | null
  can_change_path?: boolean
}

export interface MobilePluginHostInspection {
  capabilities: MobileCapabilities
  installed: boolean
  installedVersion: string
  managedRoot: string
  targetPath: string
  canUpload: boolean
  uploadUnavailableReason: string
  canForceUpdate: boolean
  forceUpdateUnavailableReason: string
}

export interface MobilePluginInstallProgress {
  phase: 'uploading' | 'enabling'
  completed: number
  total: number
  relativePath?: string
}

export interface MobilePluginInstallResult {
  targetPath: string
  fileCount: number
  byteCount: number
  version: string
  restartRequired: boolean
  operation: 'install' | 'force-update'
}

interface AgentPluginHubEntry {
  name?: string
  path?: string
}

interface AgentPluginsHub {
  plugins?: AgentPluginHubEntry[]
}

export function mobilePluginUploadUnavailableReason(
  inspection: MobilePluginHostInspection,
): string {
  if (inspection.installed || inspection.canUpload) return ''
  return (
    inspection.uploadUnavailableReason ||
    'This host does not expose managed file upload.'
  )
}

interface ManagedFileUploadResponse {
  ok?: boolean
  path?: string
  entry?: {
    path?: string
    size?: number | null
  }
}

function pathSeparator(root: string): '/' | '\\' {
  return root.includes('\\') && !root.includes('/') ? '\\' : '/'
}

function trimTrailingSeparators(value: string): string {
  if (/^[A-Za-z]:[\\/]?$/.test(value)) {
    return `${value.slice(0, 2)}\\`
  }
  return value.replace(/[\\/]+$/, '')
}

export function joinManagedPath(root: string, ...parts: string[]): string {
  const cleanRoot = trimTrailingSeparators(root.trim())
  if (!cleanRoot) throw new Error('The host did not report a managed files root')
  const separator = pathSeparator(cleanRoot)
  const cleanParts = parts.map(part => part.replace(/^[\\/]+|[\\/]+$/g, ''))
  return [cleanRoot, ...cleanParts].filter(Boolean).join(separator)
}

export function assertSafePluginFile(file: BundledPluginFile): void {
  const path = file.relativePath.trim()
  if (
    !path ||
    path.startsWith('/') ||
    path.startsWith('\\') ||
    /^[A-Za-z]:/.test(path) ||
    path.split(/[\\/]/).some(part => !part || part === '.' || part === '..')
  ) {
    throw new Error(`Unsafe bundled plugin path: ${file.relativePath}`)
  }
  const size = new TextEncoder().encode(file.content).byteLength
  if (size > MANAGED_FILE_UPLOAD_LIMIT_BYTES) {
    throw new Error(`${path} exceeds the host upload limit`)
  }
}

export function resolveManagedPluginTarget(
  listing: ManagedFilesListing,
): { managedRoot: string; targetPath: string } {
  const managedRoot = String(
    listing.locked_root ||
      (listing.can_change_path === false
        ? listing.root || listing.path
        : '') ||
      '',
  ).trim()
  if (!managedRoot) {
    throw new Error(
      'This host does not expose a locked Hermes data root, so Mobile will not guess where to install the plugin.',
    )
  }
  return {
    managedRoot,
    targetPath: joinManagedPath(managedRoot, 'plugins', 'hermes-mobile'),
  }
}

function utf8DataUrl(content: string): string {
  const bytes = new TextEncoder().encode(content)
  const chunks: string[] = []
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(index, index + chunkSize)),
    )
  }
  return `data:text/plain;charset=utf-8;base64,${btoa(chunks.join(''))}`
}

function normalizeComparablePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

function assertPluginTargetPath(value: string): string {
  const target = trimTrailingSeparators(value.trim())
  if (
    !target ||
    !normalizeComparablePath(target).endsWith('/plugins/hermes-mobile')
  ) {
    throw new Error(
      'The host did not report the standard plugins/hermes-mobile directory.',
    )
  }
  return target
}

export function resolveInstalledPluginTarget(hub: AgentPluginsHub): string {
  const plugin = (hub.plugins || []).find(entry => entry.name === 'hermes-mobile')
  if (!plugin?.path) {
    throw new Error('The host plugin registry did not report hermes-mobile.')
  }
  return assertPluginTargetPath(plugin.path)
}

export async function inspectMobilePluginHost(
  transport: HermesTransport,
): Promise<MobilePluginHostInspection> {
  const capabilities = await transport.capabilities()
  const installed =
    capabilities.plugin_version !== '' &&
    capabilities.plugin_version !== 'core-gateway'
  let managedRoot = ''
  let targetPath = ''
  let uploadUnavailableReason = ''
  let forceUpdateUnavailableReason = ''

  if (installed) {
    try {
      const hub = await transport.requestJson<AgentPluginsHub>(
        '/api/dashboard/plugins/hub',
      )
      targetPath = resolveInstalledPluginTarget(hub)
    } catch (error) {
      forceUpdateUnavailableReason =
        error instanceof Error
          ? error.message
          : 'The host plugin registry is unavailable'
    }
  } else {
    try {
      const listing =
        await transport.requestJson<ManagedFilesListing>('/api/files')
      const resolved = resolveManagedPluginTarget(listing)
      managedRoot = resolved.managedRoot
      targetPath = resolved.targetPath
    } catch (error) {
      uploadUnavailableReason =
        error instanceof Error ? error.message : 'Managed upload is unavailable'
    }
  }

  return {
    capabilities,
    installed,
    installedVersion: installed ? capabilities.plugin_version : '',
    managedRoot,
    targetPath,
    canUpload: !installed && Boolean(targetPath),
    uploadUnavailableReason,
    canForceUpdate: installed && Boolean(targetPath),
    forceUpdateUnavailableReason,
  }
}

export async function installBundledMobilePlugin(
  transport: HermesTransport,
  targetPath: string,
  onProgress?: (progress: MobilePluginInstallProgress) => void,
  files: readonly BundledPluginFile[] = MOBILE_PLUGIN_FILES,
  forceUpdate = false,
): Promise<MobilePluginInstallResult> {
  const cleanTarget = assertPluginTargetPath(targetPath)
  if (files.length === 0) throw new Error('The bundled plugin is empty')
  files.forEach(assertSafePluginFile)

  for (const [index, file] of files.entries()) {
    onProgress?.({
      phase: 'uploading',
      completed: index,
      total: files.length,
      relativePath: file.relativePath,
    })
    const expectedPath = joinManagedPath(
      cleanTarget,
      ...file.relativePath.split('/'),
    )
    const result = await transport.requestJson<ManagedFileUploadResponse>(
      '/api/files/upload',
      {
        path: expectedPath,
        data_url: utf8DataUrl(file.content),
        overwrite: true,
      },
    )
    const returnedPath = String(result.entry?.path || result.path || '')
    if (
      result.ok !== true ||
      !returnedPath ||
      normalizeComparablePath(returnedPath) !==
        normalizeComparablePath(expectedPath)
    ) {
      throw new Error(
        `The host did not verify the uploaded path for ${file.relativePath}`,
      )
    }
  }

  onProgress?.({
    phase: 'enabling',
    completed: files.length,
    total: files.length,
  })
  await transport.requestJson(
    '/api/dashboard/agent-plugins/hermes-mobile/enable',
    {},
    { method: 'POST' },
  )

  return {
    targetPath: cleanTarget,
    fileCount: files.length,
    byteCount: bundledPluginBytes(files),
    version: MOBILE_PLUGIN_VERSION,
    restartRequired: true,
    operation: forceUpdate ? 'force-update' : 'install',
  }
}

export function formatByteCount(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`
}
