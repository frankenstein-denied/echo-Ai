'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { User } from 'firebase/auth'
import { doc, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore'
import { AlarmClock, Bell, Check, MoreHorizontal, Plus, Trash2, Undo2, X } from 'lucide-react'
import { addReminder, deleteReminder, remindersCol, routinesCol, setReminderDone, type Reminder, type Routine, type UserProfile } from '@/lib/firestore'
import { queueNativeNotificationRefresh } from '@/lib/native/echo-bridge'
import { routinesToday } from '@/lib/echo/reminders-helpers'
import { localTimeZone, reminderSections, snoozeUntil } from '@/lib/echo/day-groups'
import { ORB_COLOR } from '@/lib/echo/orbs'
import { tagStyle, timeChipLabel } from '@/lib/echo/glow'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { cn } from '@/lib/utils'
import { Alert, Button, Card, ConfirmDialog, EmptyState, IconButton, Input, PageHeader, Skeleton } from './ui'
import { useDay } from './use-day'
import { AskEcho } from './ask-echo'
import type { HomeView } from './home'

type ReminderRow = Reminder & { id: string; dueMs: number }

const SOURCE_LABEL: Record<string, string> = { chat: 'from chat', routine: 'routine' }
const RC = ORB_COLOR.reminder
const SWIPE_AT = 80 // px past which a swipe acts
const DONE_SHOWN = 5

function defaultDueValue(): string {
  const d = new Date(Date.now() + 3600000)
  d.setMinutes(0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "in 15 min", "Overdue · 9:00 AM", or the time chip label ("7:00 PM", "Tomorrow 6:30 AM", "Nov 28, 9:00 AM"). */
function dueText(r: ReminderRow, now: Date): string {
  const at = new Date(r.dueMs)
  if (r.done) return timeChipLabel(at, now)
  const mins = Math.round((r.dueMs - now.getTime()) / 60000)
  if (mins < 0) return `Overdue · ${timeChipLabel(at, now)}`
  if (mins === 0) return 'now'
  if (mins < 60) return `in ${mins} min`
  return timeChipLabel(at, now)
}

const NEXT_CARD: CSSProperties = {
  background: `radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, ${RC} 18%, transparent), transparent 55%), var(--color-surface)`,
  borderColor: `color-mix(in srgb, ${RC} 40%, transparent)`,
}
const OVERDUE_CARD: CSSProperties = { borderColor: 'color-mix(in srgb, var(--color-danger) 40%, transparent)' }

/** The ⋯ menu: the accessible way to do what the swipes do, plus delete. */
function RowMenu({ r, onDone, onSnooze, onDelete }: { r: ReminderRow; onDone: () => void; onSnooze: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    box.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }
  const items = [
    { label: r.done ? 'Mark not done' : 'Mark done', icon: r.done ? Undo2 : Check, run: onDone },
    ...(r.done ? [] : [{ label: 'Snooze 30 min', icon: AlarmClock, run: onSnooze }]),
    { label: 'Delete', icon: Trash2, run: onDelete, danger: true },
  ]

  return (
    <div ref={box} className="relative shrink-0">
      <IconButton ref={trigger} icon={MoreHorizontal} label={`More for: ${r.title}`} size="sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div
          role="menu"
          aria-label={r.title}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
            e.preventDefault()
            const list = [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
            const i = list.indexOf(document.activeElement as HTMLElement)
            list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus()
          }}
          className="absolute right-0 top-full z-20 mt-1 grid min-w-48 gap-0.5 rounded-xl border border-border-strong bg-surface-2 p-1 shadow-xl"
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={pick(it.run)}
              className={cn('flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-surface lg:min-h-9', it.danger ? 'text-danger' : 'text-foreground', FOCUS_RING)}
            >
              <it.icon size={16} aria-hidden="true" />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** One reminder. Swipe right = done (or not done), swipe left = snooze 30 min; the ⋯ menu does the same. */
function ReminderItem({ r, now, next, onDone, onSnooze, onDelete }: { r: ReminderRow; now: Date; next: boolean; onDone: () => void; onSnooze: () => void; onDelete: () => void }) {
  const [dx, setDx] = useState(0)
  const drag = useRef<{ id: number; x: number; y: number; swiping: boolean } | null>(null)
  const swiped = useRef(false)
  const overdue = !r.done && r.dueMs < now.getTime()
  const canSnooze = !r.done

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, swiping: false }
    swiped.current = false
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const mx = e.clientX - d.x
    const my = e.clientY - d.y
    if (!d.swiping) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) {
        drag.current = null // a scroll, not a swipe
        return
      }
      if (Math.abs(mx) < 10) return
      d.swiping = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    setDx(Math.max(canSnooze ? -120 : 0, Math.min(120, mx)))
  }
  const finish = (e: ReactPointerEvent<HTMLDivElement>, act: boolean) => {
    const d = drag.current
    drag.current = null
    if (!d || d.id !== e.pointerId || !d.swiping) return
    swiped.current = true
    if (act && dx >= SWIPE_AT) onDone()
    else if (act && dx <= -SWIPE_AT && canSnooze) onSnooze()
    setDx(0)
  }

  const meta = [dueText(r, now), SOURCE_LABEL[r.source]].filter(Boolean).join(' · ')

  return (
    <li className="relative overflow-hidden rounded-2xl">
      {/* What the swipe will do, revealed under the row. */}
      {dx !== 0 && (
        <div aria-hidden="true" className={cn('absolute inset-0 flex items-center px-5 text-sm font-semibold', dx > 0 ? 'justify-start bg-primary-soft text-primary' : 'justify-end text-warning')} style={dx < 0 ? { background: 'var(--color-warning-soft)' } : undefined}>
          {dx > 0 ? (
            <span className="flex items-center gap-2"><Check size={16} />{r.done ? 'Not done' : 'Done'}</span>
          ) : (
            <span className="flex items-center gap-2"><AlarmClock size={16} />Snooze 30 min</span>
          )}
        </div>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, true)}
        onPointerCancel={(e) => finish(e, false)}
        onClickCapture={(e) => {
          // The click that ends a swipe must not also tick the box.
          if (swiped.current) {
            e.stopPropagation()
            e.preventDefault()
            swiped.current = false
          }
        }}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? 'none' : 'transform 150ms ease-out', touchAction: 'pan-y', ...(next ? NEXT_CARD : overdue ? OVERDUE_CARD : undefined) }}
        className={cn('relative flex items-center gap-1 rounded-2xl border border-border bg-surface py-1 pl-1 pr-1 select-none', r.done && 'opacity-55')}
      >
        <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl py-1.5 pl-2.5">
          <input
            type="checkbox"
            checked={r.done}
            onChange={onDone}
            aria-label={`Done: ${r.title}`}
            className={cn('size-5 shrink-0 cursor-pointer rounded-md accent-primary', FOCUS_RING)}
            style={!r.done && (next || overdue) ? { accentColor: RC } : undefined}
          />
          <span className="block min-w-0 flex-1">
            <span className={cn('block truncate text-[15px] font-medium lg:text-sm', r.done ? 'text-muted-foreground line-through' : 'text-foreground')}>{r.title}</span>
            <span className={cn('mt-0.5 block truncate text-xs', overdue ? 'text-danger' : next ? '' : 'text-muted-foreground')} style={next && !overdue ? { color: RC } : undefined}>
              {meta}
            </span>
          </span>
        </label>
        <RowMenu r={r} onDone={onDone} onSnooze={onSnooze} onDelete={onDelete} />
      </div>
    </li>
  )
}

export function RemindersView({ uid, user, profile, onNavigate }: { uid: string; user: User; profile: UserProfile; onNavigate?: (view: HomeView) => void }) {
  const day = useDay()
  const [items, setItems] = useState<ReminderRow[] | null>(null)
  const [routines, setRoutines] = useState<(Routine & { id: string })[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(defaultDueValue)
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState<ReminderRow | null>(null)
  const [allDone, setAllDone] = useState(false)
  const [routinesOpen, setRoutinesOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const titleRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (formOpen) titleRef.current?.focus()
  }, [formOpen])

  // `day` forces a recompute when the date rolls over (e.g. tab returns from background).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sections = useMemo(() => reminderSections(items ?? [], now.getTime(), localTimeZone()), [items, now, day])

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
      setFormOpen(false)
    }, 'Could not add the reminder.')
    setAdding(false)
  }

  const toggleDone = (r: ReminderRow) => run(() => setReminderDone(uid, r.id, !r.done), 'Could not update the reminder.')
  const snooze = (r: ReminderRow) =>
    run(async () => {
      await updateDoc(doc(remindersCol(uid), r.id), { dueAt: Timestamp.fromMillis(snoozeUntil(r.dueMs, Date.now())), updatedAt: serverTimestamp() } as never)
      queueNativeNotificationRefresh()
    }, 'Could not snooze the reminder.')
  const remove = (r: ReminderRow) => {
    setConfirm(null)
    run(() => deleteReminder(uid, r.id), 'Could not delete the reminder.')
  }

  const today = sections.find((s) => s.key === 'today')
  const leftToday = today?.items.length ?? 0
  const nextId = today?.items.find((r) => r.dueMs >= now.getTime())?.id
  const oneLiner = items === null ? undefined : leftToday === 0 ? 'Nothing left today' : `${leftToday} left today`
  const todaysRoutines = routines ? routinesToday(routines, now) : []

  return (
    <div className="animate-in">
      <PageHeader
        title="Reminders"
        description={oneLiner}
        action={
          <div className="flex justify-end">
            <IconButton icon={formOpen ? X : Plus} label={formOpen ? 'Close the new reminder form' : 'New reminder by hand'} variant="secondary" aria-expanded={formOpen} onClick={() => setFormOpen((o) => !o)} />
          </div>
        }
      />
      {(error || loadError) && (
        <div className="mb-4">
          <Alert variant="danger">{error || loadError}</Alert>
        </div>
      )}
      <div className="grid content-start gap-4">
        {formOpen && (
          <Card>
            <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
              <Input ref={titleRef} label="New reminder" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Remind me to..." maxLength={500} />
              <Input label="Due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
              <Button type="submit" icon={Plus} loading={adding} disabled={!title.trim()} className="max-md:w-full">
                Add reminder
              </Button>
            </form>
          </Card>
        )}
        <AskEcho user={user} profile={profile} placeholder="Remind me to… (call mom tomorrow at 7pm)" onNavigate={onNavigate} />
        {items === null ? (
          <Skeleton className="h-40" />
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} title="No reminders yet" description="Tell Echo above, the way you would say it. Or tap + to pick a date yourself." />
        ) : (
          <div className="grid gap-4">
            {sections.map((s) => {
              const list = s.key === 'done' && !allDone ? s.items.slice(0, DONE_SHOWN) : s.items
              return (
                <section key={s.key} aria-label={s.label}>
                  <h2 className="mb-2 px-0.5 text-xs font-semibold uppercase tracking-widest text-subtle">{s.label}</h2>
                  <ul className="grid gap-2">
                    {list.map((r) => (
                      <ReminderItem key={r.id} r={r} now={now} next={r.id === nextId} onDone={() => void toggleDone(r)} onSnooze={() => void snooze(r)} onDelete={() => setConfirm(r)} />
                    ))}
                  </ul>
                  {s.key === 'done' && s.items.length > DONE_SHOWN && (
                    <button type="button" onClick={() => setAllDone((v) => !v)} className={`mt-2 min-h-11 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground lg:min-h-9 ${FOCUS_RING}`}>
                      {allDone ? 'Show fewer' : `Show all ${s.items.length} done`}
                    </button>
                  )}
                </section>
              )
            })}
            <p className="px-0.5 text-xs text-subtle lg:hidden">Swipe right for done, left to snooze 30 min.</p>
          </div>
        )}
        {routines && routines.length > 0 && (
          <section aria-label="Routines" className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {todaysRoutines.map((r) => (
                <span key={r.id} className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" style={tagStyle('reminder')}>
                  ↻ {r.title}
                </span>
              ))}
              <button type="button" aria-expanded={routinesOpen} onClick={() => setRoutinesOpen((o) => !o)} className={`min-h-11 rounded-lg border border-border px-3 text-sm text-foreground transition-colors hover:bg-surface-2 lg:min-h-9 ${FOCUS_RING}`}>
                All routines ({routines.length})
              </button>
            </div>
            {routinesOpen && (
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
            )}
          </section>
        )}
      </div>
      {confirm && <ConfirmDialog title={`Delete “${confirm.title}”?`} body="This can't be undone." confirmLabel="Delete" onCancel={() => setConfirm(null)} onConfirm={() => remove(confirm)} />}
    </div>
  )
}
