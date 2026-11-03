import { describe, expect, it } from 'vitest'
import { buildContext, buildProfileSummary, TRAIT_SLOTS } from './context'
import { extractCheckInTime } from './prompt'

const profile = {
  preferredName: 'Peter',
  tone: 'Gentle coach',
  checkInTime: '21:15',
  priorities: ['Family', 'Career'],
  yearGoals: ['Finish thesis'],
  importantPeople: ['Mama', 'Alex'],
}

describe('buildProfileSummary', () => {
  it('emits the check-in line the router parses', () => {
    const s = buildProfileSummary(profile)
    expect(s).toContain('Check-in time: 21:15')
    expect(extractCheckInTime(s)).toBe('21:15')
    expect(s).toContain('Name: Peter')
    expect(s).toContain('Important people: Mama, Alex')
  })
  it('caps at 1500 chars and keeps the check-in line', () => {
    const big = { ...profile, priorities: Array.from({ length: 300 }, (_, i) => `priority number ${i}`), yearGoals: ['g'.repeat(900)] }
    const s = buildProfileSummary(big)
    expect(s.length).toBeLessThanOrEqual(1500)
    expect(extractCheckInTime(s)).toBe('21:15')
  })
  it('handles an empty profile', () => {
    expect(buildProfileSummary({})).toBe('')
  })
})

describe('buildContext', () => {
  it('keeps the last 10 messages, truncated', () => {
    const msgs = Array.from({ length: 15 }, (_, i) => ({ role: 'user' as const, text: `m${i} ` + 'x'.repeat(600) }))
    const c = buildContext(profile, msgs, [])
    expect(c.recentMessages).toHaveLength(10)
    expect(c.recentMessages[0].text.startsWith('m5 ')).toBe(true)
    expect(c.recentMessages[0].text.length).toBe(500)
  })
  it('sorts memories by mentions and caps at 40', () => {
    const mems = Array.from({ length: 50 }, (_, i) => ({ label: `L${i}`, type: 'topic', mentions: i + 1 }))
    const c = buildContext(profile, [], mems)
    expect(c.memoryLabels).toHaveLength(40)
    expect(c.memoryLabels[0]).toEqual({ label: 'L49', type: 'topic', mentions: 50 })
  })
  it('defaults missing mentions to 1', () => {
    expect(buildContext(profile, [], [{ label: 'Mama', type: 'person' }]).memoryLabels[0].mentions).toBe(1)
  })
})

describe('buildContext trait slots', () => {
  const topic = (i: number) => ({ label: `Topic ${i}`, type: 'topic', mentions: 100 + i })
  it('keeps a low-mention trait among many topics, total 40', () => {
    const mems = [...Array.from({ length: 45 }, (_, i) => topic(i)), { label: 'Night owl', type: 'trait', mentions: 1 }]
    const labels = buildContext(profile, [], mems).memoryLabels
    expect(labels).toHaveLength(40)
    expect(labels.some((l) => l.label === 'Night owl')).toBe(true)
  })
  it('caps traits at TRAIT_SLOTS, highest mentions first', () => {
    expect(TRAIT_SLOTS).toBe(10)
    const mems = [...Array.from({ length: 15 }, (_, i) => ({ label: `Trait ${i}`, type: 'trait', mentions: i + 1 })), ...Array.from({ length: 50 }, (_, i) => topic(i))]
    const labels = buildContext(profile, [], mems).memoryLabels
    const traits = labels.filter((l) => l.type === 'trait')
    expect(traits).toHaveLength(10)
    expect(Math.min(...traits.map((t) => t.mentions))).toBe(6)
    expect(labels.filter((l) => l.type === 'topic')).toHaveLength(30)
  })
})
