import { ORB_COLOR, ORB_KINDS, type OrbKind } from './orbs'
import { localDateKey } from './view-helpers'

export type NavName = 'Diary' | 'Notes' | 'Goals' | 'Health' | 'Reminders' | 'Connectors' | '2nd Brain' | 'Settings'

export const NAV_GROUPS: { label: 'Capture' | 'Track' | 'Mind'; items: Exclude<NavName, 'Settings'>[] }[] = [
  { label: 'Capture', items: ['Diary', 'Notes'] },
  { label: 'Track', items: ['Goals', 'Health', 'Reminders'] },
  { label: 'Mind', items: ['2nd Brain', 'Connectors'] },
]

export const NAV_COLOR: Record<Exclude<NavName, 'Settings' | '2nd Brain'>, string> = {
  Diary: '#2dd4bf',
  Notes: ORB_COLOR.note,
  Goals: ORB_COLOR.goal,
  Health: ORB_COLOR.health,
  Reminders: ORB_COLOR.reminder,
  Connectors: '#94a3b8',
}

const BRAIN_COLORS = ORB_KINDS.map((k) => ORB_COLOR[k])
export const BRAIN_GRADIENT = `conic-gradient(${[...BRAIN_COLORS, BRAIN_COLORS[0]].join(', ')})`

/** Not-done reminders due before the start of tomorrow (local time), overdue included. */
export function dueTodayCount(items: { dueMs: number; done: boolean }[], now: Date): number {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
  return items.filter((i) => !i.done && i.dueMs < tomorrow).length
}

/** Local midnight (ms) of the Monday of the week containing `now`. */
export function weekStartMs(now: Date): number {
  const offset = (now.getDay() + 6) % 7
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset).getTime()
}

/** Local YYYY-MM-DD keys Monday..Sunday of the week containing `now`. */
export function weekDates(now: Date): string[] {
  const start = new Date(weekStartMs(now))
  return Array.from({ length: 7 }, (_, i) =>
    localDateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)),
  )
}

export type WeekPage = {
  id: string
  mix?: Partial<Record<'note' | 'goal' | 'reminder' | 'health', number>>
  createdMs: number | null
  lastMs: number | null
  messageCount?: number
}
export type WeekDay = {
  date: string
  letter: string
  state: 'used' | 'empty' | 'future'
  isToday: boolean
  counts: Record<OrbKind, number>
  pageId: string | null
}

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function weekStrip(pages: WeekPage[], now: Date): WeekDay[] {
  const today = localDateKey(now)
  const real = pages.filter((p) => typeof p.messageCount === 'number' && p.messageCount > 0)
  return weekDates(now).map((date, i) => {
    const mine = real.filter(
      (p) =>
        (p.createdMs != null && localDateKey(new Date(p.createdMs)) === date) ||
        (p.lastMs != null && localDateKey(new Date(p.lastMs)) === date),
    )
    const counts = Object.fromEntries(ORB_KINDS.map((k) => [k, 0])) as Record<OrbKind, number>
    for (const p of mine) {
      for (const k of ['note', 'goal', 'reminder', 'health'] as const) {
        const v = p.mix?.[k]
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) counts[k] += v
      }
    }
    let best: WeekPage | null = null
    for (const p of mine) {
      if (!best || (p.lastMs ?? p.createdMs ?? 0) > (best.lastMs ?? best.createdMs ?? 0)) best = p
    }
    return {
      date,
      letter: LETTERS[i],
      state: date > today ? 'future' : mine.length ? 'used' : 'empty',
      isToday: date === today,
      counts,
      pageId: best ? best.id : null,
    }
  })
}
