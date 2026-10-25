'use client'

import { useEffect, useMemo, useState } from 'react'
import { onSnapshot, orderBy, query } from 'firebase/firestore'
import { Bell, Plus, Trash2 } from 'lucide-react'
import { addReminder, deleteReminder, remindersCol, routinesCol, setReminderDone, type Reminder, type Routine } from '@/lib/firestore'
import { splitReminders } from '@/lib/echo/view-helpers'
import { Alert, Badge, Button, Card, EmptyState, IconButton, Input, PageHeader, Skeleton } from './ui'

type ReminderRow = Reminder & { id: string; dueMs: number }

const SOURCE_LABEL: Record<string, string> = { chat: 'From chat', routine: 'Routine', manual: 'Added by you' }

const dueText = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function defaultDueValue(): string {
  const d = new Date(Date.now() + 3600000)
  d.setMinutes(0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function RemindersView({ uid }: { uid: string }) {
  const [items, setItems] = useState<ReminderRow[] | null>(null)
  const [routines, setRoutines] = useState<(Routine & { id: string })[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(defaultDueValue)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    const q = query(remindersCol(uid), orderBy('dueAt'))
    return onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((s) => ({ ...s.data({ serverTimestamps: 'estimate' }), id: s.id, dueMs: s.data().dueAt.toMillis() })))
        setLoadError('')
      },
      (e) => {
        setItems([])
        setLoadError(e.message || 'Could not load your reminders.')
      },
    )
  }, [uid])

  useEffect(() => {
    return onSnapshot(
      query(routinesCol(uid), orderBy('createdAt', 'desc')),
      (snap) => setRoutines(snap.docs.map((s) => ({ ...s.data({ serverTimestamps: 'estimate' }), id: s.id }))),
      () => setRoutines([]),
    )
  }, [uid])

  const { upcoming, done } = useMemo(() => splitReminders(items ?? []), [items])

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    const when = new Date(due)
    if (!t || Number.isNaN(when.getTime())) return
    setAdding(true)
    await run(async () => {
      await addReminder(uid, { title: t.slice(0, 500), dueAt: when, source: 'manual' })
      setTitle('')
      setDue(defaultDueValue())
    }, 'Could not add the reminder.')
    setAdding(false)
  }

  const remove = (r: ReminderRow) => {
    if (!window.confirm(`Delete the reminder "${r.title}"?`)) return
    run(() => deleteReminder(uid, r.id), 'Could not delete the reminder.')
  }

  const row = (r: ReminderRow) => (
    <div key={r.id} className="flex items-center gap-3 border-b border-border py-3 last:border-b-0">
      <input type="checkbox" className="size-4 accent-primary" checked={r.done} onChange={() => run(() => setReminderDone(uid, r.id, !r.done), 'Could not update the reminder.')} aria-label={`Done: ${r.title}`} />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${r.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{r.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{dueText(r.dueMs)}</p>
      </div>
      <Badge variant="neutral">{SOURCE_LABEL[r.source] ?? r.source}</Badge>
      <IconButton icon={Trash2} label={`Delete reminder: ${r.title}`} size="sm" onClick={() => remove(r)} />
    </div>
  )

  return (
    <div className="animate-in">
      <PageHeader title="Reminders" description="Things Echo will nudge you about, and routines it has learned." />
      {(error || loadError) && (
        <div className="mb-4">
          <Alert variant="danger">{error || loadError}</Alert>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="grid content-start gap-5">
          <Card>
            <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
              <Input label="New reminder" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Remind me to..." maxLength={500} />
              <Input label="Due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
              <Button type="submit" icon={Plus} loading={adding} disabled={!title.trim()}>
                Add reminder
              </Button>
            </form>
          </Card>
          {items === null ? (
            <Skeleton className="h-40" />
          ) : items.length === 0 ? (
            <EmptyState icon={Bell} title="No reminders yet" description="Add one above or tell Echo what to remind you about." />
          ) : (
            <Card>
              <h2 className="text-base font-semibold text-foreground">Upcoming</h2>
              <div className="mt-2">{upcoming.length === 0 ? <p className="py-3 text-sm text-muted-foreground">Nothing upcoming.</p> : upcoming.map(row)}</div>
              {done.length > 0 && (
                <>
                  <h2 className="mt-6 text-base font-semibold text-foreground">Done</h2>
                  <div className="mt-2">{done.map(row)}</div>
                </>
              )}
            </Card>
          )}
        </div>
        <Card className="self-start">
          <h2 className="text-base font-semibold text-foreground">Learned routines</h2>
          {routines === null ? (
            <Skeleton className="mt-4 h-10" />
          ) : routines.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Echo will list routines here as it learns them.</p>
          ) : (
            routines.map((r) => (
              <div key={r.id} className="mt-4">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-foreground">
                    {r.title} · {r.cadence}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{Math.round(r.confidence * 100)}%</span>
                </div>
                <div className="mt-2 h-1.5 rounded bg-surface-2" aria-hidden="true">
                  <div className="h-full rounded bg-primary" style={{ width: `${Math.min(100, Math.max(0, r.confidence * 100))}%` }} />
                </div>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  )
}
