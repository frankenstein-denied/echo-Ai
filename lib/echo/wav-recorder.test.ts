import { describe, expect, it } from 'vitest'
import { concatFloat32, downsample, encodeWav, isSilentRecording, rmsLevel } from './wav-recorder'

describe('downsample', () => {
  it('48k -> 16k gives a third of the samples, preserving DC', () => {
    const out = downsample(new Float32Array(4800).fill(0.5), 48000)
    expect(out.length).toBe(1600)
    expect(out[10]).toBeCloseTo(0.5)
  })
  it('44.1k -> 16k length', () => {
    expect(downsample(new Float32Array(44100), 44100).length).toBe(16000)
  })
  it('passes through when already <= target', () => {
    const a = new Float32Array(10)
    expect(downsample(a, 16000)).toBe(a)
  })
})

describe('encodeWav', () => {
  it('writes a valid 16 kHz mono 16-bit header and clamps', () => {
    const w = encodeWav(new Float32Array([0, 1, -1, 2, -2, 0.5]))
    const v = new DataView(w.buffer)
    const tag = (o: number) => String.fromCharCode(...w.slice(o, o + 4))
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data'])
    expect(w.length).toBe(44 + 12)
    expect(v.getUint32(4, true)).toBe(36 + 12)
    expect(v.getUint16(20, true)).toBe(1)
    expect(v.getUint16(22, true)).toBe(1)
    expect(v.getUint32(24, true)).toBe(16000)
    expect(v.getUint32(28, true)).toBe(32000)
    expect(v.getUint16(34, true)).toBe(16)
    expect(v.getUint32(40, true)).toBe(12)
    expect([1, 2, 3, 4].map((i) => v.getInt16(44 + i * 2, true))).toEqual([32767, -32768, 32767, -32768])
    expect(v.getInt16(44 + 10, true)).toBe(16384)
  })
})

describe('helpers', () => {
  it('concat and rms', () => {
    expect(Array.from(concatFloat32([new Float32Array([1]), new Float32Array([2, 3])]))).toEqual([1, 2, 3])
    expect(rmsLevel(new Float32Array(0))).toBe(0)
    expect(rmsLevel(new Float32Array(100).fill(1))).toBe(1)
  })
})

describe('isSilentRecording', () => {
  it('silent when nothing or a single 128-sample pop is loud', () => {
    expect(isSilentRecording(0, 48000)).toBe(true)
    expect(isSilentRecording(128, 48000)).toBe(true)
    expect(isSilentRecording(128 * 8, 48000)).toBe(true) // ~21 ms
  })
  it('not silent with >= 60 ms of signal', () => {
    expect(isSilentRecording(2880, 48000)).toBe(false)
    expect(isSilentRecording(960, 16000)).toBe(false)
    expect(isSilentRecording(959, 16000)).toBe(true)
  })
})
