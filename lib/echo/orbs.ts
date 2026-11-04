import type { PageMix } from '@/lib/firestore'
import { inPeriod, type Period } from './period'

export const ORB_KINDS = ['note', 'goal', 'reminder', 'health', 'person', 'interest'] as const
export type OrbKind = (typeof ORB_KINDS)[number]

export const ORB_COLOR: Record<OrbKind, string> = {
  note: '#60a5fa',
  goal: '#fbbf24',
  reminder: '#fb923c',
  health: '#34d399',
  person: '#f472b6',
  interest: '#a78bfa',
}

export const ORB_MEANING: Record<OrbKind, string> = {
  note: 'Thoughts you wrote down',
  goal: "Goals you're chasing",
  reminder: 'Things to do',
  health: 'Body and mood',
  person: 'People in your life',
  interest: 'Interests and topics',
}

export const ORB_NOUN: Record<OrbKind, [string, string]> = {
  note: ['note', 'notes'],
  goal: ['goal', 'goals'],
  reminder: ['reminder', 'reminders'],
  health: ['health log', 'health logs'],
  person: ['person', 'people'],
  interest: ['interest', 'interests'],
}

export const PEARL = '#cbd5e1'

export type OrbPage = { id: string; title?: string; lastMessageMs?: number; messageCount?: number; mix?: PageMix }
export type OrbMemory = { id: string; label?: string; type?: string; mentions?: number; pages?: string[] }
export type OrbMember = { id: string; label: string; kind: OrbKind; mentions: number }
export type Orb = {
  id: string
  pageId: string
  label: string
  ms: number
  messageCount: number
  counts: Record<OrbKind, number>
  members: OrbMember[]
  involvement: number
  radius: number
}
export type Thread = { source: string; target: string; kind: OrbKind; via: string[] }

export function memoryKind(type: string | undefined): OrbKind | null {
  switch (type) {
    case 'person': return 'person'
    case 'interest':
    case 'topic': return 'interest'
    case 'goal': return 'goal'
    case 'task': return 'reminder'
    case 'health': return 'health'
    default: return null
  }
}

export function buildOrbs(memories: OrbMemory[], pages: OrbPage[]): Orb[] {
  const byPage = new Map<string, OrbMember[]>()
  for (const p of pages) byPage.set(p.id, [])
  for (const m of memories) {
    const kind = memoryKind(m.type)
    if (!kind) continue
    const member: OrbMember = { id: m.id, label: m.label ?? '', kind, mentions: m.mentions ?? 1 }
    for (const pid of new Set(m.pages ?? [])) byPage.get(pid)?.push(member)
  }
  const orbs: Orb[] = []
  const seen = new Set<string>()
  for (const p of pages) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    const members = (byPage.get(p.id) ?? []).sort((a, b) => b.mentions - a.mentions || a.label.localeCompare(b.label))
    const n = (k: OrbKind) => members.filter((m) => m.kind === k).length
    const mix = p.mix
    const counts: Record<OrbKind, number> = {
      note: mix?.note ?? 0,
      goal: Math.max(mix?.goal ?? 0, n('goal')),
      reminder: Math.max(mix?.reminder ?? 0, n('reminder')),
      health: Math.max(mix?.health ?? 0, n('health')),
      person: n('person'),
      interest: n('interest'),
    }
    const messageCount = p.messageCount ?? 0
    const total = ORB_KINDS.reduce((s, k) => s + counts[k], 0)
    if (messageCount === 0 && total === 0) continue
    const involvement = total + messageCount * 0.25
    const radius = Math.min(60, Math.max(16, 16 + 8 * Math.sqrt(involvement)))
    orbs.push({
      id: `orb-${p.id}`,
      pageId: p.id,
      label: p.title?.trim() || 'Untitled page',
      ms: p.lastMessageMs ?? 0,
      messageCount,
      counts,
      members,
      involvement,
      radius,
    })
  }
  return orbs.sort((a, b) => a.ms - b.ms)
}

export function orbShares(counts: Record<OrbKind, number>): { kind: OrbKind; share: number }[] {
  const present = ORB_KINDS.map((kind, i) => ({ kind, i, count: counts[kind] }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count || a.i - b.i)
    .slice(0, 4)
  const total = present.reduce((s, e) => s + e.count, 0)
  return present.map((e) => ({ kind: e.kind, share: e.count / total }))
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function orbBlobs(orbId: string, counts: Record<OrbKind, number>): { kind: OrbKind; color: string; cx: number; cy: number; r: number }[] {
  const shares = orbShares(counts)
  const seed = hashString(orbId)
  const base = ((seed % 3600) / 3600) * Math.PI * 2
  const jitter = (((seed >>> 12) % 100) / 100) * 0.3
  return shares.map(({ kind, share }, i) => {
    // dominant blob near the centre; the rest orbit around it, never past 0.7
    const dist = shares.length === 1 ? 0 : i === 0 ? 0.08 : 0.4 + 0.1 * (i - 1)
    const angle = base + (i * Math.PI * 2) / shares.length + (i === 0 ? 0 : jitter)
    return {
      kind,
      color: ORB_COLOR[kind],
      cx: Math.cos(angle) * dist,
      cy: Math.sin(angle) * dist,
      r: 0.45 + 0.75 * share,
    }
  })
}

export function buildThreads(orbs: Orb[]): Thread[] {
  const byMember = new Map<string, { member: OrbMember; orbs: Orb[] }>()
  for (const orb of orbs) {
    for (const m of orb.members) {
      const e = byMember.get(m.id)
      if (e) e.orbs.push(orb)
      else byMember.set(m.id, { member: m, orbs: [orb] })
    }
  }
  const links = new Map<string, { source: string; target: string; labels: Set<string>; best: OrbMember }>()
  for (const id of [...byMember.keys()].sort()) {
    const { member, orbs: list } = byMember.get(id)!
    if (list.length < 2) continue
    const sorted = [...list].sort((a, b) => a.ms - b.ms || a.id.localeCompare(b.id))
    for (let i = 0; i < sorted.length - 1; i++) {
      const source = sorted[i].id
      const target = sorted[i + 1].id
      const key = `${source}|${target}`
      const link = links.get(key)
      if (!link) links.set(key, { source, target, labels: new Set([member.label]), best: member })
      else {
        link.labels.add(member.label)
        if (member.mentions > link.best.mentions) link.best = member
      }
    }
  }
  return [...links.values()]
    .sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target))
    .map((l) => ({ source: l.source, target: l.target, kind: l.best.kind, via: [...l.labels] }))
}

export function filterOrbs(orbs: Orb[], period: Period, now?: Date): Orb[] {
  return orbs.filter((o) => inPeriod(o.ms, period, now))
}

export function searchOrbs(orbs: Orb[], q: string): Set<string> {
  const needle = q.trim().toLowerCase()
  const out = new Set<string>()
  if (!needle) return out
  for (const o of orbs) {
    if (o.label.toLowerCase().includes(needle) || o.members.some((m) => m.label.toLowerCase().includes(needle))) out.add(o.id)
  }
  return out
}

export function orbSummary(counts: Record<OrbKind, number>): { kind: OrbKind; count: number; text: string }[] {
  return ORB_KINDS.filter((k) => counts[k] > 0).map((kind) => {
    const count = counts[kind]
    const [one, many] = ORB_NOUN[kind]
    return { kind, count, text: `${count} ${count === 1 ? one : many}` }
  })
}

export function orbAriaLabel(orb: Orb): string {
  const people = orb.members.filter((m) => m.kind === 'person').map((m) => m.label)
  const parts = orbSummary(orb.counts).map((s) => {
    if (s.kind !== 'person' || people.length === 0) return s.text
    const shown = people.slice(0, 3).join(', ')
    const more = people.length > 3 ? ` and ${people.length - 3} more` : ''
    return `${s.text}: ${shown}${more}`
  })
  let out = orb.label + '.'
  if (parts.length) out += ` ${parts.join(', ')}.`
  if (orb.messageCount > 0) out += ` ${orb.messageCount} ${orb.messageCount === 1 ? 'message' : 'messages'}.`
  return out
}
