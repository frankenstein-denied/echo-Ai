// Pure audio helpers for Echo calls: mic capture -> 16 kHz PCM16 chunks, 24 kHz playback scheduling,
// and transcript reveal in step with playback. No browser APIs here, so everything is unit-tested.

export const INPUT_RATE = 16000
export const OUTPUT_RATE = 24000
export const CHUNK_MS = 100
export const INPUT_MIME = `audio/pcm;rate=${INPUT_RATE}`

/**
 * Streaming box-filter downsampler. Keeps a fractional read position across blocks so 128-frame
 * AudioWorklet blocks at 44.1/48 kHz resample without drift or seams.
 */
export class StreamingDownsampler {
  private buf: Float32Array = new Float32Array(0)
  private pos = 0
  constructor(
    readonly inRate: number,
    readonly outRate = INPUT_RATE,
  ) {}

  push(input: Float32Array): Float32Array {
    if (this.outRate >= this.inRate) return input.slice()
    const ratio = this.inRate / this.outRate
    const all = new Float32Array(this.buf.length + input.length)
    all.set(this.buf)
    all.set(input, this.buf.length)
    const out: number[] = []
    let pos = this.pos
    while (true) {
      const start = Math.floor(pos)
      const end = Math.floor(pos + ratio)
      if (end > all.length || start >= all.length) break
      let sum = 0
      const hi = Math.max(start + 1, end)
      for (let j = start; j < hi; j++) sum += all[j]
      out.push(sum / (hi - start))
      pos += ratio
    }
    const drop = Math.min(all.length, Math.floor(pos))
    this.buf = all.slice(drop)
    this.pos = pos - drop
    return Float32Array.from(out)
  }
}

export function floatToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff)
  }
  return out
}

export function pcm16ToFloat(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 0x8000
  return out
}

/** Little-endian bytes of an Int16Array (explicit, independent of platform endianness). */
export function pcm16ToBytes(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(pcm.length * 2)
  const v = new DataView(out.buffer)
  for (let i = 0; i < pcm.length; i++) v.setInt16(i * 2, pcm[i], true)
  return out
}

export function bytesToPcm16(bytes: Uint8Array): Int16Array {
  const n = bytes.length >> 1
  const out = new Int16Array(n)
  const v = new DataView(bytes.buffer, bytes.byteOffset, n * 2)
  for (let i = 0; i < n; i++) out[i] = v.getInt16(i * 2, true)
  return out
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const STEP = 0x8000
  for (let i = 0; i < bytes.length; i += STEP) bin += String.fromCharCode(...bytes.subarray(i, i + STEP))
  return btoa(bin)
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Sample rate from a mime type like "audio/pcm;rate=24000" (default 24 kHz). */
export function rateFromMime(mime: string | undefined, fallback = OUTPUT_RATE): number {
  const m = /rate=(\d+)/i.exec(mime ?? '')
  const r = m ? Number(m[1]) : NaN
  return r >= 8000 && r <= 96000 ? r : fallback
}

/** Server audio chunk (base64 PCM16) -> float samples + rate, ready for an AudioBuffer. */
export function decodeServerAudio(b64: string, mime?: string): { samples: Float32Array; rate: number } {
  return { samples: pcm16ToFloat(bytesToPcm16(base64ToBytes(b64))), rate: rateFromMime(mime) }
}

/**
 * Mic capture pipeline: float blocks at the device rate in, base64 16 kHz PCM16 chunks of CHUNK_MS out.
 */
export class CaptureEncoder {
  private ds: StreamingDownsampler
  private pending: number[] = []
  readonly chunkSamples: number
  constructor(inRate: number, chunkMs = CHUNK_MS) {
    this.ds = new StreamingDownsampler(inRate, INPUT_RATE)
    this.chunkSamples = Math.round((INPUT_RATE * chunkMs) / 1000)
  }

  push(block: Float32Array): string[] {
    const down = this.ds.push(block)
    for (let i = 0; i < down.length; i++) this.pending.push(down[i])
    const out: string[] = []
    while (this.pending.length >= this.chunkSamples) {
      const chunk = Float32Array.from(this.pending.splice(0, this.chunkSamples))
      out.push(bytesToBase64(pcm16ToBytes(floatToPcm16(chunk))))
    }
    return out
  }
}

export const PLAYBACK_LEAD_S = 0.05

/**
 * Gapless playback scheduling math. Each chunk starts exactly where the previous one ends, or a short
 * lead after "now" when the queue has drained (so a late chunk never starts in the past).
 */
export class PlaybackScheduler {
  private next = 0
  constructor(private lead = PLAYBACK_LEAD_S) {}

  schedule(now: number, duration: number): number {
    const start = Math.max(this.next, now + this.lead)
    this.next = start + duration
    return start
  }

  /** Time the last scheduled chunk finishes (0 when nothing was scheduled since reset). */
  get endTime(): number {
    return this.next
  }

  isPlaying(now: number): boolean {
    return this.next > now
  }

  reset(): void {
    this.next = 0
  }
}

/**
 * Text/voice sync. Each output-transcription chunk is attached to the audio chunk it arrived alongside
 * (the latest one scheduled) and is revealed when that audio starts playing. Text that arrives before
 * any audio of the turn waits for the next audio chunk. Reveal order always follows arrival order.
 */
export class TranscriptSync {
  private segments: { text: string; at: number | null }[] = []
  private lastAudioStart: number | null = null

  /** Call when an audio chunk is scheduled; pending (no-audio-yet) text attaches to it. */
  audio(startTime: number): void {
    this.lastAudioStart = startTime
    for (const s of this.segments) if (s.at === null) s.at = startTime
  }

  text(chunk: string): void {
    if (!chunk) return
    this.segments.push({ text: chunk, at: this.lastAudioStart })
  }

  /** Text revealed by time `now`: the longest prefix of segments whose audio has started. */
  revealed(now: number): string {
    let out = ''
    for (const s of this.segments) {
      if (s.at === null || s.at > now) break
      out += s.text
    }
    return out
  }

  /** Everything received so far, revealed or not. */
  full(): string {
    return this.segments.map((s) => s.text).join('')
  }

  /** True when every received segment has been revealed. */
  done(now: number): boolean {
    return this.segments.every((s) => s.at !== null && s.at <= now)
  }

  /** Reveal everything (e.g. text-only output where no audio will follow). */
  flush(now: number): void {
    for (const s of this.segments) if (s.at === null || s.at > now) s.at = now
  }

  reset(): void {
    this.segments = []
    this.lastAudioStart = null
  }
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
