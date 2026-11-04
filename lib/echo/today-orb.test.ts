import { describe, expect, it } from 'vitest'
import { ORB_KINDS } from './orbs'
import { emptyPageOrb, hasUserMessage } from './today-orb'

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
