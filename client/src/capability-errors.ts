export function isMissingCapabilityError(error: unknown): boolean {
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    Number((error as { status?: unknown }).status) === 404
  ) {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return (
    /\b404\b/i.test(message) ||
    /\bnot[\s_-]*found\b/i.test(message) ||
    /\bno such api endpoint\b/i.test(message) ||
    /\bHermes RPC\s+-32601\b/i.test(message) ||
    /\bunknown method\b/i.test(message)
  )
}
