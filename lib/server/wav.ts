// Minimal WAV helpers (16-bit PCM only). Pure and dependency-free.

export function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const blockAlign = (channels * bitsPerSample) / 8
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * blockAlign, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

export type WavInfo = { sampleRate: number; channels: number; bitsPerSample: number; dataOffset: number; dataLength: number; durationSec: number }

// Returns null when the buffer is not a parseable PCM WAV.
export function readWavInfo(buf: Buffer): WavInfo | null {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null
  let pos = 12
  let fmt: { sampleRate: number; channels: number; bitsPerSample: number } | null = null
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4)
    const size = buf.readUInt32LE(pos + 4)
    const body = pos + 8
    if (id === 'fmt ' && body + 16 <= buf.length) {
      fmt = { channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bitsPerSample: buf.readUInt16LE(body + 14) }
    } else if (id === 'data') {
      if (!fmt || !fmt.sampleRate || !fmt.channels || !fmt.bitsPerSample) return null
      // Streaming writers may leave a bogus size; clamp to what is present.
      // A size of 0 or 0xFFFFFFFF means "rest of the buffer" so the duration limit cannot be dodged.
      const rest = buf.length - body
      const dataLength = size === 0 || size === 0xffffffff ? rest : Math.min(size, rest)
      const bytesPerSec = (fmt.sampleRate * fmt.channels * fmt.bitsPerSample) / 8
      return { ...fmt, dataOffset: body, dataLength, durationSec: dataLength / bytesPerSec }
    }
    pos = body + size + (size % 2)
  }
  return null
}

// Parse the sample rate from a mime like "audio/L16;codec=pcm;rate=24000".
export function parsePcmRate(mime: string | undefined, fallback = 24000): number {
  const m = /rate=(\d+)/i.exec(mime ?? '')
  return m ? Number(m[1]) : fallback
}

// Linear-interpolation resample of 16-bit mono PCM. Fine for speech-to-text input.
export function resamplePcm16Mono(pcm: Buffer, fromRate: number, toRate: number): Buffer {
  if (fromRate === toRate) return pcm
  const inLen = Math.floor(pcm.length / 2)
  const outLen = Math.floor((inLen * toRate) / fromRate)
  const out = Buffer.alloc(outLen * 2)
  const ratio = fromRate / toRate
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio
    const i0 = Math.min(Math.floor(pos), inLen - 1)
    const i1 = Math.min(i0 + 1, inLen - 1)
    const frac = pos - i0
    const s = pcm.readInt16LE(i0 * 2) * (1 - frac) + pcm.readInt16LE(i1 * 2) * frac
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s))), i * 2)
  }
  return out
}
