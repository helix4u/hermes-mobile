import { afterEach, describe, expect, it, vi } from 'vitest'
import { VoiceEffectsPlayback } from './voice-effects-playback'
import { normalizeVoiceEffects } from './voice-effects-settings'

function fixture(loading?: Promise<void>) {
  const parameter = () => ({ value: 0, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() })
  const stop = vi.fn()
  const processed = { getTracks: () => [{ stop }] } as unknown as MediaStream
  const remote = { getTracks: () => [{ stop }] } as unknown as MediaStream
  const nodes: any[] = []
  const node = () => { const n = { connect: vi.fn((next: unknown) => next), disconnect: vi.fn(),
    gain: parameter(), frequency: parameter(), Q: parameter(),
    positionX: parameter(), positionY: parameter(), positionZ: parameter(),
    port: { postMessage: vi.fn(), close: vi.fn() }, stream: processed,
    onprocessorerror: null }; nodes.push(n); return n }
  vi.stubGlobal('AudioWorkletNode', class { constructor() { return node() } })
  const context = { audioWorklet: { addModule: vi.fn(() => loading ?? Promise.resolve()) },
    createMediaStreamSource: vi.fn(node), createBiquadFilter: node, createGain: node, createPanner: vi.fn(node),
    createMediaStreamDestination: vi.fn(node), resume: vi.fn(async () => {}), close: vi.fn(async () => {}),
    destination: {}, currentTime: 1, sampleRate: 48000, state: 'running', onstatechange: null }
  const factory = vi.fn(() => context as unknown as AudioContext)
  const audio = { muted: false, srcObject: null, play: vi.fn(async () => {}) } as unknown as HTMLAudioElement
  const warning = vi.fn()
  return { owner: new VoiceEffectsPlayback(audio, remote, warning, factory), context, factory, audio, remote, processed, nodes, stop, warning }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('voice effects stream ownership', () => {
  it('crossfades dry and real HRTF spatial output through one final mute gate without rebuilding', async () => {
    const f = fixture()
    await f.owner.update(normalizeVoiceEffects({ enabled: true }))
    const lowpass = f.nodes[5], gate = f.nodes[6], dry = f.nodes[7], panner = f.nodes[8], wet = f.nodes[9]
    expect(f.context.createPanner).toHaveBeenCalledOnce()
    expect(panner).toMatchObject({ panningModel: 'HRTF', distanceModel: 'inverse',
      refDistance: 1, maxDistance: 5, rolloffFactor: 1 })
    expect(lowpass.connect.mock.calls).toEqual([[dry], [panner]])
    expect(dry.connect).toHaveBeenCalledExactlyOnceWith(gate)
    expect(panner.connect).toHaveBeenCalledExactlyOnceWith(wet)
    expect(wet.connect).toHaveBeenCalledExactlyOnceWith(gate)
    expect(gate.connect).toHaveBeenCalledExactlyOnceWith(f.context.destination)
    expect(dry.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 1, 0.015)
    expect(wet.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 1, 0.015)
    await f.owner.update(normalizeVoiceEffects({ enabled: true, spatial: true, spatialPosition: -1, spatialDistance: 2 }))
    expect(dry.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 1, 0.015)
    expect(wet.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 1, 0.015)
    expect(panner.positionX.setTargetAtTime.mock.lastCall[0]).toBeCloseTo(-Math.sqrt(3))
    expect(panner.positionZ.setTargetAtTime.mock.lastCall[0]).toBeCloseTo(-1)
    expect(panner.positionY.setTargetAtTime).toHaveBeenLastCalledWith(0, 1, 0.03)
    await f.owner.update(normalizeVoiceEffects({ enabled: true, spatial: true, spatialPosition: 1, spatialDistance: 5 }))
    expect(panner.positionX.setTargetAtTime.mock.lastCall[0]).toBeCloseTo(5 * Math.sqrt(3) / 2)
    expect(panner.positionZ.setTargetAtTime.mock.lastCall[0]).toBeCloseTo(-2.5)
    expect(f.factory).toHaveBeenCalledOnce()
    expect(f.nodes).toHaveLength(10)
    expect(f.audio.volume).toBe(0)
    f.owner.setMuted(true)
    expect(gate.gain.value).toBe(0)
    expect(gate.gain.cancelScheduledValues).toHaveBeenLastCalledWith(1)
    expect(f.nodes[1].port.postMessage).toHaveBeenLastCalledWith({ type: 'mute', value: true })
    await f.owner.update(normalizeVoiceEffects({ enabled: true, spatial: false }))
    f.owner.rebind(true)
    expect(gate.gain.value).toBe(0)
    expect(f.audio.muted).toBe(true)
    expect(f.audio.volume).toBe(0)
    expect(wet.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 1, 0.015)
    f.owner.setMuted(false)
    expect(gate.gain.value).toBe(1)
    f.owner.dispose()
    expect(gate.gain.value).toBe(0)
    for (const node of f.nodes) expect(node.disconnect).toHaveBeenCalledOnce()
    expect(f.nodes[1].port.close).toHaveBeenCalledOnce()
    expect(f.context.close).toHaveBeenCalledOnce()
    expect(f.stop).not.toHaveBeenCalled()
  })
  it('preserves the spatial mute gate during clock failure and releases every owned node', async () => {
    vi.useFakeTimers()
    const f = fixture()
    await f.owner.update(normalizeVoiceEffects({ enabled: true, spatial: true }))
    f.owner.setMuted(true)
    await vi.advanceTimersByTimeAsync(2500)
    expect(f.audio.volume).toBe(1)
    expect(f.audio.muted).toBe(true)
    expect(f.nodes[6].gain.value).toBe(0)
    for (const node of f.nodes) expect(node.disconnect).toHaveBeenCalledOnce()
    expect(f.context.close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    expect(f.warning).toHaveBeenCalledWith(expect.stringContaining('original voice'))
  })
  it('releases spatial routes on master bypass without stopping the receiver', async () => {
    const f = fixture()
    await f.owner.update(normalizeVoiceEffects({ enabled: true, spatial: true }))
    f.owner.setMuted(true)
    await f.owner.update(normalizeVoiceEffects({ enabled: false, spatial: true }))
    expect(f.audio.volume).toBe(1)
    expect(f.audio.muted).toBe(true)
    expect(f.audio.srcObject).toBe(f.remote)
    for (const node of f.nodes) expect(node.disconnect).toHaveBeenCalledOnce()
    expect(f.context.close).toHaveBeenCalledOnce()
    expect(f.stop).not.toHaveBeenCalled()
  })
  it('falls back muted and releases partial initialization when the spatial node is unavailable', async () => {
    const f = fixture()
    f.owner.setMuted(true)
    f.context.createPanner.mockImplementationOnce(() => { throw new Error('unsupported spatial output') })
    await f.owner.update(normalizeVoiceEffects({ enabled: true, spatial: true }))
    expect(f.audio.srcObject).toBe(f.remote)
    expect(f.audio.volume).toBe(1)
    expect(f.audio.muted).toBe(true)
    for (const node of f.nodes) expect(node.disconnect).toHaveBeenCalledOnce()
    expect(f.nodes[1].port.close).toHaveBeenCalledOnce()
    expect(f.context.close).toHaveBeenCalledOnce()
    expect(f.warning).toHaveBeenCalledWith(expect.stringContaining('original voice'))
    expect(f.stop).not.toHaveBeenCalled()
  })
  it.each(['bypass', 'dispose'] as const)('does not attach a stale clock watch after %s during spatial resume', async action => {
    vi.useFakeTimers()
    let release!: () => void
    const f = fixture()
    f.context.resume.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
    const pending = f.owner.update(normalizeVoiceEffects({ enabled: true, spatial: true }))
    await vi.waitFor(() => expect(f.context.resume).toHaveBeenCalledOnce())
    f.owner.setMuted(true)
    if (action === 'bypass') await f.owner.update(normalizeVoiceEffects(null))
    else f.owner.dispose()
    release(); await pending
    expect(vi.getTimerCount()).toBe(0)
    for (const node of f.nodes) expect(node.disconnect).toHaveBeenCalledOnce()
    expect(f.context.close).toHaveBeenCalledOnce()
    expect(f.stop).not.toHaveBeenCalled()
    expect(f.audio.muted).toBe(true)
  })
  it('falls back visibly if the effect clock never renders despite successful resume', async () => {
    vi.useFakeTimers()
    const f = fixture()
    await f.owner.update(normalizeVoiceEffects({ enabled: true }))
    await vi.advanceTimersByTimeAsync(2500)
    expect(f.audio.srcObject).toBe(f.remote)
    expect(f.audio.volume).toBe(1)
    expect(f.warning).toHaveBeenCalledWith(expect.stringContaining('original voice'))
    expect(f.context.close).toHaveBeenCalledOnce()
  })
  it('uses the original route without creating DSP when effects are off', async () => {
    const f = fixture()
    await f.owner.update(undefined)
    expect(f.factory).not.toHaveBeenCalled()
    expect(f.audio.srcObject).toBe(f.remote)
  })
  it('routes only processed output, updates live pitch, gates immediately and restores bypass', async () => {
    const f = fixture()
    await f.owner.update(normalizeVoiceEffects({ enabled: true, pitch: -4, bass: 3 }))
    expect(f.audio.srcObject).toBe(f.remote)
    expect(f.audio.volume).toBe(0)
    const pitch = f.nodes[1], gain = f.nodes[6]
    expect(gain.connect).toHaveBeenCalledWith(f.context.destination)
    expect(f.context.createMediaStreamDestination).not.toHaveBeenCalled()
    f.owner.setBend(3)
    expect(pitch.port.postMessage).toHaveBeenLastCalledWith({ type: 'pitch', value: -1 })
    f.owner.setMuted(true)
    expect(f.audio.muted).toBe(true)
    expect(gain.gain.value).toBe(0)
    expect(pitch.port.postMessage).toHaveBeenLastCalledWith({ type: 'mute', value: true })
    f.owner.rebind()
    expect(f.audio.srcObject).toBe(f.remote)
    expect(f.audio.volume).toBe(0)
    await f.owner.update(normalizeVoiceEffects(null))
    expect(f.audio.srcObject).toBe(f.remote)
    expect(f.audio.volume).toBe(1)
    expect(f.stop).not.toHaveBeenCalled()
    expect(f.context.close).toHaveBeenCalledOnce()
    expect(f.audio.muted).toBe(true)
  })
  it('closes late initialization after stop without replacing audio or stopping the remote track', async () => {
    let release!: () => void
    const f = fixture(new Promise<void>(resolve => { release = resolve }))
    const started = f.owner.update(normalizeVoiceEffects({ enabled: true }))
    f.owner.dispose(); release(); await started
    expect(f.audio.srcObject).toBe(f.remote)
    expect(f.context.close).toHaveBeenCalledOnce()
    expect(f.stop).not.toHaveBeenCalled()
    expect(f.context.createMediaStreamSource).not.toHaveBeenCalled()
  })
  it('keeps a disabled selection when enable finishes late', async () => {
    let release!: () => void
    const f = fixture(new Promise<void>(resolve => { release = resolve }))
    const pending = f.owner.update(normalizeVoiceEffects({ enabled: true }))
    await f.owner.update(normalizeVoiceEffects(null)); release(); await pending
    expect(f.audio.srcObject).toBe(f.remote)
    expect(f.context.close).toHaveBeenCalledOnce()
  })
  it('reports failed processing and returns to original playback without unmuting an interrupted call', async () => {
    const f = fixture()
    await f.owner.update(normalizeVoiceEffects({ enabled: true, spatial: true }))
    f.owner.setMuted(true)
    f.nodes[1].onprocessorerror()
    expect(f.warning).toHaveBeenCalledWith(expect.stringContaining('original voice'))
    expect(f.audio.srcObject).toBe(f.remote)
    expect(f.audio.muted).toBe(true)
    expect(f.context.close).toHaveBeenCalledOnce()
    for (const node of f.nodes) expect(node.disconnect).toHaveBeenCalledOnce()
    expect(f.nodes[6].gain.value).toBe(0)
    expect(f.stop).not.toHaveBeenCalled()
  })
})
