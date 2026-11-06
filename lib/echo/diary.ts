// Pure helpers for diary pages (no Firebase imports so they are unit-testable).
import { localDateKey } from './view-helpers'

export const TITLE_MAX = 120
export const PREVIEW_MAX = 160
export const BATCH_MAX = 400
export const MIGRATION_PAGE_ID = 'earlier-entries'
export const MIGRATION_PAGE_TITLE = 'Earlier entries'
export const RULES_MESSAGE = 'Diary pages need the updated Firestore rules'

type Millis = { toMillis(): number } | null | undefined
export type PageLike = { title: string; preview: string; updatedAt?: Millis }

// "Sun, Oct 25" in the local time zone.
export function defaultPageTitle(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(d)
}

// Trimmed title when it is 1-120 chars, otherwise null.
export function normalizeTitle(raw: string): string | null {
  const t = raw.trim()
  return t.length >= 1 && t.length <= TITLE_MAX ? t : null
}

// One line, at most 160 chars (ellipsis included).
export function previewOf(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  if (one.length <= PREVIEW_MAX) return one
  return `${one.slice(0, PREVIEW_MAX - 1).trimEnd()}…`
}

const ms = (m: Millis) => m?.toMillis() ?? Number.MAX_SAFE_INTEGER // pending server timestamp = newest

export function sortPages<T extends PageLike>(pages: T[]): T[] {
  return [...pages].sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt))
}

export function filterPages<T extends PageLike>(pages: T[], q: string): T[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return pages
  return pages.filter((p) => p.title.toLowerCase().includes(needle) || p.preview.toLowerCase().includes(needle))
}

export function relativeTime(thenMs: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, nowMs - thenMs)
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} h ago`
  const day = Math.floor(hr / 24)
  if (day === 1) return 'yesterday'
  if (day < 7) return `${day} days ago`
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(thenMs))
}

export function chunk<T>(items: T[], size: number = BATCH_MAX): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export type MigrationPlan = { copyBatches: string[][]; deleteBatches: string[][]; total: number }

// oldIds: flat message ids in chronological order. alreadyCopied: ids that already exist in the target page.
// Copy skips what is already there (create-only rules), delete covers every old doc, so a rerun finishes the job.
export function planMigration(oldIds: string[], alreadyCopied: Iterable<string> = []): MigrationPlan {
  const done = new Set(alreadyCopied)
  return {
    copyBatches: chunk(oldIds.filter((id) => !done.has(id))),
    deleteBatches: chunk(oldIds),
    total: oldIds.length,
  }
}

export function isPermissionDenied(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'permission-denied'
}

/** True when the timestamp falls on the same local calendar day as `now`. */
export function isFromToday(createdAtMs: number | undefined, now: Date = new Date()): boolean {
  if (createdAtMs === undefined) return false
  return localDateKey(new Date(createdAtMs)) === localDateKey(now)
}

/** The page to land on: the first (most recently updated) page created today, or null for the fresh empty today state. */
export function pickTodayPage<T extends { createdAt?: { toMillis?: () => number } | null }>(pages: T[], now: Date = new Date()): T | null {
  return pages.find((p) => isFromToday(p.createdAt?.toMillis?.(), now)) ?? null
}

/** Whether an open app should roll over to the fresh "today" page: the day changed since the page was opened, it is not a today page, nothing is live, and a page is open. */
export function shouldStartNewDay(
  s: { openedDayKey: string; pageCreatedMs: number | undefined; callActive: boolean; selId: string | null },
  now: Date = new Date(),
): boolean {
  if (s.selId === null || s.callActive) return false
  if (s.openedDayKey === localDateKey(now)) return false
  return !isFromToday(s.pageCreatedMs, now)
}

/** The page a floating panel should move to: today's page, once one exists, while it still sits on the empty state. */
export function embedPageToAdopt<T extends { id: string; createdAt?: { toMillis?: () => number } | null }>(selectedId: string | null, embed: boolean, pages: T[], now?: Date): string | null {
  if (!embed || selectedId !== null) return null
  return pickTodayPage(pages, now)?.id ?? null
}
