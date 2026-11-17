import { describe, expect, it } from 'vitest'
import { bubbleDelayMs, chatSendGate, deniedGuessOutcome, liveOpenLink, historyForRequest, initialOf, legacyBadgeCount, legacySeenKey, ownerDisplayName } from './legacy-chat-helpers'

describe('bubbleDelayMs', () => {
  it('starts at 600 ms for an empty bubble', () => {
    expect(bubbleDelayMs('')).toBe(600)
  })
  it('adds 25 ms per character', () => {
    expect(bubbleDelayMs('abcd')).toBe(700)
  })
  it('caps at 2500 ms', () => {
    expect(bubbleDelayMs('x'.repeat(1000))).toBe(2500)
    expect(bubbleDelayMs('x'.repeat(76))).toBe(2500)
  })
  it('counts emoji as one character each', () => {
    expect(bubbleDelayMs('🥹🥹')).toBe(650)
  })
})

describe('historyForRequest', () => {
  it('returns the last 20 turns in order', () => {
    const msgs = Array.from({ length: 25 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', text: `m${i}` }))
    const out = historyForRequest(msgs)
    expect(out).toHaveLength(20)
    expect(out[0].text).toBe('m5')
    expect(out[19].text).toBe('m24')
  })
  it('keeps only role and text and drops empty turns', () => {
    const out = historyForRequest([
      { role: 'user', text: 'hi', id: 'x' } as { role: 'user'; text: string },
      { role: 'assistant', text: '   ' },
    ])
    expect(out).toEqual([{ role: 'user', text: 'hi' }])
  })
  it('returns fewer than 20 unchanged', () => {
    expect(historyForRequest([{ role: 'user', text: 'a' }])).toEqual([{ role: 'user', text: 'a' }])
  })
})

describe('legacyBadgeCount', () => {
  it('counts pending requests plus released legacies not yet seen', () => {
    expect(legacyBadgeCount(1, ['a', 'b'], ['a'])).toBe(2)
  })
  it('is zero when nothing is new', () => {
    expect(legacyBadgeCount(0, ['a'], ['a', 'z'])).toBe(0)
  })
  it('counts each released owner once', () => {
    expect(legacyBadgeCount(0, ['a', 'a'], [])).toBe(1)
  })
})

describe('initialOf', () => {
  it('uppercases the first letter', () => {
    expect(initialOf('peter')).toBe('P')
  })
  it('is ? for an empty or blank name', () => {
    expect(initialOf('')).toBe('?')
    expect(initialOf('   ')).toBe('?')
  })
  it('skips leading spaces and keeps a whole emoji', () => {
    expect(initialOf('  ana')).toBe('A')
    expect(initialOf('🌸 Lola')).toBe('🌸')
  })
})

describe('legacySeenKey', () => {
  it('uses the agreed storage key', () => {
    expect(legacySeenKey('abc')).toBe('echo.legacy.seen.abc')
  })
})

describe('ownerDisplayName', () => {
  it('prefers the profile preferred name, then display name, then the link name', () => {
    expect(ownerDisplayName({ preferredName: 'Pete', displayName: 'Peter Cruz' }, 'Peter Cruz')).toBe('Pete')
    expect(ownerDisplayName({ preferredName: '', displayName: 'Peter Cruz' }, 'P')).toBe('Peter Cruz')
    expect(ownerDisplayName(null, ' Peter ')).toBe('Peter')
  })
  it('falls back to "Someone"', () => {
    expect(ownerDisplayName(null, null)).toBe('Someone')
  })
})

describe('chatSendGate', () => {
  it('blocks a send once the legacy is no longer readable', () => {
    expect(chatSendGate(false)).toBe('locked')
  })

  it('sends when readable, or when the check could not tell', () => {
    expect(chatSendGate(true)).toBe('send')
    expect(chatSendGate('unknown')).toBe('send')
  })
})

describe('deniedGuessOutcome', () => {
  it('blames the tries limit only while the legacy is still released', () => {
    expect(deniedGuessOutcome(true)).toBe('tries')
    expect(deniedGuessOutcome(false)).toBe('relocked')
  })
})

describe('liveOpenLink', () => {
  const a = { id: 'o_i', status: 'accepted', shared: ['life'] }
  it('returns the live link by id, with its latest fields', () => {
    const updated = { ...a, shared: ['life', 'health'] }
    expect(liveOpenLink([{ id: 'x', status: 'accepted', shared: [] }, updated], 'o_i')).toBe(updated)
  })

  it('waits while links are loading', () => {
    expect(liveOpenLink(null, 'o_i')).toBe('loading')
  })

  it('reports a removed or no-longer-accepted link as gone', () => {
    expect(liveOpenLink([], 'o_i')).toBe('gone')
    expect(liveOpenLink([{ ...a, status: 'pending' }], 'o_i')).toBe('gone')
  })
})
