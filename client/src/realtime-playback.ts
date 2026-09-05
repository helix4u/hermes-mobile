export interface RealtimePlaybackProbe {
  /** Monotonic evidence that inbound audio media is still arriving. */
  sample: () => Promise<number | null>
  /** Reattach the same remote stream without creating a second audio owner. */
  rebind: () => void
  /** Injectable so the watchdog is deterministic in tests. */
  settle?: () => Promise<void>
}

const playbackSettle = () => new Promise<void>(resolve => setTimeout(resolve, 2_500))

/**
 * Read a monotonic inbound-audio counter. HTMLMediaElement "playing" is not
 * sufficient for WebRTC because one continuous MediaStream can remain playing
 * while a later response buffer stops delivering media.
 */
export async function sampleInboundAudio(peer: RTCPeerConnection): Promise<number | null> {
  try {
    const report = await peer.getStats()
    let found = false
    let total = 0
    report.forEach(raw => {
      const stat = raw as RTCStats & {
        bytesReceived?: number
        kind?: string
        mediaType?: string
        packetsReceived?: number
      }
      if (stat.type !== 'inbound-rtp' || (stat.kind ?? stat.mediaType) !== 'audio') return
      const bytes = Number(stat.bytesReceived)
      const packets = Number(stat.packetsReceived)
      if (Number.isFinite(bytes)) {
        found = true
        total += bytes
      } else if (Number.isFinite(packets)) {
        found = true
        total += packets
      }
    })
    return found ? total : null
  } catch {
    return null
  }
}

/** Own the media element, separately from generation and the microphone. */
export function watchRealtimePlayback(
  audio: HTMLAudioElement,
  allowed: () => boolean,
  trace: (phase: string) => void,
  failed: () => void,
  probe?: RealtimePlaybackProbe,
) {
  let disposed = false, pending = false, pauseRecoveries = 0, probeGeneration = 0
  const play = async () => {
    if (disposed || pending || !allowed()) return
    pending = true
    try { await audio.play() }
    catch { if (!disposed && allowed()) failed() }
    finally { pending = false }
  }
  const pause = () => {
    if (disposed || !allowed()) return
    trace('output.unexpected_pause')
    if (pauseRecoveries++ < 1) void play()
    else failed()
  }
  const playing = () => trace('output.media_playing')
  const waiting = () => trace('output.media_waiting')
  const monitor = async (generation: number) => {
    if (!probe) return
    const settle = probe.settle ?? playbackSettle
    let baseline = await probe.sample()
    if (baseline === null) {
      trace('output.media_unobservable')
      return
    }
    let rebound = false
    while (!disposed && generation === probeGeneration && allowed()) {
      await settle()
      if (disposed || generation !== probeGeneration || !allowed()) return
      const next = await probe.sample()
      if (disposed || generation !== probeGeneration || !allowed()) return
      if (next === null) {
        trace('output.media_unobservable')
        return
      }
      if (next > baseline) {
        trace(rebound ? 'output.media_recovered' : 'output.media_progress')
        baseline = next
        continue
      }
      trace('output.media_stalled')
      if (rebound) {
        failed()
        return
      }
      rebound = true
      probe.rebind()
      audio.muted = false
      audio.volume = 1
      await play()
      baseline = await probe.sample() ?? next
    }
  }
  audio.addEventListener('pause', pause)
  audio.addEventListener('playing', playing)
  audio.addEventListener('waiting', waiting)
  return {
    begin() {
      pauseRecoveries = 0
      audio.muted = false
      audio.volume = 1
      const generation = ++probeGeneration
      void play()
      void monitor(generation)
    },
    dispose() {
      disposed = true
      probeGeneration++
      audio.removeEventListener('pause', pause)
      audio.removeEventListener('playing', playing)
      audio.removeEventListener('waiting', waiting)
    },
  }
}
