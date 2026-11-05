'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { onSnapshot, orderBy, query } from 'firebase/firestore'
import { Bell, Plus, Trash2 } from 'lucide-react'
import { addReminder, deleteReminder, remindersCol, routinesCol, setReminderDone, type Reminder, type Routine } from '@/lib/firestore'
import { reminderTimeline, routinesToday } from '@/lib/echo/reminders-helpers'
import { ORB_COLOR } from '@/lib/echo/orbs'
import { tagStyle } from '@/lib/echo/glow'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, IconButton, Input, PageHeader, Skeleton } from './ui'
import { useDay } from './use-day'
import { useIsMobile } from './use-mobile'
import { GlowDot, TimeChip } from './glow'

type FoldKey = 'tomorrow' | 'thisWeek' | 'later' | 'doneEarlier' | 'routines'

type ReminderRow = Reminder & { id: string; dueMs: number }

const SOURCE_LABEL: Record<string, string> = { chat: 'From chat', routine: 'Routine', manual: 'Added by you' }

function defaultDueValue(): string {
  const d = new Date(Date.now() + 3600000)
  d.setMinutes(0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const RC = ORB_COLOR.reminder
const OVERDUE_NODE: CSSProperties = { background: 'var(--color-danger)', boxShadow: '0 0 8px var(--color-danger)' }
const DONE_NODE: CSSProperties = { background: RC, opacity: 0.5 }
const UPCOMING_NODE: CSSProperties = { background: 'var(--color-background)', border: `2px solid ${RC}` }
const OVERDUE_CARD: CSSProperties = { borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)' }
const NEXT_CARD: CSSProperties = { borderColor: `color-mix(in srgb, ${RC} 45%, transparent)`, boxShadow: `0 0 14px color-mix(in srgb, ${RC} 25%, transparent)` }
const FOLD_BTN = `rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-surface-2 ${FOCUS_RING}`

export function RemindersView({ uid }: { uid: string }) {
  const day = useDay()
  const [items, setItems] = useState<ReminderRow[] | null>(null)
  const [routines, setRoutines] = useState<(Routine & { id: string })[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(defaultDueValue)
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState<ReminderRow | null>(null)
  const [open, setOpen] = useState<FoldKey | null>(null)
  const [now, setNow] = useState(() => new Date())
  // Touch layouts: the whole row (label) toggles done; desktop: only the checkbox does.
  const HitRow = useIsMobile() ? 'label' : 'div'

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

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  // `day` forces a recompute when the date rolls over (e.g. tab returns from background).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tl = useMemo(() => reminderTimeline(items ?? [], new Date()), [items, now, day])

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
    setConfirm(null)
    run(() => deleteReminder(uid, r.id), 'Could not delete the reminder.')
  }

  const nowMs = now.getTime()
  const nowLabel = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  const rowBody = (r: ReminderRow, state: 'upcoming' | 'overdue' | 'done') => (
    <>
      {/* The label makes checkbox + text one tap target on touch screens. */}
      <HitRow className="flex min-w-0 flex-1 items-center gap-3">
        <input type="checkbox" className="size-4 shrink-0 accent-primary max-lg:size-5" checked={r.done} onChange={() => run(() => setReminderDone(uid, r.id, !r.done), 'Could not update the reminder.')} aria-label={`Done: ${r.title}`} />
        <GlowDot kind="reminder" />
        <span className="block min-w-0 flex-1">
          <span className={`block truncate text-sm ${r.done ? 'text-muted-foreground line-through' : 'text-foreground'} max-lg:text-[15px]`}>{r.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <TimeChip at={new Date(r.dueMs)} now={now} state={state} />
            <span className="sm:hidden">{SOURCE_LABEL[r.source] ?? r.source}</span>
          </span>
        </span>
      </HitRow>
      <span className="max-sm:hidden">
        <Badge variant="neutral">{SOURCE_LABEL[r.source] ?? r.source}</Badge>
      </span>
      <IconButton icon={Trash2} label={`Delete reminder: ${r.title}`} size="sm" onClick={() => setConfirm(r)} />
    </>
  )

  const foldRow = (r: ReminderRow) => (
    <div key={r.id} className="flex items-center gap-3 border-b border-border py-3 last:border-b-0 max-lg:gap-2 max-lg:py-2">
      {rowBody(r, r.done ? 'done' : r.dueMs < nowMs ? 'overdue' : 'upcoming')}
    </div>
  )

  const timelineCard = (r: ReminderRow, state: 'upcoming' | 'overdue' | 'done', nodeStyle: CSSProperties, cardStyle?: CSSProperties) => (
    <li key={r.id} className="relative">
      <span aria-hidden="true" className="absolute -left-6 top-4 size-3 rounded-full" style={nodeStyle} />
      <div className={`flex items-center gap-3 rounded-xl border bg-surface-2/40 px-3 py-2 max-lg:gap-2 ${state === 'done' ? 'opacity-60' : ''}`} style={cardStyle ?? { borderColor: 'var(--color-border)' }}>
        {rowBody(r, state)}
      </div>
    </li>
  )

  const todayEmpty = tl.overdue.length + tl.doneToday.length + tl.upcoming.length === 0
  const todaysRoutines = routines ? routinesToday(routines, now) : []
  const routineChips =
    todaysRoutines.length > 0 ? (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">↻ Today&apos;s routines</span>
        {todaysRoutines.map((r) => (
          <span key={r.id} className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" style={tagStyle('reminder')}>
            ↻ {r.title}
          </span>
        ))}
      </div>
    ) : null
  const routinesButton =
    routines && routines.length > 0 ? (
      <button type="button" aria-expanded={open === 'routines'} onClick={() => setOpen(open === 'routines' ? null : 'routines')} className={FOLD_BTN}>
        All routines ({routines.length})
      </button>
    ) : null
  const routinesCard =
    open === 'routines' && routines ? (
      <Card>
        <h2 className="text-base font-semibold text-foreground">All routines</h2>
        {routines.map((r) => (
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
        ))}
      </Card>
    ) : null
  const folds: { key: FoldKey; label: string; rows: ReminderRow[] }[] = [
    { key: 'tomorrow', label: 'Tomorrow', rows: tl.tomorrow },
    { key: 'thisWeek', label: 'This week', rows: tl.thisWeek },
    { key: 'later', label: 'Later', rows: tl.later },
    { key: 'doneEarlier', label: 'Done earlier', rows: tl.doneEarlier },
  ]

  return (
    <div className="animate-in">
      <PageHeader title="Reminders" description="Things Echo will nudge you about, and routines it has learned." />
      {(error || loadError) && (
        <div className="mb-4">
          <Alert variant="danger">{error || loadError}</Alert>
        </div>
      )}
      <div className="grid content-start gap-5">
        <Card>
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <Input label="New reminder" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Remind me to..." maxLength={500} />
            <Input label="Due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
            <Button type="submit" icon={Plus} loading={adding} disabled={!title.trim()} className="max-md:w-full">
              Add reminder
            </Button>
          </form>
        </Card>
        {items === null ? (
          <Skeleton className="h-40" />
        ) : items.length === 0 ? (
          <>
            <EmptyState icon={Bell} title="No reminders yet" description="Add one above or tell Echo what to remind you about." />
            {routineChips && <Card>{routineChips}</Card>}
            {routinesButton && <div className="flex flex-wrap gap-2">{routinesButton}</div>}
            {routinesCard}
          </>
        ) : (
          <>
            <Card>
              <h2 className="text-base font-semibold text-foreground">Today · {now.toLocaleDateString('en-US', { weekday: 'long' })}</h2>
              {routineChips}
              <div className="relative mt-4 pl-6">
                <span aria-hidden="true" className="absolute bottom-0 left-[5px] top-0 w-0.5 bg-border" />
                <ul className="grid gap-3">
                  {tl.overdue.map((r) => timelineCard(r, 'overdue', OVERDUE_NODE, OVERDUE_CARD))}
                  {tl.doneToday.map((r) => timelineCard(r, 'done', DONE_NODE))}
                  <li className="relative flex items-center py-1">
                    <span aria-hidden="true" className="absolute -left-6 top-1/2 h-0.5 w-[18px] -translate-y-1/2 rounded bg-primary" />
                    <span className="text-xs font-semibold text-primary">now · {nowLabel}</span>
                  </li>
                  {tl.upcoming.map((r, i) => timelineCard(r, 'upcoming', UPCOMING_NODE, i === 0 ? NEXT_CARD : undefined))}
                </ul>
                {todayEmpty && <p className="mt-3 text-sm text-muted-foreground">Nothing else today.</p>}
              </div>
            </Card>
            <div className="flex flex-wrap gap-2">
              {folds
                .filter((f) => f.rows.length > 0)
                .map((f) => (
                  <button key={f.key} type="button" aria-expanded={open === f.key} onClick={() => setOpen(open === f.key ? null : f.key)} className={FOLD_BTN}>
                    {f.label} ({f.rows.length})
                  </button>
                ))}
              {routinesButton}
            </div>
            {folds.map((f) => open === f.key && f.rows.length > 0 && <Card key={f.key}>{f.rows.map(foldRow)}</Card>)}
            {routinesCard}
          </>
        )}
      </div>
      {confirm && <ConfirmDialog title={`Delete “${confirm.title}”?`} body="This can't be undone." confirmLabel="Delete" onCancel={() => setConfirm(null)} onConfirm={() => remove(confirm)} />}
    </div>
  )
}
