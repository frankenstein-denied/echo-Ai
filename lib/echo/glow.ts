import type { CSSProperties } from 'react'
import { ORB_COLOR, type OrbKind } from './orbs'

export const WATER_DEEP = '#1d4ed8'
export const WATER_COLOR = '#38bdf8'
export const KCAL_FROM = '#c2410c'
export const KCAL_TO = '#fbbf24'
export const OVER_GLOW = '#ef4444'

const CATEGORY_KIND: Record<string, OrbKind> = { note: 'note', goal: 'goal', reminder: 'reminder', health: 'health', meal: 'health' }

export function kindForCategory(category: string | undefined): OrbKind | null {
  if (!category) return null
  return CATEGORY_KIND[category.trim().toLowerCase()] ?? null
}

export function personLabelSet(labels: (string | undefined)[]): Set<string> {
  const out = new Set<string>()
  for (const l of labels) {
    const t = l?.trim().toLowerCase()
    if (t) out.add(t)
  }
  return out
}

export function isPersonTag(tag: string, people: Set<string>): boolean {
  const t = tag.trim().toLowerCase()
  return t !== '' && people.has(t)
}

export function glowCardStyle(kind: OrbKind): CSSProperties {
  const c = ORB_COLOR[kind]
  return {
    background: `radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, ${c} 20%, transparent), transparent 60%), var(--color-surface)`,
    borderColor: `color-mix(in srgb, ${c} 30%, var(--color-border))`,
  }
}

export function tagStyle(kind: OrbKind): CSSProperties {
  const c = ORB_COLOR[kind]
  return {
    background: `color-mix(in srgb, ${c} 16%, transparent)`,
    color: c,
    borderColor: `color-mix(in srgb, ${c} 35%, transparent)`,
  }
}

const dayKey = (d: Date) => d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate()

export function timeChipLabel(at: Date, now: Date): string {
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/[  ]/g, ' ')
  if (dayKey(at) === dayKey(now)) return time
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  if (dayKey(at) === dayKey(tomorrow)) return `Tomorrow ${time}`
  const date = at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${date}, ${time}`
}
