'use client'

import { useEffect, useState } from 'react'
import { doc, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { Bell, Droplet, HeartPulse, Moon, Smile, Target, Zap, type LucideIcon } from 'lucide-react'
import { goalsCol, healthLogsCol, remindersCol, type Goal, type HealthLog, type Reminder } from '@/lib/firestore'
import { Button, Card, Skeleton } from './ui'
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
    <Card>
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
    </Card>
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
    <Card>
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
    </Card>
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
    <Card>
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
    </Card>
  )
}
