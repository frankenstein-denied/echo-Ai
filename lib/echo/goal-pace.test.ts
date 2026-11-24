import { describe, expect, it } from 'vitest'
import { goalFraction, goalMeta, nextStepLine, paceLine, waterWeekLine, yearFraction } from './goal-pace'

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

describe('goalMeta', () => {
  it('counts sub-goals and shows the due date', () => {
    expect(goalMeta({ progress: 60, milestones: [{ text: 'Run 5K', done: true }, { text: 'Run 8K', done: false }], targetDate: '2026-12-20' })).toBe('1 of 2 sub-goals · due Dec 20')
  })
  it('says done or not done without sub-goals (stored percentages no longer show)', () => {
    expect(goalMeta({ progress: 42.4, milestones: [] })).toBe('Not done yet')
    expect(goalMeta({ progress: 100, milestones: [{ text: 'only one', done: false }] })).toBe('Done')
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
      { title: 'Read 12 books', progress: 80, milestones: [{ text: 'Book 1', done: true }, { text: 'Book 2', done: true }, { text: 'Book 3', done: false }] },
      { title: 'Run a 10K', progress: 20, milestones: [{ text: 'Run 5K', done: true }, { text: 'Run 8K', done: false }] },
    ]
    expect(nextStepLine(goals)).toBe('Next: Run 8K, for Run a 10K.')
  })
  it('derives progress from sub-goals, not the stored value', () => {
    const goals = [
      { title: 'A', progress: 0, milestones: [{ text: 'a1', done: true }, { text: 'a2', done: true }] },
      { title: 'B', progress: 100, milestones: [{ text: 'b1', done: false }, { text: 'b2', done: false }] },
    ]
    expect(nextStepLine(goals)).toBe('Next: b1, for B.')
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
