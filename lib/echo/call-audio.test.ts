import { describe, expect, it } from 'vitest'
import {
  base64ToBytes,
  bytesToBase64,
  bytesToPcm16,
  CaptureEncoder,
  decodeServerAudio,
  floatToPcm16,
  formatElapsed,
  PlaybackScheduler,
  pcm16ToBytes,
  rateFromMime,
  StreamingDownsampler,
  TranscriptSync,
} from './call-audio'

describe('PCM16 encoding', () => {
  it('clamps and scales floats to int16', () => {
    expect(Array.from(floatToPcm16(Float32Array.from([0, 1, -1, 2, -2, 0.5])))).toEqual([0, 32767, -32768, 32767, -32768, 16384])
  })
  it('round-trips little-endian bytes and base64', () => {
    const pcm = Int16Array.from([0, 1, -1, 32767, -32768, 258])
    const bytes = pcm16ToBytes(pcm)
    expect(Array.from(bytes.slice(0, 4))).toEqual([0, 0, 1, 0])
    expect(Array.from(bytesToPcm16(base64ToBytes(bytesToBase64(bytes))))).toEqual(Array.from(pcm))
  })
  it('decodes server audio and reads the rate from the mime type', () => {
    const b64 = bytesToBase64(pcm16ToBytes(Int16Array.from([16384, -16384])))
    const { samples, rate } = decodeServerAudio(b64, 'audio/pcm;rate=24000')
    expect(rate).toBe(24000)
    expect(Array.from(samples)).toEqual([0.5, -0.5])
    expect(rateFromMime(undefined)).toBe(24000)
    expect(rateFromMime('audio/pcm;rate=16000')).toBe(16000)
    expect(rateFromMime('audio/pcm;rate=5')).toBe(24000)
  })
})

describe('StreamingDownsampler', () => {
  it('48 kHz -> 16 kHz averages groups of 3 across block boundaries', () => {
    const ds = new StreamingDownsampler(48000)
    const a = ds.push(Float32Array.from([3, 3, 3, 6, 6]))
    const b = ds.push(Float32Array.from([6, 9, 9, 9]))
    expect(Array.from(a)).toEqual([3])
    expect(Array.from(b)).toEqual([6, 9])
  })
  it('does not drift for 44.1 kHz in 128-frame blocks', () => {
    const ds = new StreamingDownsampler(44100)
    let n = 0
    const blocks = 3445 // ~10 s
    for (let i = 0; i < blocks; i++) n += ds.push(new Float32Array(128)).length
    const inSamples = blocks * 128
    expect(Math.abs(n - (inSamples * 16000) / 44100)).toBeLessThanOrEqual(1)
  })
  it('passes through when the input rate is already 16 kHz', () => {
    expect(Array.from(new StreamingDownsampler(16000).push(Float32Array.from([0.1, 0.2])))).toEqual([Math.fround(0.1), Math.fround(0.2)])
  })
})

describe('CaptureEncoder', () => {
  it('emits 100 ms (1600-sample) base64 chunks of 16 kHz PCM16', () => {
    const enc = new CaptureEncoder(48000)
    const out: string[] = []
    for (let i = 0; i < 48000 / 128; i++) out.push(...enc.push(new Float32Array(128).fill(0.5)))
    expect(enc.chunkSamples).toBe(1600)
    expect(out.length).toBe(10) // 375 blocks * 128 = 48000 samples -> 16000 at 16 kHz = 10 chunks
    const pcm = bytesToPcm16(base64ToBytes(out[0]))
    expect(pcm.length).toBe(1600)
    expect(pcm[100]).toBe(16384)
  })
})

describe('PlaybackScheduler', () => {
  it('schedules chunks back-to-back without gaps', () => {
    const p = new PlaybackScheduler(0.05)
    const s1 = p.schedule(10, 0.2)
    const s2 = p.schedule(10.01, 0.3)
    const s3 = p.schedule(10.1, 0.1)
    expect(s1).toBeCloseTo(10.05)
    expect(s2).toBeCloseTo(s1 + 0.2)
    expect(s3).toBeCloseTo(s2 + 0.3)
    expect(p.endTime).toBeCloseTo(s3 + 0.1)
    expect(p.isPlaying(10.5)).toBe(true)
    expect(p.isPlaying(11)).toBe(false)
  })
  it('never starts in the past after the queue drained, and resets on barge-in', () => {
    const p = new PlaybackScheduler(0.05)
    p.schedule(0, 0.1)
    expect(p.schedule(5, 0.1)).toBeCloseTo(5.05)
    p.reset()
    expect(p.endTime).toBe(0)
    expect(p.schedule(6, 0.1)).toBeCloseTo(6.05)
  })
})

describe('TranscriptSync', () => {
  it('reveals each text chunk when the audio it arrived with starts', () => {
    const t = new TranscriptSync()
    t.audio(1.0)
    t.text('Hello ')
    t.audio(1.5)
    t.text('there, ')
    t.audio(2.0)
    t.text('friend.')
    expect(t.revealed(0.9)).toBe('')
    expect(t.revealed(1.0)).toBe('Hello ')
    expect(t.revealed(1.7)).toBe('Hello there, ')
    expect(t.done(1.7)).toBe(false)
    expect(t.revealed(2.0)).toBe('Hello there, friend.')
    expect(t.done(2.0)).toBe(true)
    expect(t.full()).toBe('Hello there, friend.')
  })
  it('text that arrives before any audio waits for the next audio chunk', () => {
    const t = new TranscriptSync()
    t.text('Early ')
    expect(t.revealed(100)).toBe('')
    t.audio(3)
    t.text('words')
    expect(t.revealed(2.9)).toBe('')
    expect(t.revealed(3)).toBe('Early words')
  })
  it('keeps arrival order, flushes text-only output and resets', () => {
    const t = new TranscriptSync()
    t.text('a')
    t.text('b')
    t.flush(4)
    expect(t.revealed(4)).toBe('ab')
    t.reset()
    expect(t.full()).toBe('')
    expect(t.done(0)).toBe(true)
  })
})

describe('formatElapsed', () => {
  it('formats m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(65_400)).toBe('1:05')
  })
})
