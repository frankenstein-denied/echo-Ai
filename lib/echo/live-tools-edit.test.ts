import { describe, expect, it, vi } from 'vitest'
import { addRef, emptyRefMap } from './context'
import { executeToolCalls, LIVE_TOOL_DECLARATIONS, mapToolCall, MEAL_CONFIRM_WITHIN_MS, type ToolContext } from './live-tools'

const refs = () => {
  const m = emptyRefMap()
  addRef(m, 'reminder', 'docWater', 'Drink water')
  addRef(m, 'reminder', 'docStretch', 'Stretch')
  addRef(m, 'goal', 'docGoal', 'Half marathon')
  addRef(m, 'note', 'docNote', 'Trip ideas')
  addRef(m, 'meal', 'docMeal', 'two eggs and toast')
  return m
}
const ctx = (over: Partial<ToolContext> = {}): ToolContext => ({ clientTime: '2026-10-26T08:15:00+08:00', checkInTime: '09:00', memoryLabels: [], refs: refs(), ...over })

describe('edit/delete/meal tools', () => {
  it('declares them with a required ref (meal log needs only a description)', () => {
    const names = LIVE_TOOL_DECLARATIONS.map((d) => d.name)
    for (const n of ['log_meal', 'update_reminder', 'delete_reminder', 'update_note', 'delete_note', 'update_goal', 'delete_goal', 'update_meal', 'delete_meal']) expect(names).toContain(n)
    expect(LIVE_TOOL_DECLARATIONS.find((d) => d.name === 'delete_goal')?.parameters?.required).toEqual(['ref'])
    expect(LIVE_TOOL_DECLARATIONS.find((d) => d.name === 'log_meal')?.parameters?.required).toEqual(['description'])
    expect(LIVE_TOOL_DECLARATIONS.find((d) => d.name === 'delete_note')?.description).toMatch(/confirmed/)
  })
  it('maps updates for refs in the call map', () => {
    expect(mapToolCall('update_reminder', { ref: 'r1', done: true }, ctx())).toEqual({ ok: true, response: { reply: '', actions: [{ type: 'reminder_update', ref: 'r1', done: true }], memories: [], trace: [] } })
    const g = mapToolCall('update_goal', { ref: 'g1', milestoneDone: { text: 'Run 10 km', done: true } }, ctx())
    expect(g.ok && g.response.actions[0]).toEqual({ type: 'goal_update', ref: 'g1', milestoneDone: { text: 'Run 10 km', done: true } })
    const h = mapToolCall('log_health', { moodTag: 'anxious' }, ctx())
    expect(h.ok && h.response.actions[0]).toEqual({ type: 'health', date: '2026-10-26', mood: 3, moodTag: 'anxious' })
  })
  it('explains unknown refs', () => {
    expect(mapToolCall('update_reminder', { ref: 'r9', done: true }, ctx())).toEqual({ ok: false, error: 'unknown ref: use a ref from YOUR ITEMS or one returned by a save in this call' })
    expect(mapToolCall('update_note', { ref: 'n1', append: 'x' }, ctx({ refs: undefined })).ok).toBe(false)
  })
  it('refuses a delete until Echo asked about that item', () => {
    const no = mapToolCall('delete_reminder', { ref: 'r2' }, ctx({ lastEchoText: 'Sure, anything else?' }))
    expect(no).toEqual({ ok: false, error: 'not deleted yet: first ask the user "Delete the reminder "Stretch"?" and call this again only after they say yes' })
    const yes = mapToolCall('delete_reminder', { ref: 'r2' }, ctx({ lastEchoText: 'Delete the reminder Stretch' }))
    expect(yes.ok && yes.response.actions[0]).toEqual({ type: 'reminder_delete', ref: 'r2' })
  })
  it('maps log_meal and refuses meals when calorie tracking is off', () => {
    const m = mapToolCall('log_meal', { description: 'two eggs and toast' }, ctx())
    expect(m.ok && m.response.actions[0]).toEqual({ type: 'meal_log', description: 'two eggs and toast', mealType: 'breakfast', date: '2026-10-26' })
    expect(mapToolCall('log_meal', { description: 'rice' }, ctx({ caloriesEnabled: false }))).toEqual({ ok: false, error: 'calorie tracking is off; tell the user they can turn it on in Settings' })
  })
})

describe('executeToolCalls with meals and edits', () => {
  it('waits longer for a meal estimate and returns the total and new ref', async () => {
    vi.useFakeTimers()
    try {
      const apply = vi.fn(() => new Promise<{ saved: { type: string; label: string; kcal?: number; ref?: string }[]; failed: string[] }>((res) => setTimeout(() => res({ saved: [{ type: 'health', label: 'breakfast: eggs', kcal: 540, ref: 'm2' }], failed: [] }), 4000)))
      const p = executeToolCalls([{ id: '1', name: 'log_meal', args: { description: 'eggs', mealType: 'breakfast' } }], ctx(), apply, { confirmWithinMs: 2500 })
      await vi.advanceTimersByTimeAsync(4000)
      const out = await p
      expect(out.responses[0].response.output).toMatchObject({ ok: true, saved: 'meal', mealType: 'breakfast', totalCalories: 540, ref: 'm2' })
      expect(out.responses[0].response.output).not.toHaveProperty('status')
      expect(MEAL_CONFIRM_WITHIN_MS).toBeGreaterThan(2500)
    } finally {
      vi.useRealTimers()
    }
  })
  it('passes a short failure reason back', async () => {
    const apply = vi.fn(async () => ({ saved: [], failed: ["reminder: couldn't find that reminder"] }))
    const out = await executeToolCalls([{ id: '1', name: 'update_reminder', args: { ref: 'r1', done: true } }], ctx(), apply)
    expect(out.responses[0].response).toEqual({ error: "could not save: couldn't find that reminder" })
  })
})
