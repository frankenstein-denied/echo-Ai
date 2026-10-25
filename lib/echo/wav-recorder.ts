export const TARGET_RATE = 16000
export const MAX_RECORD_SECONDS = 60

// Box-filter downsample (averages source samples per output sample) to avoid aliasing.
export function downsample(input: Float32Array, inRate: number, outRate = TARGET_RATE): Float32Array {
  if (outRate >= inRate) return input
  const ratio = inRate / outRate
  const outLen = Math.floor(input.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)))
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    out[i] = sum / (end - start)
  }
  return out
}

// 16-bit PCM mono WAV (44-byte header).
export function encodeWav(samples: Float32Array, sampleRate = TARGET_RATE): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true)
  }
  return new Uint8Array(buf)
}

export function concatFloat32(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

export function rmsLevel(chunk: Float32Array): number {
  if (!chunk.length) return 0
  let s = 0
  for (let i = 0; i < chunk.length; i++) s += chunk[i] * chunk[i]
  return Math.min(1, Math.sqrt(s / chunk.length) * 4)
}

export const LOUD_LEVEL = 0.02
export const MIN_LOUD_MS = 60

// A recording counts as silence unless enough samples (not one click/pop) were above the level threshold.
export function isSilentRecording(loudSamples: number, sampleRate: number, minMs = MIN_LOUD_MS): boolean {
  return loudSamples < (sampleRate * minMs) / 1000
}

export function samplesToWavBlob(samples: Float32Array, inRate: number): Blob {
  return new Blob([encodeWav(downsample(samples, inRate, TARGET_RATE), TARGET_RATE) as BlobPart], { type: 'audio/wav' })
}

const WORKLET_CODE =
  "class P extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}registerProcessor('echo-capture',P)"

export class WavRecorder {
  level = 0
  loudSamples = 0 // samples in chunks above LOUD_LEVEL
  rate = 48000
  private chunks: Float32Array[] = []
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private node: AudioNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private workletUrl: string | null = null
  private active = false

  get silent() {
    return isSilentRecording(this.loudSamples, this.rate)
  }

  get recording() {
    return this.active
  }

  async start(): Promise<void> {
    if (this.active) return
    this.chunks = []
    this.level = 0
    this.loudSamples = 0
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.stream = stream
    try {
      const Ctx: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      this.ctx = ctx
      this.rate = ctx.sampleRate
      if (ctx.state === 'suspended') await ctx.resume()
      const source = ctx.createMediaStreamSource(stream)
      this.source = source
      const onChunk = (c: Float32Array) => {
        this.chunks.push(c)
        this.level = rmsLevel(c)
        if (this.level >= LOUD_LEVEL) this.loudSamples += c.length
      }
      let useWorklet = false
      if (ctx.audioWorklet) {
        try {
          this.workletUrl = URL.createObjectURL(new Blob([WORKLET_CODE], { type: 'application/javascript' }))
          await ctx.audioWorklet.addModule(this.workletUrl)
          const node = new AudioWorkletNode(ctx, 'echo-capture')
          node.port.onmessage = (e: MessageEvent<Float32Array>) => onChunk(e.data)
          source.connect(node)
          this.node = node
          useWorklet = true
        } catch {
          // addModule can fail (CSP blob: restrictions etc.); fall back below.
          if (this.workletUrl) URL.revokeObjectURL(this.workletUrl)
          this.workletUrl = null
        }
      }
      if (!useWorklet) {
        const node = ctx.createScriptProcessor(4096, 1, 1)
        node.onaudioprocess = (e) => onChunk(new Float32Array(e.inputBuffer.getChannelData(0)))
        source.connect(node)
        node.connect(ctx.destination) // required for ScriptProcessor to run; output stays silent
        this.node = node
      }
      this.active = true
    } catch (e) {
      this.release()
      throw e
    }
  }

  async stop(): Promise<Blob> {
    const rate = this.ctx?.sampleRate ?? 48000
    const samples = concatFloat32(this.chunks)
    this.release()
    return samplesToWavBlob(samples, rate)
  }

  cancel(): void {
    this.release()
    this.chunks = []
  }

  private release() {
    this.active = false
    this.level = 0
    try {
      this.node?.disconnect()
    } catch {}
    try {
      this.source?.disconnect()
    } catch {}
    this.stream?.getTracks().forEach((t) => t.stop())
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close().catch(() => undefined)
    if (this.workletUrl) URL.revokeObjectURL(this.workletUrl)
    this.stream = null
    this.ctx = null
    this.node = null
    this.source = null
    this.workletUrl = null
  }
}
