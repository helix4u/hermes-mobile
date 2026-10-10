/** Streaming phase vocoder. Fixed buffers and a 2048-sample analysis window. */
export class VoicePitchProcessor {
  private readonly size = 2048
  private readonly hop = 256
  private readonly latency = this.size - this.hop
  private readonly input = new Float64Array(this.size)
  private readonly output = new Float64Array(this.hop)
  private readonly overlap = new Float64Array(this.size)
  private readonly real = new Float64Array(this.size)
  private readonly imaginary = new Float64Array(this.size)
  private readonly previousPhase = new Float64Array(this.size / 2 + 1)
  private readonly phase = new Float64Array(this.size / 2 + 1)
  private readonly magnitude = new Float64Array(this.size / 2 + 1)
  private readonly frequency = new Float64Array(this.size / 2 + 1)
  private readonly window = Float64Array.from({ length: this.size }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / this.size))
  private position = this.latency
  private pitch = 0
  private target = 0
  private muted = false
  private processing = false
  private readonly smoothing: number

  constructor(private readonly rate: number) { this.smoothing = 1 - Math.exp(-1 / (rate * 0.015)) }
  setPitch(semitones: number): void {
    this.target = Number.isFinite(semitones) ? Math.max(-12, Math.min(12, semitones)) : 0
  }
  setMuted(muted: boolean): void {
    if (muted !== this.muted) this.reset()
    this.muted = muted
  }
  reset(): void {
    for (const buffer of [this.input, this.output, this.overlap, this.previousPhase, this.phase]) buffer.fill(0)
    this.position = this.latency
  }
  private fft(inverse: boolean): void {
    const n = this.size, real = this.real, imaginary = this.imaginary
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1
      for (; j & bit; bit >>= 1) j ^= bit
      j ^= bit
      if (i < j) {
        const r = real[i]!, im = imaginary[i]!
        real[i] = real[j]!; imaginary[i] = imaginary[j]!
        real[j] = r; imaginary[j] = im
      }
    }
    for (let length = 2; length <= n; length *= 2) {
      const angle = (inverse ? 2 : -2) * Math.PI / length
      const rootReal = Math.cos(angle), rootImaginary = Math.sin(angle)
      for (let start = 0; start < n; start += length) {
        let wr = 1, wi = 0
        for (let i = 0; i < length / 2; i++) {
          const a = start + i, b = a + length / 2
          const tr = wr * real[b]! - wi * imaginary[b]!
          const ti = wr * imaginary[b]! + wi * real[b]!
          real[b] = real[a]! - tr; imaginary[b] = imaginary[a]! - ti
          real[a] += tr; imaginary[a] += ti
          const next = wr * rootReal - wi * rootImaginary
          wi = wr * rootImaginary + wi * rootReal; wr = next
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) { real[i] /= n; imaginary[i] /= n }
  }
  private frame(): void {
    const n = this.size, half = n / 2, ratio = 2 ** (this.pitch / 12)
    for (let i = 0; i < n; i++) { this.real[i] = this.input[i]! * this.window[i]!; this.imaginary[i] = 0 }
    this.fft(false)
    this.magnitude.fill(0); this.frequency.fill(0)
    for (let bin = 0; bin <= half; bin++) {
      const phase = Math.atan2(this.imaginary[bin]!, this.real[bin]!)
      const expected = 2 * Math.PI * this.hop * bin / n
      let deviation = phase - this.previousPhase[bin]! - expected
      this.previousPhase[bin] = phase
      deviation -= 2 * Math.PI * Math.round(deviation / (2 * Math.PI))
      const hz = (bin + deviation * n / (2 * Math.PI * this.hop)) * this.rate / n
      const destination = Math.round(bin * ratio)
      if (destination > half) continue
      const magnitude = Math.hypot(this.real[bin]!, this.imaginary[bin]!)
      this.magnitude[destination] += magnitude
      this.frequency[destination] += hz * ratio * magnitude
    }
    this.real.fill(0); this.imaginary.fill(0)
    for (let bin = 0; bin <= half; bin++) {
      const magnitude = this.magnitude[bin]!
      const hz = magnitude > 1e-12 ? this.frequency[bin]! / magnitude : bin * this.rate / n
      this.phase[bin] = (this.phase[bin]! + 2 * Math.PI * this.hop * hz / this.rate) % (2 * Math.PI)
      const phase = this.phase[bin]!
      this.real[bin] = magnitude * Math.cos(phase)
      this.imaginary[bin] = magnitude * Math.sin(phase)
      if (bin > 0 && bin < half) { this.real[n - bin] = this.real[bin]!; this.imaginary[n - bin] = -this.imaginary[bin]! }
    }
    this.fft(true)
    const normalization = this.hop / (n * 0.375)
    for (let i = 0; i < n; i++) this.overlap[i] += this.real[i]! * this.window[i]! * normalization
    this.output.set(this.overlap.subarray(0, this.hop))
    this.overlap.copyWithin(0, this.hop); this.overlap.fill(0, this.latency)
    this.input.copyWithin(0, this.hop)
  }
  process(input: Float32Array | undefined, output: Float32Array): void {
    if (this.muted || !input) { output.fill(0); return }
    if (this.target === 0 && Math.abs(this.pitch) < 0.001) {
      if (this.processing) this.reset()
      this.processing = false
      this.pitch = 0
      for (let i = 0; i < output.length; i++) output[i] = input[i] ?? 0
      return
    }
    this.processing = true
    for (let index = 0; index < output.length; index++) {
      const sample = input[index] ?? 0
      this.pitch += (this.target - this.pitch) * this.smoothing
      this.input[this.position] = sample
      const shifted = this.output[this.position - this.latency]!
      output[index] = Math.max(-1, Math.min(1, shifted))
      this.position++
      if (this.position === this.size) { this.position = this.latency; this.frame() }
    }
  }
}
