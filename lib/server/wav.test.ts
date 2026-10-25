import { describe, expect, it } from 'vitest'
import { parsePcmRate, pcmToWav, readWavInfo, resamplePcm16Mono } from './wav'

const pcm = (n: number) => {
  const b = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) b.writeInt16LE((i * 100) % 20000, i * 2)
  return b
}

describe('wav', () => {
  it('writes a canonical 44-byte header', () => {
    const w = pcmToWav(pcm(100), 24000)
    expect(w.length).toBe(44 + 200)
    expect(w.toString('ascii', 0, 4)).toBe('RIFF')
    expect(w.toString('ascii', 8, 12)).toBe('WAVE')
    expect(w.readUInt32LE(4)).toBe(36 + 200)
    expect(w.readUInt32LE(24)).toBe(24000)
    expect(w.readUInt32LE(28)).toBe(48000)
    expect(w.readUInt32LE(40)).toBe(200)
  })
  it('round-trips through readWavInfo with duration', () => {
    const info = readWavInfo(pcmToWav(pcm(24000), 24000))!
    expect(info).toMatchObject({ sampleRate: 24000, channels: 1, bitsPerSample: 16, dataOffset: 44, dataLength: 48000 })
    expect(info.durationSec).toBeCloseTo(1, 5)
  })
  it('rejects non-WAV input', () => {
    expect(readWavInfo(Buffer.from('not a wav file at all'))).toBeNull()
    expect(readWavInfo(Buffer.alloc(0))).toBeNull()
    expect(readWavInfo(Buffer.from('RIFF....WAVE'))).toBeNull()
  })
  it('resamples to the expected length and rate', () => {
    const out = resamplePcm16Mono(pcm(24000), 24000, 16000)
    expect(out.length / 2).toBe(16000)
    expect(readWavInfo(pcmToWav(out, 16000))!.durationSec).toBeCloseTo(1, 5)
    expect(resamplePcm16Mono(pcm(10), 16000, 16000).length).toBe(20)
  })
  it('parses the rate from a mime type', () => {
    expect(parsePcmRate('audio/L16;codec=pcm;rate=24000')).toBe(24000)
    expect(parsePcmRate('audio/L16;rate=16000')).toBe(16000)
    expect(parsePcmRate(undefined)).toBe(24000)
  })
  it('skips extra chunks and pads odd-sized ones', () => {
    const base = pcmToWav(pcm(100), 16000)
    const odd = Buffer.alloc(8 + 3 + 1)
    odd.write('LIST', 0, 'ascii')
    odd.writeUInt32LE(3, 4)
    const w = Buffer.concat([base.subarray(0, 36), odd, base.subarray(36)])
    const info = readWavInfo(w)!
    expect(info.dataOffset).toBe(36 + 12 + 8)
    expect(info.dataLength).toBe(200)
  })
  it('clamps a truncated data chunk to the bytes present', () => {
    const w = pcmToWav(pcm(100), 16000).subarray(0, 44 + 50)
    expect(readWavInfo(w)!.dataLength).toBe(50)
  })
  it('treats data size 0 or 0xFFFFFFFF as the rest of the buffer', () => {
    for (const size of [0, 0xffffffff]) {
      const w = Buffer.from(pcmToWav(pcm(16000 * 90), 16000))
      w.writeUInt32LE(size, 40)
      expect(readWavInfo(w)!.durationSec).toBeCloseTo(90, 3)
    }
  })
  it('computes duration for stereo and 24-bit audio', () => {
    expect(readWavInfo(pcmToWav(Buffer.alloc(16000 * 4), 16000, 2, 16))!.durationSec).toBeCloseTo(1, 5)
    expect(readWavInfo(pcmToWav(Buffer.alloc(16000 * 3 * 2), 16000, 1, 24))!.durationSec).toBeCloseTo(2, 5)
  })
})
