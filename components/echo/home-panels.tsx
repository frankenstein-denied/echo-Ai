'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { doc, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { Bell, Droplet, HeartPulse, Moon, Smile, Target, X, Zap, type LucideIcon } from 'lucide-react'
import { goalsCol, healthLogsCol, remindersCol, type Goal, type HealthLog, type Reminder } from '@/lib/firestore'
import { Button, IconButton, Skeleton } from './ui'
import type { HomeView } from './home'

export function localDateString(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Re-renders when the local day changes so "today" panels follow midnight.
export function useToday(): string {
  const [day, setDay] = useState(() => localDateString())
  useEffect(() => {
    const id = setInterval(() => setDay(localDateString()), 60000)
    return () => clearInterval(id)
  }, [])
  return day
}

// Flat block inside the Today column: separated by dividers, never a card inside a card.
function Section({ children }: { children: ReactNode }) {
  return <section className="border-b border-border px-5 py-5 last:border-b-0">{children}</section>
}

const sleepText = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`

export function TodayReminders({ uid, day }: { uid: string; day: string }) {
  const [items, setItems] = useState<(Reminder & { id: string })[] | null>(null)
  useEffect(() => {
    const [y, m, d] = day.split('-').map(Number)
    const start = Timestamp.fromDate(new Date(y, m - 1, d))
    const end = Timestamp.fromDate(new Date(y, m - 1, d + 1))
    const q = query(remindersCol(uid), where('dueAt', '>=', start), where('dueAt', '<', end), orderBy('dueAt'))
    return onSnapshot(
      q,
      (snap) => setItems(snap.docs.map((s) => ({ ...s.data(), id: s.id })).filter((r) => !r.done)),
      () => setItems([]),
    )
  }, [uid, day])
  return (
    <Section>
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Bell size={16} aria-hidden="true" className="text-muted-foreground" />
        Today&apos;s reminders
      </h2>
      {items === null ? <Skeleton className="mt-4 h-8" /> : items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nothing due today. Tell Echo what to remind you about.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3 text-sm">
          {items.map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-foreground">{r.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {r.dueAt.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

export function HealthToday({ uid, day, onNavigate }: { uid: string; day: string; onNavigate: (v: HomeView) => void }) {
  const [log, setLog] = useState<HealthLog | null | undefined>(undefined)
  useEffect(() => {
    return onSnapshot(
      doc(healthLogsCol(uid), day),
      (snap) => setLog(snap.exists() ? snap.data() : null),
      () => setLog(null),
    )
  }, [uid, day])
  const rows: [string, string, LucideIcon][] = []
  if (log) {
    if (log.mood != null) rows.push(['Mood', `${log.mood}/10`, Smile])
    if (log.sleepMinutes != null) rows.push(['Sleep', sleepText(log.sleepMinutes), Moon])
    if (log.waterGlasses != null) rows.push(['Water', `${log.waterGlasses} glasses`, Droplet])
    if (log.energy) rows.push(['Energy', log.energy, Zap])
  }
  return (
    <Section>
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <HeartPulse size={16} aria-hidden="true" className="text-muted-foreground" />
        Health today
      </h2>
      {log === undefined ? <Skeleton className="mt-4 h-8" /> : rows.length === 0 ? (
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={() => onNavigate('Health')}>
            Log how you feel
          </Button>
        </div>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          {rows.map(([k, v, Icon]) => (
            <div key={k}>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon size={14} aria-hidden="true" />
                {k}
              </dt>
              <dd className="mt-1 capitalize text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </Section>
  )
}

export function GoalProgress({ uid, onNavigate }: { uid: string; onNavigate: (v: HomeView) => void }) {
  const [goals, setGoals] = useState<(Goal & { id: string })[] | null>(null)
  useEffect(() => {
    const q = query(goalsCol(uid), orderBy('createdAt', 'desc'), limit(5))
    return onSnapshot(
      q,
      (snap) => setGoals(snap.docs.map((s) => ({ ...s.data({ serverTimestamps: 'estimate' }), id: s.id }))),
      () => setGoals([]),
    )
  }, [uid])
  return (
    <Section>
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Target size={16} aria-hidden="true" className="text-muted-foreground" />
        Goal progress
      </h2>
      {goals === null ? <Skeleton className="mt-4 h-8" /> : goals.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No goals yet. Tell Echo a goal and it will appear here.</p>
      ) : (
        goals.map((g) => (
          <button key={g.id} onClick={() => onNavigate('Goals')} className="mt-4 block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <div className="flex justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-foreground">{g.title}</span>
              <span className="shrink-0 text-muted-foreground">{Math.round(g.progress)}%</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-surface-2" aria-hidden="true">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, g.progress))}%` }} />
            </div>
          </button>
        ))
      )}
    </Section>
  )
}

/** Reminders, health and goals for today, stacked as flat sections. */
export function TodayPanel({ uid, day, onNavigate }: { uid: string; day: string; onNavigate: (v: HomeView) => void }) {
  return (
    <>
      <TodayReminders uid={uid} day={day} />
      <HealthToday uid={uid} day={day} onNavigate={onNavigate} />
      <GoalProgress uid={uid} onNavigate={onNavigate} />
    </>
  )
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Right-hand drawer (below xl): focus-trapped, Esc or the backdrop closes it, closes if the viewport grows to xl. */
export function TodayDrawer({ uid, day, onNavigate, onClose }: { uid: string; day: string; onNavigate: (v: HomeView) => void; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    const mq = window.matchMedia('(min-width: 1280px)')
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) onClose()
    }
    mq.addEventListener('change', onChange)
    return () => {
      mq.removeEventListener('change', onChange)
      document.body.style.overflow = prevOverflow
      previous?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !panel.current) return
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (!panel.current.contains(document.activeElement) || document.activeElement === panel.current) {
      e.preventDefault()
      ;(e.shiftKey ? last : first).focus()
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
  return (
    <div className="fixed inset-0 z-50 xl:hidden" onKeyDown={onKeyDown}>
      <div aria-hidden="true" className="absolute inset-0 bg-background/80" onClick={onClose} />
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Today" className="absolute inset-y-0 right-0 flex w-80 max-w-[90vw] flex-col overflow-y-auto border-l border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold text-foreground">Today</h2>
          <IconButton icon={X} label="Close Today" size="sm" onClick={onClose} />
        </div>
        <TodayPanel uid={uid} day={day} onNavigate={(v) => { onClose(); onNavigate(v) }} />
      </div>
    </div>
  )
}
