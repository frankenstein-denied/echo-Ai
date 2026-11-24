'use client'

import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { healthLogParts, type LegacyKind } from '@/lib/echo/legacy'
import type { SharedLegacy } from '@/lib/legacy-store'
import type { Memory } from '@/lib/firestore'
import { Badge, Card, IconButton } from '../ui'
import { KIND_LABEL } from './kinds'
import { goalProgress, MIN_SUBGOALS, subgoalCount } from '@/lib/echo/goal-progress'

const LIST_MAX = 200

const millis = (t: unknown): number => {
  const m = t && typeof (t as { toMillis?: unknown }).toMillis === 'function' ? (t as { toMillis(): number }).toMillis() : 0
  return Number.isFinite(m) ? m : 0
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

function kindOf(m: Memory): LegacyKind {
  return m.type === 'goal' ? 'goals' : m.type === 'health' ? 'health' : 'life'
}

function MemoryChips({ memories }: { memories: SharedLegacy['memories'] }) {
  if (!memories.length) return null
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Memories">
      {memories.map((m) => (
        <li key={m.id}>
          <Badge type={m.type}>{m.label}</Badge>
        </li>
      ))}
    </ul>
  )
}

function Section({ kind, children }: { kind: LegacyKind; children: ReactNode }) {
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-foreground">{KIND_LABEL[kind]}</h3>
      <div className="grid gap-3">{children}</div>
    </Card>
  )
}

function Rows({ rows }: { rows: { id: string; title: string; body?: string }[] }) {
  if (!rows.length) return null
  return (
    <ul className="grid gap-2">
      {rows.map((r) => (
        <li key={r.id} className="rounded-lg bg-surface-2 px-3 py-2">
          <p className="text-sm font-medium text-foreground">{r.title}</p>
          {r.body && <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">{r.body}</p>}
        </li>
      ))}
    </ul>
  )
}

/** Read-only lists of what the owner shared, grouped by kind. */
export function BrowseMemories({ ownerName, shared, onBack }: { ownerName: string; shared: SharedLegacy; onBack: () => void }) {
  const memories = [...shared.memories].sort((a, b) => (b.mentions ?? 0) - (a.mentions ?? 0) || millis(b.lastSeenAt) - millis(a.lastSeenAt)).slice(0, LIST_MAX)
  const byKind = (k: LegacyKind) => memories.filter((m) => kindOf(m) === k)
  const goals = [...shared.goals].sort((a, b) => millis(b.updatedAt) - millis(a.updatedAt)).slice(0, LIST_MAX)
  const notes = [...shared.notes].sort((a, b) => millis(b.updatedAt) - millis(a.updatedAt)).slice(0, LIST_MAX)
  const pages = [...shared.pages].sort((a, b) => millis(b.lastMessageAt) - millis(a.lastMessageAt)).slice(0, LIST_MAX)
  const logs = [...shared.health.logs].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, LIST_MAX)
  const meals = [...shared.health.meals].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, LIST_MAX)

  const life = byKind('life')
  const goalMemories = byKind('goals')
  const healthMemories = byKind('health')
  const empty = !memories.length && !goals.length && !notes.length && !pages.length && !logs.length && !meals.length

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <IconButton icon={ArrowLeft} label={`Back to the chat with ${ownerName}`} onClick={onBack} />
        <h2 className="min-w-0 truncate text-base font-semibold text-foreground">📖 {ownerName}&apos;s memories</h2>
      </div>
      {empty && (
        <Card>
          <p className="text-sm text-muted-foreground">{ownerName} hasn&apos;t shared any memories here yet.</p>
        </Card>
      )}
      {life.length > 0 && (
        <Section kind="life">
          <MemoryChips memories={life} />
        </Section>
      )}
      {(goals.length > 0 || goalMemories.length > 0) && (
        <Section kind="goals">
          <Rows
            rows={goals.map((g) => {
              const { done, total } = subgoalCount(g)
              return {
                id: g.id,
                title: g.title,
                body: `${goalProgress(g)}% done${total >= MIN_SUBGOALS ? ` · ${done} of ${total} sub-goals` : ''}${g.targetDate ? ` · target ${g.targetDate}` : ''}`,
              }
            })}
          />
          <MemoryChips memories={goalMemories} />
        </Section>
      )}
      {notes.length > 0 && (
        <Section kind="notes">
          <Rows rows={notes.map((n) => ({ id: n.id, title: n.title || 'Untitled note', body: n.body }))} />
        </Section>
      )}
      {pages.length > 0 && (
        <Section kind="diary">
          <Rows rows={pages.map((p) => ({ id: p.id, title: p.title || 'Diary page', body: p.preview }))} />
        </Section>
      )}
      {(logs.length > 0 || meals.length > 0 || healthMemories.length > 0) && (
        <Section kind="health">
          <MemoryChips memories={healthMemories} />
          <Rows
            rows={[
              ...logs.map((h) => ({
                id: `log-${h.id}`,
                title: h.date,
                body: capitalize(healthLogParts(h).join(' · ')) || 'Logged',
              })),
              ...meals.map((m) => ({ id: `meal-${m.id}`, title: `${m.date} · ${m.mealType}`, body: m.description })),
            ]}
          />
        </Section>
      )}
    </div>
  )
}
