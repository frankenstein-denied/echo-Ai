import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SHARED,
  DEMO_MINUTES,
  LEGACY_KINDS,
  LEGACY_QUESTIONS,
  MAX_RELEASE_MINUTES,
  hashAnswer,
  isValidAnswer,
  legacyLinkId,
  memoryTypesFor,
  monthsToMinutes,
  normalizeAnswer,
  questionText,
  releaseOptions,
  shouldStampActivity,
  activityThrottleMs,
  runActivityStamp,
} from './legacy'

describe('normalizeAnswer', () => {
  it('trims and lowercases', () => {
    expect(normalizeAnswer('  Bantay ')).toBe('bantay')
    expect(normalizeAnswer('BANTAY')).toBe('bantay')
  })
  it('uses NFC and locale-free toLowerCase', () => {
    expect(normalizeAnswer('İstanbul')).toBe('İstanbul'.normalize('NFC').toLowerCase())
  })
})

describe('isValidAnswer', () => {
  it('accepts one word with letters, apostrophes and hyphens', () => {
    for (const ok of ['Bantay', "O'Neil", 'Jean-Luc', 'Ñora']) expect(isValidAnswer(ok)).toBe(true)
  })
  it('rejects spaces, empty and over 40 chars', () => {
    for (const bad of ['two words', '', '   ', 'a'.repeat(41)]) expect(isValidAnswer(bad)).toBe(false)
  })
})

describe('hashAnswer', () => {
  it('matches regardless of case and surrounding spaces', async () => {
    expect(await hashAnswer('o_i', 'Bantay')).toBe(await hashAnswer('o_i', ' bantay '))
  })
  it('is salted by link id', async () => {
    expect(await hashAnswer('o_i', 'bantay')).not.toBe(await hashAnswer('o_x', 'bantay'))
  })
  it('equals sha256 hex of linkId:normalized', async () => {
    const h = await hashAnswer('o_i', 'Bantay')
    expect(h).toBe(createHash('sha256').update('o_i:bantay').digest('hex'))
    expect(h).toHaveLength(64)
  })
})

describe('questions', () => {
  it('has stable ids q1..q12 in order', () => {
    expect(LEGACY_QUESTIONS.length).toBeGreaterThanOrEqual(12)
    const ids = LEGACY_QUESTIONS.map(q => q.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.slice(0, 12)).toEqual(Array.from({ length: 12 }, (_, i) => `q${i + 1}`))
  })
  it('looks up text by id', () => {
    expect(questionText('q1')).not.toBeNull()
    expect(questionText('zz')).toBeNull()
  })
})

describe('legacyLinkId', () => {
  it('joins owner and inheritor', () => {
    expect(legacyLinkId('a', 'b')).toBe('a_b')
  })
})

describe('share kinds', () => {
  it('defaults to all but health', () => {
    expect(DEFAULT_SHARED).toEqual(LEGACY_KINDS.filter(k => k !== 'health'))
  })
  it('maps kinds to memory types', () => {
    const types = memoryTypesFor(DEFAULT_SHARED)
    expect(types).not.toContain('health')
    expect(types).toContain('goal')
    expect(types).toContain('person')
    expect(memoryTypesFor(['health'])).toEqual(['health'])
  })
})

describe('release timing', () => {
  it('converts months to minutes', () => {
    expect(monthsToMinutes(1)).toBe(43200)
    // 24 * 30 days = 1,036,800 min; the rules cap (730 days) sits just above it.
    expect(monthsToMinutes(24)).toBe(1_036_800)
  })
  it('keeps every month option within the rules bounds', () => {
    for (const o of releaseOptions(true)) {
      expect(o.minutes).toBeGreaterThanOrEqual(DEMO_MINUTES)
      expect(o.minutes).toBeLessThanOrEqual(MAX_RELEASE_MINUTES)
    }
    expect(releaseOptions(false).map(o => o.minutes)).toEqual([1, 2, 3, 6, 12, 18, 24].map(monthsToMinutes))
    expect(releaseOptions(true)).toHaveLength(8)
  })
  it('offers a 5 minute option only in demo', () => {
    expect(releaseOptions(false)[0].minutes).toBe(43200)
    expect(releaseOptions(true)[0].minutes).toBe(5)
  })
})

describe('shouldStampActivity', () => {
  it('stamps at most once per hour', () => {
    expect(shouldStampActivity(null, 0)).toBe(true)
    expect(shouldStampActivity(0, 3_599_999)).toBe(false)
    expect(shouldStampActivity(0, 3_600_000)).toBe(true)
  })

  it('honours a custom throttle window', () => {
    expect(shouldStampActivity(0, 149_999, 150_000)).toBe(false)
    expect(shouldStampActivity(0, 150_000, 150_000)).toBe(true)
    expect(shouldStampActivity(null, 0, 150_000)).toBe(true)
  })
})

describe('activityThrottleMs', () => {
  it('is half the release period, capped at one hour', () => {
    expect(activityThrottleMs(5)).toBe(150_000)
    expect(activityThrottleMs(43200)).toBe(3_600_000)
    expect(activityThrottleMs(120)).toBe(3_600_000)
    expect(activityThrottleMs(60)).toBe(1_800_000)
  })

  it('defaults to one hour when the period is unknown', () => {
    expect(activityThrottleMs()).toBe(3_600_000)
    expect(activityThrottleMs(null)).toBe(3_600_000)
    expect(activityThrottleMs(0)).toBe(3_600_000)
    expect(activityThrottleMs(Number.NaN)).toBe(3_600_000)
  })
})

describe('runActivityStamp', () => {
  function deps(initial: number | null, write: () => Promise<void>) {
    let stored = initial
    const d = {
      readStamp: () => stored,
      writeStamp: vi.fn((ms: number | null) => { stored = ms }),
      write: vi.fn(write),
      nowMs: 10_000_000,
      throttleMs: 3_600_000,
    }
    return { d, stored: () => stored }
  }

  it('skips inside the throttle window', async () => {
    const { d } = deps(10_000_000 - 1000, () => Promise.resolve())
    expect(await runActivityStamp(d)).toBe('skipped')
    expect(d.write).not.toHaveBeenCalled()
  })

  it('records the stamp before the write so overlapping calls write once', async () => {
    let release!: () => void
    const { d, stored } = deps(null, () => new Promise<void>(r => { release = r }))
    const first = runActivityStamp(d)
    expect(stored()).toBe(10_000_000)
    expect(await runActivityStamp(d)).toBe('skipped')
    release()
    expect(await first).toBe('stamped')
    expect(d.write).toHaveBeenCalledTimes(1)
  })

  it('keeps the stamp when Legacy was never set up', async () => {
    const { d, stored } = deps(null, () => Promise.reject({ code: 'not-found' }))
    expect(await runActivityStamp(d)).toBe('missing')
    expect(stored()).toBe(10_000_000)
  })

  it('rolls the stamp back when the write fails otherwise', async () => {
    const { d, stored } = deps(5, () => Promise.reject({ code: 'unavailable' }))
    expect(await runActivityStamp(d)).toBe('failed')
    expect(stored()).toBe(5)
    const fresh = deps(null, () => Promise.reject(new Error('offline')))
    expect(await runActivityStamp(fresh.d)).toBe('failed')
    expect(fresh.stored()).toBeNull()
  })
})
