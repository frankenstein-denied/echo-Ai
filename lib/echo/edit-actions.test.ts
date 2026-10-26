import { describe, expect, it } from 'vitest'
import { confirmQuestion, DELETE_CONFIRM_TRACE, deleteConfirmed, lastAssistantText, parseEchoRequest, parseItemsContext, sanitizeEchoResponse } from './sanitize'
import type { EchoItemsContext } from './types'

const NOW = '2026-10-26T08:15:00+08:00'
const items: EchoItemsContext = {
  reminders: [
    { ref: 'r1', title: 'Drink water', due: 'Mon, Oct 26, 9:00 AM' },
    { ref: 'r2', title: 'Stretch', due: 'Mon, Oct 26, 5:00 PM' },
  ],
  goals: [{ ref: 'g1', title: 'Run a half marathon', progress: 20, milestones: [{ text: 'Run 10 km', done: false }] }],
  notes: [{ ref: 'n1', title: 'Trip ideas' }],
  health: 'mood 6 (okay)',
  meals: [{ ref: 'm1', mealType: 'breakfast', description: 'two eggs and toast', calories: 380 }],
  caloriesEnabled: true,
}
const run = (actions: unknown[], opts: Parameters<typeof sanitizeEchoResponse>[4] = { items }, reply = 'ok') =>
  sanitizeEchoResponse({ reply, actions, memories: [], trace: [] }, NOW, '09:00', [], opts)

describe('parseItemsContext', () => {
  it('keeps well-formed refs and caps every list', () => {
    const raw = {
      reminders: Array.from({ length: 30 }, (_, i) => ({ ref: `r${i + 1}`, title: `R${i}`, due: 'x'.repeat(80) })),
      goals: [{ ref: 'g1', title: 'G', progress: 140, milestones: Array.from({ length: 12 }, (_, i) => ({ text: `m${i}`, done: i % 2 === 0 })) }],
      notes: [{ ref: 'n1', title: 'N' }, { ref: 'n1', title: 'dup' }, { ref: 'r9', title: 'wrong prefix' }, { ref: 'n2', title: '' }],
      meals: [{ ref: 'm1', mealType: 'brunch', description: 'x' }, { ref: 'm2', mealType: 'lunch', description: 'rice', calories: 99999 }],
      health: 'h'.repeat(500),
      caloriesEnabled: true,
    }
    const p = parseItemsContext(raw)!
    expect(p.reminders).toHaveLength(20)
    expect(p.reminders[0].due).toHaveLength(40)
    expect(p.goals[0]).toMatchObject({ progress: 100 })
    expect(p.goals[0].milestones).toHaveLength(8)
    expect(p.notes).toEqual([{ ref: 'n1', title: 'N' }])
    expect(p.meals).toEqual([{ ref: 'm2', mealType: 'lunch', description: 'rice', calories: 20000 }])
    expect(p.health).toHaveLength(200)
  })
  it('drops meals when calories are off and is absent when not sent', () => {
    expect(parseItemsContext({ meals: [{ ref: 'm1', mealType: 'lunch', description: 'rice', calories: 1 }], caloriesEnabled: false })?.meals).toEqual([])
    expect(parseItemsContext(undefined)).toBeUndefined()
    const r = parseEchoRequest({ text: 'hi', clientTime: NOW, timeZone: 'Asia/Manila' })
    expect('error' in r ? null : 'items' in r.context).toBe(false)
  })
})

describe('edit actions', () => {
  it('accepts updates for listed refs', () => {
    const out = run([
      { type: 'reminder_update', ref: 'r1', done: true },
      { type: 'reminder_update', ref: 'R2', dueAt: '2026-10-26T18:00:00+08:00' },
      { type: 'note_update', ref: 'n1', append: 'Also Baguio' },
      { type: 'goal_update', ref: 'g1', progress: 130, milestoneDone: { text: 'Run 10 km', done: true } },
      { type: 'health_update', date: '2026-10-25', sleepMinutes: 420 },
      { type: 'meal_update', ref: 'm1', totalCalories: 450 },
    ])
    expect(out.actions).toEqual([
      { type: 'reminder_update', ref: 'r1', done: true },
      { type: 'reminder_update', ref: 'r2', dueAt: '2026-10-26T18:00:00+08:00' },
      { type: 'note_update', ref: 'n1', append: 'Also Baguio' },
      { type: 'goal_update', ref: 'g1', progress: 100, milestoneDone: { text: 'Run 10 km', done: true } },
      { type: 'health_update', date: '2026-10-25', sleepMinutes: 420 },
      { type: 'meal_update', ref: 'm1', totalCalories: 450 },
    ])
  })
  it('rejects unknown, wrong-kind or malformed refs and empty updates', () => {
    const out = run([
      { type: 'reminder_update', ref: 'r9', done: true },
      { type: 'reminder_update', ref: 'g1', done: true },
      { type: 'note_update', ref: 'n1' },
      { type: 'goal_update', ref: 'g1; drop', progress: 5 },
      { type: 'meal_update', ref: 'abc123docid', totalCalories: 1 },
      { type: 'reminder_delete', ref: 'r99' },
    ])
    expect(out.actions).toEqual([])
  })
  it('rejects every ref action when no items were sent', () => {
    expect(run([{ type: 'reminder_update', ref: 'r1', done: true }], {}).actions).toEqual([])
  })
  it('caps text fields', () => {
    const out = run([{ type: 'note_update', ref: 'n1', title: 't'.repeat(300), body: 'b'.repeat(5000) }])
    expect(out.actions[0]).toMatchObject({ title: 't'.repeat(120), body: 'b'.repeat(4000) })
  })
  it('maps a feeling to moodTag plus its score', () => {
    const out = run([{ type: 'health', date: '2026-10-26', moodTag: 'Tired', mood: 9 }, { type: 'health', moodTag: 'meh' }])
    expect(out.actions).toEqual([{ type: 'health', date: '2026-10-26', mood: 4, moodTag: 'tired' }])
  })
})

describe('meal_log', () => {
  it('keeps the description, defaults the meal type from the local hour and the date to today', () => {
    const out = run([{ type: 'meal_log', description: ' two eggs and toast ' }, { type: 'meal_log', description: 'pizza', mealType: 'dinner', date: '2026-10-25' }])
    expect(out.actions).toEqual([
      { type: 'meal_log', description: 'two eggs and toast', mealType: 'breakfast', date: '2026-10-26' },
      { type: 'meal_log', description: 'pizza', mealType: 'dinner', date: '2026-10-25' },
    ])
  })
  it('rejects empty descriptions, ignores future dates and never trusts model nutrition', () => {
    const out = run([{ type: 'meal_log', description: '' }, { type: 'meal_log', description: 'x', date: '2026-12-01', nutrition: { totalCalories: 1 } }])
    expect(out.actions).toEqual([{ type: 'meal_log', description: 'x', mealType: 'breakfast', date: '2026-10-26' }])
  })
})

describe('delete confirmation', () => {
  const asked = { items, recentMessages: [{ role: 'user' as const, text: 'delete the stretch reminder' }, { role: 'assistant' as const, text: "Delete the reminder 'Stretch'?" }] }
  it('turns an unconfirmed delete into the confirmation question', () => {
    const out = run([{ type: 'reminder_delete', ref: 'r2' }], { items, recentMessages: [{ role: 'user', text: 'delete the stretch reminder' }] }, 'Deleted it!')
    expect(out.actions).toEqual([])
    expect(out.reply).toBe('Delete the reminder "Stretch"?')
    expect(out.trace).toContain(DELETE_CONFIRM_TRACE)
  })
  it('accepts the delete after Echo asked about that item', () => {
    const out = run([{ type: 'reminder_delete', ref: 'r2' }], asked, 'Done, deleted.')
    expect(out.actions).toEqual([{ type: 'reminder_delete', ref: 'r2' }])
    expect(out.reply).toBe('Done, deleted.')
  })
  it('does not accept a question about a different item', () => {
    expect(run([{ type: 'reminder_delete', ref: 'r1' }], asked).actions).toEqual([])
  })
  it('keeps other actions and appends the question', () => {
    const out = run([{ type: 'reminder_update', ref: 'r1', done: true }, { type: 'note_delete', ref: 'n1' }], { items }, 'Marked it done.')
    expect(out.actions).toEqual([{ type: 'reminder_update', ref: 'r1', done: true }])
    expect(out.reply).toBe('Marked it done. Delete the note "Trip ideas"?')
  })
  it('helpers', () => {
    expect(confirmQuestion('meal', 'pizza')).toBe('Delete the meal "pizza"?')
    expect(deleteConfirmed('Should I delete “Stretch”?', 'Stretch')).toBe(true)
    expect(deleteConfirmed('Okay, I will delete Stretch', 'Stretch')).toBe(false)
    expect(deleteConfirmed('Okay, I will delete Stretch', 'Stretch', true)).toBe(true)
    expect(deleteConfirmed('Anything else?', 'Stretch', true)).toBe(false)
    expect(lastAssistantText([{ role: 'assistant', text: 'old?' }, { role: 'user', text: 'a' }, { role: 'user', text: 'b' }])).toBe('')
    expect(lastAssistantText([{ role: 'assistant', text: 'Delete it?' }, { role: 'user', text: 'yes' }])).toBe('Delete it?')
  })
})
