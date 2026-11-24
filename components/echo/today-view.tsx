'use client'

/**
 * TodayView: the mobile home tab. Greeting with a one-line summary, today's diary page (opens the diary),
 * "Up next" (the next reminders and the most active goal) and one "Echo noticed" card from local rules
 * (lib/echo/today-noticed.ts; hidden when nothing applies). Live listeners only, no AI call.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { User } from 'firebase/auth'
import { doc, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { Check, ChevronRight, Loader2 } from 'lucide-react'
import { addWaterGlass, diaryPagesCol, goalsCol, healthLogsCol, remindersCol, setReminderDone, watchCheckInSettings, type DiaryPage, type UserProfile } from '@/lib/firestore'
import { resolveCheckInSettings, type CheckInSettings } from '@/lib/echo/check-ins'
import { pickTodayPage, sortPages } from '@/lib/echo/diary'
import { ORB_COLOR, ORB_KINDS, type OrbKind } from '@/lib/echo/orbs'
import { quickSend, quickSendError } from '@/lib/echo/quick-send'
import { dueLabel, noticed } from '@/lib/echo/today-noticed'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { ProgressRing } from './glow'
import { MobileTitleBar } from './mobile-tabbar'
import { OrbSwatch } from './memory-orb'
import { Skeleton } from './ui'
import { useDay } from './use-day'
import type { TabView } from './mobile-tabbar'

type ReminderRow = { id: string; title: string; dueMs: number }
type GoalRow = { id: string; title: string; progress: number; nextMilestone?: string }
type Page = DiaryPage & { id: string }

const glow = (color: string): CSSProperties => ({ background: `radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, ${color} 18%, transparent), transparent 55%), var(--color-surface)` })
const card = 'rounded-2xl border border-border bg-surface p-3'
const label = 'mb-2 mt-5 px-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-subtle'

function greeting(d: Date): string {
  const h = d.getHours()
  if (h >= 5 && h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  return 'Good evening'
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function TodayView({ user, profile, onNavigate, onOpenPage }: { user: User; profile: UserProfile; onNavigate: (v: TabView) => void; onOpenPage: (pageId: string) => void }) {
  const uid = user.uid
  const day = useDay()
  const dayKey = day
  const [reminders, setReminders] = useState<ReminderRow[] | null>(null)
  const [goals, setGoals] = useState<GoalRow[] | null>(null)
  const [water, setWater] = useState(0)
  const [page, setPage] = useState<Page | null | undefined>(undefined)
  const [settings, setSettings] = useState<CheckInSettings>(() => resolveCheckInSettings(profile))
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(
    () =>
      onSnapshot(
        query(remindersCol(uid), where('done', '==', false)),
        (snap) =>
          setReminders(
            snap.docs
              .map((d) => {
                const r = d.data({ serverTimestamps: 'estimate' })
                return { id: d.id, title: r.title, dueMs: r.dueAt?.toMillis?.() as number }
              })
              .filter((r) => Number.isFinite(r.dueMs))
              .sort((a, b) => a.dueMs - b.dueMs),
          ),
        (e) => {
          console.error('Echo: today reminders listener failed', e)
          setReminders([])
        },
      ),
    [uid],
  )

  useEffect(
    () =>
      onSnapshot(
        query(goalsCol(uid), orderBy('updatedAt', 'desc'), limit(10)),
        (snap) =>
          setGoals(
            snap.docs.map((d) => {
              const g = d.data({ serverTimestamps: 'estimate' })
              return { id: d.id, title: g.title, progress: Math.round(Number(g.progress) || 0), nextMilestone: (g.milestones ?? []).find((m) => !m.done)?.text }
            }),
          ),
        (e) => {
          console.error('Echo: today goals listener failed', e)
          setGoals([])
        },
      ),
    [uid],
  )

  useEffect(
    () =>
      onSnapshot(
        doc(healthLogsCol(uid), dayKey),
        (snap) => setWater(Number(snap.data()?.waterGlasses) || 0),
        () => setWater(0),
      ),
    [uid, dayKey],
  )

  useEffect(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return onSnapshot(
      query(diaryPagesCol(uid), where('createdAt', '>=', Timestamp.fromDate(start)), limit(50)),
      (snap) => setPage(pickTodayPage(sortPages(snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id })))) ?? null),
      () => setPage(null),
    )
  }, [uid, day])

  useEffect(
    () =>
      watchCheckInSettings(
        uid,
        (s) => setSettings(s),
        () => undefined,
      ),
    [uid],
  )

  const dueToday = useMemo(() => {
    const end = new Date(now)
    end.setHours(24, 0, 0, 0)
    return (reminders ?? []).filter((r) => r.dueMs < end.getTime()).length
  }, [reminders, now])
  const upNext = (reminders ?? []).slice(0, 2)
  const topGoal = (goals ?? []).find((g) => g.progress < 100) ?? null
  const nextReminder = (reminders ?? []).find((r) => r.dueMs >= now)
  const notice = noticed({ nowMs: now, waterGlasses: water, waterGoal: settings.waterGoal, nextReminderDueMs: nextReminder?.dueMs, nextReminderTitle: nextReminder?.title, sleepStart: settings.sleepStart, sleepEnd: settings.sleepEnd })

  const name = profile.preferredName?.trim()
  const hello = `${greeting(new Date(now))}${name ? `, ${name}` : ''}`
  const weekday = new Date(now).toLocaleDateString('en-US', { weekday: 'long' })
  const summary = [weekday, plural(dueToday, 'reminder'), `${water}/${settings.waterGoal} water`].join(' · ')

  const counts = useMemo(() => {
    const c = Object.fromEntries(ORB_KINDS.map((k) => [k, 0])) as Record<OrbKind, number>
    for (const k of ['note', 'goal', 'reminder', 'health'] as const) {
      const v = page?.mix?.[k]
      if (typeof v === 'number' && v > 0) c[k] = v
    }
    return c
  }, [page])
  const savedCount = Object.values(counts).reduce((a, b) => a + b, 0)
  const pageLine =
    page === undefined ? '' : !page ? 'Nothing yet. Tell Echo about your day.' : savedCount ? `${plural(savedCount, 'thing')} saved so far` : page.messageCount ? plural(page.messageCount, 'message') : 'Nothing saved yet'

  return (
    <div className="animate-in">
      <MobileTitleBar title={hello} />
      <div className="mx-auto max-w-xl">
        <header className="mb-4">
          <h1 className="text-xl font-semibold tracking-tight text-foreground max-lg:hidden lg:text-2xl">{hello}</h1>
          <p className="text-sm text-muted-foreground">{summary}</p>
        </header>

        <button
          type="button"
          onClick={() => (page ? onOpenPage(page.id) : onNavigate('Diary'))}
          className={`${card} flex w-full items-center gap-3 text-left ${FOCUS_RING}`}
          style={glow('#2dd4bf')}
        >
          {savedCount ? (
            <OrbSwatch counts={counts} size={42} />
          ) : (
            <span aria-hidden="true" className="size-[42px] shrink-0 rounded-full" style={{ background: 'radial-gradient(circle at 32% 28%, #a7f3d0, #2dd4bf 40%, #0f766e 80%)', boxShadow: '0 0 24px #2dd4bf55' }} />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">Today&apos;s page</span>
            <span className="block truncate text-xs text-muted-foreground">{pageLine || ' '}</span>
          </span>
          <ChevronRight size={16} aria-hidden="true" className="text-subtle" />
        </button>

        <h2 className={label}>Up next</h2>
        {reminders === null || goals === null ? (
          <div className="grid gap-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : !upNext.length && !topGoal ? (
          <p className={`${card} text-sm text-muted-foreground`}>Nothing coming up. Tap the orb and tell Echo what to remind you about.</p>
        ) : (
          <div className="grid gap-2">
            {upNext.map((r) => (
              <ReminderUpNext key={r.id} uid={uid} reminder={r} now={now} onOpen={() => onNavigate('Reminders')} />
            ))}
            {topGoal && (
              <button type="button" onClick={() => onNavigate('Goals')} className={`${card} flex min-h-14 w-full items-center gap-3 text-left ${FOCUS_RING}`}>
                <span className="relative grid place-items-center">
                  <ProgressRing value={topGoal.progress} size={40} label={`${topGoal.progress}% complete`} />
                  <span aria-hidden="true" className="absolute text-[10px] font-bold text-foreground">
                    {topGoal.progress}%
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{topGoal.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{topGoal.nextMilestone ? `Next: ${topGoal.nextMilestone}` : 'Your most active goal'}</span>
                </span>
              </button>
            )}
          </div>
        )}

        {notice && <NoticedCard key={notice.action?.direct === 'water' ? `water-${dayKey}-${notice.text}` : `reminder-${nextReminder?.id}`} uid={uid} user={user} profile={profile} dayKey={dayKey} notice={notice} />}
      </div>
    </div>
  )
}

function ReminderUpNext({ uid, reminder, now, onOpen }: { uid: string; reminder: ReminderRow; now: number; onOpen: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const when = dueLabel(reminder.dueMs, now)
  const late = when === 'Overdue'
  return (
    <div className={`${card} flex min-h-14 items-center gap-3`}>
      <button
        type="button"
        aria-label={`Mark "${reminder.title}" done`}
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(false)
          try {
            await setReminderDone(uid, reminder.id, true)
          } catch {
            setError(true)
            setBusy(false)
          }
        }}
        className={`touch-hit grid size-6 shrink-0 place-items-center rounded-md border-[1.6px] border-border-strong text-primary ${FOCUS_RING}`}
      >
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" className="opacity-0" />}
      </button>
      <button type="button" onClick={onOpen} className={`min-w-0 flex-1 rounded-md text-left ${FOCUS_RING}`}>
        <span className="block truncate text-sm font-semibold text-foreground">{reminder.title}</span>
        <span className="block text-xs" style={{ color: late ? 'color-mix(in srgb, var(--color-danger) 80%, white)' : ORB_COLOR.reminder }}>
          {error ? "Couldn't mark it done. Try again." : when}
        </span>
      </button>
    </div>
  )
}

function NoticedCard({ uid, user, profile, dayKey, notice }: { uid: string; user: User; profile: UserProfile; dayKey: string; notice: NonNullable<ReturnType<typeof noticed>> }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'hidden'>('idle')
  const [error, setError] = useState('')
  if (state === 'hidden') return null
  const act = async () => {
    const a = notice.action
    if (!a) return
    setState('busy')
    setError('')
    try {
      if (a.direct === 'water') await addWaterGlass(uid, dayKey)
      else await quickSend({ user, profile, text: a.send })
      setState('done')
    } catch (e) {
      setError(quickSendError(e))
      setState('idle')
    }
  }
  return (
    <>
      <h2 className={label}>Echo noticed</h2>
      <div className={card} style={glow(ORB_COLOR.interest)}>
        <p className="text-sm leading-relaxed text-foreground">{state === 'done' ? 'Saved. Nice one.' : notice.text}</p>
        {error && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        )}
        {state !== 'done' && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {notice.action && (
              <button type="button" onClick={() => void act()} disabled={state === 'busy'} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60 ${FOCUS_RING}`}>
                {state === 'busy' && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                {notice.action.label}
              </button>
            )}
            <button type="button" onClick={() => setState('hidden')} className={`inline-flex min-h-11 items-center rounded-full border border-primary/40 px-4 text-sm font-semibold text-primary ${FOCUS_RING}`}>
              Not now
            </button>
          </div>
        )}
      </div>
    </>
  )
}
