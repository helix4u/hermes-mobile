function workspaceKey(connectionId: string): string {
  return `hermes-mobile.workspace.${connectionId}.cwd`
}

export function loadPreferredWorkspace(connectionId: string): string {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(workspaceKey(connectionId))?.trim() || ''
}

export function persistPreferredWorkspace(
  connectionId: string,
  cwd: string,
): void {
  const value = cwd.trim()
  if (!value) {
    window.localStorage.removeItem(workspaceKey(connectionId))
    return
  }
  window.localStorage.setItem(workspaceKey(connectionId), value)
}

export function sessionCreateParams({
  cols = 100,
  cwd,
  preview,
  profile,
}: {
  cols?: number
  cwd: string
  preview?: string
  profile: string
}): Record<string, unknown> {
  const resolvedCwd = cwd.trim()
  return {
    profile: profile === 'default' ? '' : profile,
    source: 'hermes-mobile',
    cols,
    ...(resolvedCwd ? { cwd: resolvedCwd } : {}),
    ...(preview ? { preview } : {}),
  }
}
