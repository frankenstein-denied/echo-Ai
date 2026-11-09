import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
import { milestonePath, milestonesDoneThisWeek, overallProgress, paceLine, toggleMilestone } from './goals-helpers'
import { applyMilestone } from './client'

describe('toggleMilestone', () => {
  it('sets doneAt when becoming done', () => {
    const out = toggleMilestone([{ text: 'a', done: false }, { text: 'b', done: false }], 1, 500)
    expect(out[1]).toEqual({ text: 'b', done: true, doneAt: 500 })
    expect(out[0]).toEqual({ text: 'a', done: false })
  })
  it('drops the doneAt key when becoming not done', () => {
    const out = toggleMilestone([{ text: 'a', done: true, doneAt: 5 }], 0, 9)
    expect(out[0]).toEqual({ text: 'a', done: false })
    expect('doneAt' in out[0]).toBe(false)
  })
})

describe('applyMilestone doneAt', () => {
  it('adds doneAt when an existing one becomes done and removes it when undone', () => {
    const done = applyMilestone([{ text: 'Run 5k', done: false }], { text: 'run 5k', done: true }, 42)
    expect(done[0]).toEqual({ text: 'Run 5k', done: true, doneAt: 42 })
    const undone = applyMilestone(done, { text: 'run 5k', done: false }, 50)
    expect(undone[0]).toEqual({ text: 'Run 5k', done: false })
    expect('doneAt' in undone[0]).toBe(false)
  })
  it('keeps the existing doneAt when state is unchanged', () => {
    const out = applyMilestone([{ text: 'a', done: true, doneAt: 7 }], { text: 'a', done: true }, 99)
    expect(out[0].doneAt).toBe(7)
  })
  it('appended done gets doneAt, appended not-done has none', () => {
    const out = applyMilestone([], { text: 'x', done: true }, 11)
    expect(out).toEqual([{ text: 'x', done: true, doneAt: 11 }])
    const out2 = applyMilestone([], { text: 'y', done: false }, 11)
    expect('doneAt' in out2[0]).toBe(false)
  })
})

describe('overallProgress', () => {
  it('is 0 for empty', () => expect(overallProgress([])).toBe(0))
  it('rounds the mean', () => expect(overallProgress([{ progress: 10 }, { progress: 15 }])).toBe(13))
  it('clamps and handles non-finite', () => {
    expect(overallProgress([{ progress: 200 }])).toBe(100)
    expect(overallProgress([{ progress: -50 }])).toBe(0)
    expect(overallProgress([{ progress: NaN }, { progress: 50 }])).toBe(25)
  })
})

describe('paceLine', () => {
  it('says so when the period has no goals', () => {
    expect(paceLine(0, 40, 'today', 0)).toBe('No goals in this period yet.')
  })
  it('behind when goals trail time by more than 10', () => {
    expect(paceLine(40, 85, 'month', 3)).toBe('40% done, 85% of this month gone. A bit behind, one small step today helps.')
  })
  it('on track within 10 either way', () => {
    expect(paceLine(60, 55, 'week', 2)).toBe("60% done, 55% of this week gone. You're on track.")
    expect(paceLine(40, 50, 'week', 2)).toBe("40% done, 50% of this week gone. You're on track.")
    expect(paceLine(60, 50, 'week', 2)).toBe("60% done, 50% of this week gone. You're on track.")
  })
  it('ahead when goals lead time by more than 10', () => {
    expect(paceLine(90, 50, 'year', 4)).toBe("90% done, 50% of this year gone. You're ahead, nice!")
  })
  it('names the period', () => {
    expect(paceLine(50, 50, 'today', 1)).toBe("50% done, 50% of today gone. You're on track.")
    expect(paceLine(50, 50, 'all', 1)).toBe("50% done, 50% of this year gone. You're on track.")
  })
})

describe('milestonesDoneThisWeek', () => {
  const now = new Date(2026, 10, 5, 12) // Thu
  const mon = new Date(2026, 10, 2).getTime()
  it('counts done milestones with doneAt in this week only', () => {
    const goals = [
      { milestones: [{ text: 'a', done: true, doneAt: mon }, { text: 'b', done: true, doneAt: mon - 1 }, { text: 'c', done: true }, { text: 'd', done: false, doneAt: mon + 5 }] },
      { milestones: [{ text: 'e', done: true, doneAt: now.getTime() }] },
      {},
    ]
    expect(milestonesDoneThisWeek(goals, now)).toBe(2)
  })
})

describe('milestonePath', () => {
  const ms = (flags: boolean[]) => flags.map((done, i) => ({ text: `m${i}`, done }))
  it('marks done, next, todo', () => {
    const p = milestonePath(ms([true, false, false]))
    expect(p.steps.map((s) => s.state)).toEqual(['done', 'next', 'todo'])
    expect(p.steps[1]).toEqual({ text: 'm1', index: 1, state: 'next' })
    expect(p.more).toBe(0)
  })
  it('caps at max and reports more', () => {
    const p = milestonePath(ms(Array(13).fill(false)))
    expect(p.steps).toHaveLength(10)
    expect(p.more).toBe(3)
  })
  it('has no next when all done', () => {
    expect(milestonePath(ms([true, true])).steps.every((s) => s.state === 'done')).toBe(true)
  })
  it('next beyond the cut is not shown', () => {
    const p = milestonePath(ms([true, true, true, false]), 2)
    expect(p.steps.map((s) => s.state)).toEqual(['done', 'done'])
    expect(p.more).toBe(2)
  })
})
