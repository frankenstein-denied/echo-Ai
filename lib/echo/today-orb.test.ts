import { describe, expect, it } from 'vitest'
import { ORB_KINDS } from './orbs'
import { dropUnansweredCheckIns, emptyPageOrb, hasUserMessage, showTodayWelcome } from './today-orb'

describe('emptyPageOrb', () => {
  it('is an empty pearl orb for the page', () => {
    const o = emptyPageOrb('p')
    expect(o.id).toBe('orb-p')
    expect(o.pageId).toBe('p')
    expect(o.label).toBe('Today')
    expect(o.ms).toBe(0)
    expect(o.messageCount).toBe(0)
    expect(o.members).toEqual([])
    expect(o.radius).toBe(60)
    for (const k of ORB_KINDS) expect(o.counts[k]).toBe(0)
  })
})

describe('hasUserMessage', () => {
  it('is true only when a user message exists', () => {
    expect(hasUserMessage(null)).toBe(false)
    expect(hasUserMessage(undefined)).toBe(false)
    expect(hasUserMessage([])).toBe(false)
    expect(hasUserMessage([{ role: 'assistant' }])).toBe(false)
    expect(hasUserMessage([{ role: 'assistant' }, { role: 'user' }])).toBe(true)
  })
})

describe('showTodayWelcome', () => {
  it('hides the welcome once a check-in is on the page', () => {
    expect(showTodayWelcome([{ role: 'assistant' }])).toBe(true) // onboarding welcome message
    expect(showTodayWelcome([{ role: 'assistant', checkIn: true }])).toBe(false)
    expect(showTodayWelcome([{ role: 'user' }])).toBe(false)
  })
  it('waits for the messages, and shows on an empty page', () => {
    expect(showTodayWelcome(null)).toBe(false)
    expect(showTodayWelcome(undefined)).toBe(false)
    expect(showTodayWelcome([])).toBe(true)
  })
})

describe('dropUnansweredCheckIns', () => {
  it('keeps answered check-ins and the newest one only', () => {
    const a = { role: 'assistant', checkIn: true, text: 'a' }
    const u = { role: 'user', text: 'u' }
    const b = { role: 'assistant', checkIn: true, text: 'b' }
    const c = { role: 'assistant', checkIn: true, text: 'c' }
    expect(dropUnansweredCheckIns([a, u, b, c])).toEqual([a, u, c])
  })
  it('counts only the check-in right before a reply as answered', () => {
    const a = { role: 'assistant', checkIn: true, text: 'a' }
    const b = { role: 'assistant', checkIn: true, text: 'b' }
    const u = { role: 'user', text: 'u' }
    const e = { role: 'assistant', text: 'e' }
    expect(dropUnansweredCheckIns([a, b, u, e])).toEqual([b, u, e])
  })
  it('leaves a page without check-ins alone', () => {
    const msgs = [{ role: 'user' }, { role: 'assistant' }]
    expect(dropUnansweredCheckIns(msgs)).toEqual(msgs)
    expect(dropUnansweredCheckIns([])).toEqual([])
  })
})
