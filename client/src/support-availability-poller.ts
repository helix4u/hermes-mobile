/** Single-flight discovery. Startup absence is provisional while plugins mount. */
export function pollSupportAvailability(
  probe: () => Promise<'available' | 'missing' | 'unknown'>,
  publish: (value: 'available' | 'missing') => void,
): () => void {
  let stopped = false
  let attempts = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = async () => {
    let result: 'available' | 'missing' | 'unknown' = 'unknown'
    try { result = await probe() } catch { /* Connectivity is not absence. */ }
    if (stopped) return
    attempts += 1
    if (result === 'available') {
      attempts = 5
      publish(result)
    } else if (result === 'missing' && attempts >= 5) publish(result)
    timer = setTimeout(() => void run(), attempts < 5 ? 2_000 : 60_000)
  }
  void run()
  return () => { stopped = true; clearTimeout(timer) }
}
