import { describe, expect, it } from 'vitest'
import { buildContext, buildProfileSummary } from './context'
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
