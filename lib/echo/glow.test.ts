import { describe, expect, it } from 'vitest'
import { glowCardStyle, goalSubtitle, isPersonTag, kindForCategory, personLabelSet, timeChipLabel } from './glow'

describe('kindForCategory', () => {
  it('maps categories to kinds', () => {
    expect(kindForCategory('note')).toBe('note')
    expect(kindForCategory('Meal')).toBe('health')
    expect(kindForCategory('reminder')).toBe('reminder')
    expect(kindForCategory('general')).toBeNull()
    expect(kindForCategory(undefined)).toBeNull()
  })
})

describe('isPersonTag', () => {
  const people = personLabelSet(['Ana', ' Mama ', '', undefined])
  it('matches trimmed, case-insensitive labels', () => {
    expect(isPersonTag(' ana ', people)).toBe(true)
    expect(isPersonTag('MAMA', people)).toBe(true)
    expect(isPersonTag('', people)).toBe(false)
    expect(isPersonTag('  ', people)).toBe(false)
    expect(isPersonTag('Guitar', people)).toBe(false)
  })
})

describe('glowCardStyle', () => {
  it('uses the kind color', () => {
    const s = glowCardStyle('goal')
    expect(String(s.background)).toContain('#fbbf24')
    expect(String(s.background)).toContain('transparent 60%')
    expect(String(s.borderColor)).toContain('#fbbf24')
  })
})

describe('timeChipLabel', () => {
  const now = new Date(2026, 10, 4, 9)
  it('formats today, tomorrow and later', () => {
    expect(timeChipLabel(new Date(2026, 10, 4, 15), now)).toBe('3:00 PM')
    expect(timeChipLabel(new Date(2026, 10, 5, 15), now)).toBe('Tomorrow 3:00 PM')
    expect(timeChipLabel(new Date(2026, 10, 6, 15, 30), now)).toBe('Nov 6, 3:30 PM')
  })
})

describe('goalSubtitle', () => {
  it('adds the local due date when there is one', () => {
    expect(goalSubtitle(40, '2027-03-01')).toBe('40% · due Mar 1')
    expect(goalSubtitle(0, '2026-12-25')).toBe('0% · due Dec 25')
  })
  it('shows only the percent without a readable date', () => {
    expect(goalSubtitle(75)).toBe('75%')
    expect(goalSubtitle(75, '')).toBe('75%')
    expect(goalSubtitle(75, 'next spring')).toBe('75%')
  })
})
