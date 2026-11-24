import { describe, expect, it } from 'vitest'
import { goalFraction, goalMeta, nextStepLine, paceLine, progressStep, waterWeekLine, yearFraction } from './goal-pace'

describe('paceLine', () => {
  it('says behind when progress trails the year by more than 10 points', () => {
    expect(paceLine(57, 0.9)).toBe('A bit behind the year')
    expect(paceLine(10, 0.5)).toBe('A bit behind the year')
  })
  it('says on pace within 10 points either way', () => {
    expect(paceLine(50, 0.5)).toBe('On pace')
    expect(paceLine(40, 0.5)).toBe('On pace')
    expect(paceLine(60, 0.5)).toBe('On pace')
  })
  it('says ahead when progress leads by more than 10 points', () => {
    expect(paceLine(75, 0.5)).toBe('Ahead of the year')
  })
  it('clamps odd inputs', () => {
    expect(paceLine(Number.NaN, 0)).toBe('On pace')
    expect(paceLine(100, 2)).toBe('On pace')
  })
})

describe('progressStep', () => {
  it('steps a count-like goal by one item', () => {
    const s = progressStep({ title: 'Read 12 books', progress: 0 })
    expect(s.label).toBe('+1 book')
    expect(s.next).toBeCloseTo(100 / 12)
  })
  it('snaps to the next whole item and reaches exactly 100', () => {
    expect(progressStep({ title: 'Read 12 books', progress: 75 }).next).toBeCloseTo(75 + 100 / 12)
    expect(progressStep({ title: 'Read 12 books', progress: 95 }).next).toBe(100)
    expect(progressStep({ title: 'Read 12 books', progress: 100 }).next).toBe(100)
  })
  it('singularises the item word', () => {
    expect(progressStep({ title: 'Take 20 classes', progress: 0 }).label).toBe('+1 class')
    expect(progressStep({ title: 'Visit 5 countries', progress: 0 }).label).toBe('+1 country')
    expect(progressStep({ title: 'Meditate 30 days', progress: 0 }).label).toBe('+1 day')
  })
  it('falls back to + Progress (+10, capped at 100) for other goals', () => {
    expect(progressStep({ title: 'Run a 10K', progress: 60 })).toEqual({ label: '+ Progress', next: 70 })
    expect(progressStep({ title: 'Save ₱50,000', progress: 30 })).toEqual({ label: '+ Progress', next: 40 })
    expect(progressStep({ title: 'Save ₱1,200 pesos', progress: 30 })).toEqual({ label: '+ Progress', next: 40 })
    expect(progressStep({ title: 'Learn Spanish', progress: 95 })).toEqual({ label: '+ Progress', next: 100 })
  })
  it('ignores units and amounts that are not countable steps', () => {
    expect(progressStep({ title: 'Walk 30 minutes a day', progress: 0 }).label).toBe('+ Progress')
    expect(progressStep({ title: 'Lose 5 kg', progress: 0 }).label).toBe('+ Progress')
    expect(progressStep({ title: 'Walk 10000 steps', progress: 0 }).label).toBe('+ Progress')
    expect(progressStep({ title: 'Do 1 thing', progress: 0 }).label).toBe('+ Progress')
  })
})

describe('goalMeta', () => {
  it('counts items for count-like goals', () => {
    expect(goalMeta({ title: 'Read 12 books', progress: 75, milestones: [] })).toBe('9 of 12')
  })
  it('shows the next milestone and the due date', () => {
    expect(goalMeta({ title: 'Run a 10K', progress: 60, milestones: [{ text: 'Run 5K', done: true }, { text: 'Run 8K', done: false }], targetDate: '2026-12-20' })).toBe('Next: Run 8K · due Dec 20')
  })
  it('falls back to the percent', () => {
    expect(goalMeta({ title: 'Learn Spanish', progress: 42.4, milestones: [] })).toBe('42%')
  })
})

describe('goalFraction', () => {
  const now = new Date(2026, 6, 2, 12).getTime() // ~half the year
  it('uses the year when there is no target date', () => {
    expect(goalFraction({ createdMs: null }, now)).toBeCloseTo(yearFraction(now))
  })
  it('measures from creation to the end of the target day', () => {
    const created = new Date(2026, 6, 1).getTime()
    const f = goalFraction({ createdMs: created, targetDate: '2026-07-04' }, new Date(2026, 6, 2, 12).getTime())
    expect(f).toBeGreaterThan(0.3)
    expect(f).toBeLessThan(0.6)
  })
  it('is 1 past the target date', () => {
    expect(goalFraction({ createdMs: 0, targetDate: '2026-01-01' }, now)).toBe(1)
  })
})

describe('nextStepLine', () => {
  it('names the next milestone of the goal furthest behind', () => {
    const goals = [
      { title: 'Read 12 books', progress: 80, milestones: [] },
      { title: 'Run a 10K', progress: 20, milestones: [{ text: 'Run 8K', done: false }] },
    ]
    expect(nextStepLine(goals)).toBe('Next: Run 8K, for Run a 10K.')
  })
  it('suggests a push when the goal has no open milestone', () => {
    expect(nextStepLine([{ title: 'Learn Spanish', progress: 10, milestones: [] }])).toBe('Give “Learn Spanish” a small push today.')
  })
  it('celebrates when everything is done', () => {
    expect(nextStepLine([{ title: 'A', progress: 100, milestones: [] }])).toBe('Every goal is done. Tell Echo a new one.')
  })
})

describe('waterWeekLine', () => {
  it('compares the average with last week', () => {
    expect(waterWeekLine([6, 6, 6, null, null, null, null], [5, 5, null, null, null, null, null])).toBe('Up 20% on last week.')
    expect(waterWeekLine([4, 4, null, null, null, null, null], [5, 5, null, null, null, null, null])).toBe('Down 20% on last week.')
    expect(waterWeekLine([5, null, null, null, null, null, null], [5, 5, 5, null, null, null, null])).toBe('About the same as last week.')
  })
  it('gives the average when last week has nothing', () => {
    expect(waterWeekLine([6, 7, null, null, null, null, null], [null, null, null, null, null, null, null])).toBe('About 6.5 glasses a day.')
  })
  it('asks for a log when nothing is logged', () => {
    expect(waterWeekLine([null, null], [null])).toBe('No water logged this week yet.')
  })
})
