import { describe, expect, it } from 'vitest'
import { addRef, buildContext, buildItemsContext, emptyRefMap, greetingKickoff, GREETING_MARKER, partOfDay, refsAsItems, removeRef, renderItems, resolveRef, type RefSource } from './context'
import { DELETE_CONFIRM_RULE, SYSTEM_INSTRUCTION, buildUserContents } from './prompt'
import { LIVE_PERSONA } from '@/lib/server/live'

const NOW = Date.UTC(2026, 9, 26, 0, 15) // 08:15 in Asia/Manila
const H = 3600e3
const src = (over: Partial<RefSource> = {}): RefSource => ({
  reminders: [
    { id: 'docR-late', title: 'Stretch', dueAtMs: NOW + 9 * H },
    { id: 'docR-soon', title: 'Drink water', dueAtMs: NOW + H },
    { id: 'docR-done', title: 'Done one', dueAtMs: NOW + 2 * H, done: true },
    { id: 'docR-old', title: 'Ancient', dueAtMs: NOW - 72 * H },
  ],
  goals: [{ id: 'docG', title: 'Half marathon', progress: 33.4, milestones: [{ text: 'Run 10 km', done: true }, { text: '', done: false }], updatedAtMs: 5 }],
  notes: Array.from({ length: 14 }, (_, i) => ({ id: `docN${i}`, title: `Note ${i}`, updatedAtMs: i })),
  health: { mood: 8, moodTag: 'happy', sleepMinutes: 420 },
  meals: [{ id: 'docM', mealType: 'breakfast', description: 'two eggs and toast', totalCalories: 380.4, createdAtMs: 1 }],
  caloriesEnabled: true,
  ...over,
})

describe('ref map', () => {
  it('assigns short refs per kind and maps them back only for the right kind', () => {
    const m = emptyRefMap()
    expect(addRef(m, 'reminder', 'idA', 'A')).toBe('r1')
    expect(addRef(m, 'reminder', 'idB', 'B')).toBe('r2')
    expect(addRef(m, 'goal', 'idC', 'C')).toBe('g1')
    expect(addRef(m, 'reminder', 'idA', 'A renamed')).toBe('r1')
    expect(resolveRef(m, 'r1', 'reminder')).toEqual({ kind: 'reminder', id: 'idA', title: 'A renamed' })
    expect(resolveRef(m, 'r1', 'goal')).toBeNull()
    expect(resolveRef(m, 'constructor', 'goal')).toBeNull()
    removeRef(m, 'r1')
    expect(resolveRef(m, 'r1', 'reminder')).toBeNull()
    expect(addRef(m, 'reminder', 'idZ', 'Z')).toBe('r3') // refs are never reused within a map
  })
})

describe('buildItemsContext', () => {
  it('lists open reminders soonest first, goals, the latest 10 notes, health and meals, with no doc ids', () => {
    const { items, refs } = buildItemsContext(src(), NOW, 'Asia/Manila')
    expect(items.reminders.map((r) => [r.ref, r.title])).toEqual([['r1', 'Drink water'], ['r2', 'Stretch']])
    expect(items.reminders[0].due).toBe('Mon, Oct 26, 9:15 AM')
    expect(items.goals).toEqual([{ ref: 'g1', title: 'Half marathon', progress: 33, milestones: [{ text: 'Run 10 km', done: true }] }])
    expect(items.notes).toHaveLength(10)
    expect(items.notes[0]).toEqual({ ref: 'n1', title: 'Note 13' })
    expect(items.health).toBe('mood 8 (happy), sleep 420 min')
    expect(items.meals).toEqual([{ ref: 'm1', mealType: 'breakfast', description: 'two eggs and toast', calories: 380 }])
    expect(resolveRef(refs, 'r2', 'reminder')?.id).toBe('docR-late')
    expect(resolveRef(refs, 'm1', 'meal')?.id).toBe('docM')
    const wire = JSON.stringify(buildContext({}, [], [], items))
    expect(wire).not.toMatch(/doc[RGNM]/)
  })
  it('omits meals when calorie tracking is off and says so to the model', () => {
    const { items } = buildItemsContext(src({ caloriesEnabled: false }), NOW, 'Asia/Manila')
    expect(items.meals).toEqual([])
    expect(renderItems(items)).toContain('Calorie tracking is OFF')
  })
  it('keeps refs stable when an existing map is reused', () => {
    const first = buildItemsContext(src(), NOW, 'Asia/Manila')
    const again = buildItemsContext(src({ reminders: [{ id: 'docR-late', title: 'Stretch', dueAtMs: NOW + 9 * H }] }), NOW, 'Asia/Manila', first.refs)
    expect(again.items.reminders[0].ref).toBe('r2')
  })
  it('refsAsItems exposes refs and titles for call-time validation', () => {
    const { refs } = buildItemsContext(src(), NOW, 'Asia/Manila')
    const it2 = refsAsItems(refs, true)
    expect(it2.reminders.map((r) => r.ref)).toEqual(['r1', 'r2'])
    expect(it2.meals.map((m) => m.description)).toEqual(['two eggs and toast'])
    expect(refsAsItems(refs, false).meals).toEqual([])
  })
})

describe('prompts', () => {
  it('both personas carry the delete-confirmation rule; the typed prompt renders YOUR ITEMS', () => {
    expect(SYSTEM_INSTRUCTION).toContain(DELETE_CONFIRM_RULE)
    expect(LIVE_PERSONA).toContain(DELETE_CONFIRM_RULE)
    expect(DELETE_CONFIRM_RULE).toMatch(/ask first/i)
    const { items } = buildItemsContext(src(), NOW, 'Asia/Manila')
    const c = buildUserContents({ text: 'mark water done', clientTime: '2026-10-26T08:15:00+08:00', timeZone: 'Asia/Manila', context: buildContext({}, [], [], items) })
    expect(c).toContain('=== USER DATA: YOUR ITEMS')
    expect(c).toContain('r1: Drink water')
    expect(c).toContain('m1: breakfast: two eggs and toast (380 kcal)')
  })
  it('greeting kickoff names the marker and the part of day; the call persona explains it', () => {
    expect(greetingKickoff('2026-10-26T19:42:00+08:00')).toBe(`${GREETING_MARKER} Local time 19:42 (evening). Greet the user now.`)
    expect(partOfDay(6)).toBe('morning')
    expect(partOfDay(13)).toBe('afternoon')
    expect(partOfDay(23)).toBe('night')
    expect(LIVE_PERSONA).toContain(GREETING_MARKER)
  })
})
