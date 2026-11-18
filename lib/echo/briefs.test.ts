import { describe, expect, it } from 'vitest'
import { BRIEF_TEXT_MAX, RECENT_BRIEFS, briefDayKey, briefOutcome, briefTurnResult, clipBrief, recentBriefTexts, type BriefDoc } from './briefs'

const at = (ms: number) => ({ toMillis: () => ms })

describe('briefDayKey', () => {
  it('uses the local calendar day', () => {
    expect(briefDayKey(new Date(2026, 10, 18, 23, 58))).toBe('2026-11-18')
    expect(briefDayKey(new Date(2026, 10, 19, 0, 1))).toBe('2026-11-19')
  })
})

describe('clipBrief', () => {
  it('trims and caps the length', () => {
    expect(clipBrief('  hi  ')).toBe('hi')
    expect(clipBrief('x'.repeat(1500)).length).toBe(BRIEF_TEXT_MAX)
  })
})

describe('briefOutcome', () => {
  it('saves a finished, uninterrupted brief', () => {
    expect(briefOutcome({ echoText: 'Morning!', completed: true, userSpoke: false })).toBe('save')
  })
  it('marks a brief the user talked over as partial', () => {
    expect(briefOutcome({ echoText: 'Morning!', completed: false, userSpoke: true })).toBe('partial')
  })
  it('marks a completed brief the user also spoke during as partial', () => {
    expect(briefOutcome({ echoText: 'Morning!', completed: true, userSpoke: true })).toBe('partial')
  })
  it('skips a brief hung up before the turn completed', () => {
    expect(briefOutcome({ echoText: 'Morning!', completed: false, userSpoke: false })).toBe('skip')
  })
  it('skips when Echo said nothing', () => {
    expect(briefOutcome({ echoText: '  ', completed: true, userSpoke: false })).toBe('skip')
  })
})

describe('recentBriefTexts', () => {
  it('keeps the newest full, non-empty briefs, newest first', () => {
    const docs: BriefDoc[] = [
      { text: 'oldest', partial: false, createdAt: at(1) },
      { text: 'cut off', partial: true, createdAt: at(9) },
      { text: '   ', partial: false, createdAt: at(8) },
      { text: 'newest', partial: false, createdAt: at(7) },
      { text: 'middle', partial: false, createdAt: at(3) },
    ]
    expect(recentBriefTexts(docs)).toEqual(['newest', 'middle', 'oldest'])
  })
  it('returns at most RECENT_BRIEFS, clipped', () => {
    const docs: BriefDoc[] = [1, 2, 3, 4, 5].map((n) => ({ text: ` brief ${n} `, partial: false, createdAt: at(n) }))
    expect(recentBriefTexts(docs)).toEqual(['brief 5', 'brief 4', 'brief 3'])
    expect(recentBriefTexts(docs)).toHaveLength(RECENT_BRIEFS)
  })
})

describe('briefTurnResult', () => {
  const base = { echoText: 'Good morning. Sunny today.', revealedOnly: false, interrupted: false, userText: '', userCut: false, modelComplete: true, playing: false }
  it('saves a brief that played to the end', () => {
    expect(briefTurnResult(base)).toEqual({ text: 'Good morning. Sunny today.', partial: false })
  })
  it('keeps a barge-in as partial', () => {
    expect(briefTurnResult({ ...base, revealedOnly: true, interrupted: true, modelComplete: false })).toEqual({ text: 'Good morning. Sunny today.', partial: true })
  })
  it('keeps user speech after turnComplete while still playing as partial', () => {
    expect(briefTurnResult({ ...base, revealedOnly: true, userCut: true, playing: true })).toEqual({ text: 'Good morning. Sunny today.', partial: true })
  })
  it('drops a hang-up mid-brief', () => {
    expect(briefTurnResult({ ...base, revealedOnly: true, modelComplete: false, playing: true })).toBeNull()
    expect(briefTurnResult({ ...base, revealedOnly: true, modelComplete: true, playing: true })).toBeNull()
  })
  it('saves a hang-up after the brief fully played', () => {
    expect(briefTurnResult({ ...base, revealedOnly: true, modelComplete: true, playing: false })).toEqual({ text: 'Good morning. Sunny today.', partial: false })
  })
  it('drops an empty brief', () => {
    expect(briefTurnResult({ ...base, echoText: '  ' })).toBeNull()
    expect(briefTurnResult({ ...base, echoText: '', userText: 'hi' })).toBeNull()
  })
})
