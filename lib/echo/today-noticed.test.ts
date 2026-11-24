import { describe, expect, it } from 'vitest'
import { dueLabel, noticed } from './today-noticed'

const at = (h: number, m = 0) => new Date(2026, 10, 24, h, m).getTime()
const base = { waterGlasses: 0, waterGoal: 8, sleepStart: '22:00' }

describe('noticed', () => {
  it('flags water behind by 2+ glasses after noon with a +1 glass action', () => {
    // 4 PM: about 5 of 8 glasses would be on pace; 2 drunk is 3 behind.
    const n = noticed({ ...base, nowMs: at(16), waterGlasses: 2 })
    expect(n).not.toBeNull()
    expect(n!.text).toMatch(/water/i)
    expect(n!.action).toEqual({ label: '+1 glass', send: expect.stringMatching(/glass of water/i), direct: 'water' })
  })

  it('says nothing about water before noon, when on pace, or once the goal is met', () => {
    expect(noticed({ ...base, nowMs: at(11, 30), waterGlasses: 0 })).toBeNull()
    expect(noticed({ ...base, nowMs: at(16), waterGlasses: 4 })).toBeNull()
    expect(noticed({ ...base, nowMs: at(21), waterGlasses: 8 })).toBeNull()
  })

  it('says nothing about water during sleep hours', () => {
    expect(noticed({ ...base, nowMs: at(23), waterGlasses: 0 })).toBeNull()
    // Bedtime after midnight: 11 PM is still awake time.
    expect(noticed({ ...base, sleepStart: '01:00', nowMs: at(23), waterGlasses: 0 })).not.toBeNull()
  })

  it('flags a reminder due within 30 minutes', () => {
    const n = noticed({ ...base, nowMs: at(9), nextReminderDueMs: at(9, 15), nextReminderTitle: 'Call Maya' })
    expect(n).not.toBeNull()
    expect(n!.text).toContain('Call Maya')
    expect(n!.text).toContain('15 min')
    const untitled = noticed({ ...base, nowMs: at(9), nextReminderDueMs: at(9, 30) })
    expect(untitled!.text).toMatch(/reminder/i)
  })

  it('puts a reminder that is due soon ahead of water', () => {
    const n = noticed({ ...base, nowMs: at(16), waterGlasses: 0, nextReminderDueMs: at(16, 10), nextReminderTitle: 'Pick up Leo' })
    expect(n!.text).toContain('Pick up Leo')
  })

  it('ignores reminders further out or already past', () => {
    expect(noticed({ ...base, nowMs: at(9), nextReminderDueMs: at(9, 45) })).toBeNull()
    expect(noticed({ ...base, nowMs: at(9), nextReminderDueMs: at(8, 50) })).toBeNull()
  })

  it('returns null when nothing applies', () => {
    expect(noticed({ ...base, nowMs: at(10) })).toBeNull()
  })
})

describe('dueLabel', () => {
  it('reads overdue, minutes within the hour, then a time', () => {
    expect(dueLabel(at(8, 50), at(9))).toBe('Overdue')
    expect(dueLabel(at(9, 15), at(9))).toBe('in 15 min')
    expect(dueLabel(at(9, 0), at(9))).toBe('Now')
    expect(dueLabel(at(18), at(9))).toMatch(/^6:00\sPM$/)
    expect(dueLabel(new Date(2026, 10, 25, 9).getTime(), at(9))).toMatch(/^Tomorrow 9:00\sAM$/)
  })
})
