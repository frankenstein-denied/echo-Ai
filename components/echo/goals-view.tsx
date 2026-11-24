'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { onSnapshot, orderBy, query } from 'firebase/firestore'
import { ArrowLeft, BookOpen, Briefcase, HeartPulse, Moon, Palette, PiggyBank, Plus, Target, Trash2, Users, X, type LucideIcon } from 'lucide-react'
import { addGoal, deleteGoal, goalsCol, updateGoal, type Goal } from '@/lib/firestore'
import { debounce, type Debounced } from '@/lib/echo/view-helpers'
import { goalFraction, goalMeta, nextStepLine, paceLine, progressStep, yearFraction } from '@/lib/echo/goal-pace'
import { Alert, Button, Card, ConfirmDialog, EmptyState, IconButton, Input, PageHeader, Select, Skeleton } from './ui'
import { useDay } from './use-day'
import { useIsMobile } from './use-mobile'
import { glowCardStyle, goalSubtitle } from '@/lib/echo/glow'
import { KindTag, ProgressRing } from './glow'
import { ORB_COLOR } from '@/lib/echo/orbs'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { milestonePath, milestonesDoneThisWeek, overallProgress, toggleMilestone } from '@/lib/echo/goals-helpers'
import { newlyDone, playCue } from '@/lib/echo/cues'

type GoalRow = Goal & { id: string }

const AREAS = ['Personal', 'Career', 'Health', 'Learning', 'Family', 'Friends', 'Creativity', 'Money', 'Rest']

const AMBER_GLOW = `drop-shadow(0 0 3px color-mix(in srgb, ${ORB_COLOR.goal} 60%, transparent))`

function OverallRing({ pct }: { pct: number }) {
  const size = 72
  const r = 32
  const circ = 2 * Math.PI * r
  return (
    <svg role="img" aria-label={`Goals ${pct}% done`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border)" strokeWidth={6} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={ORB_COLOR.goal}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={pct > 0 ? { filter: AMBER_GLOW } : undefined}
      />
    </svg>
  )
}

function MilestonePath({ milestones, onToggle }: { milestones: Goal['milestones']; onToggle: (i: number) => void }) {
  const { steps, more } = milestonePath(milestones)
  const next = steps.find((s) => s.state === 'next') ?? (milestones.findIndex((m) => !m.done) >= 0 ? { text: milestones[milestones.findIndex((m) => !m.done)].text } : null)
  return (
    <div className="mt-4">
      <div className="flex items-center">
        {steps.map((s, i) => {
          const done = s.state === 'done'
          return (
            <div key={s.index} className={`flex items-center ${i < steps.length - 1 || more > 0 ? 'min-w-0 flex-1' : ''}`}>
              <button
                type="button"
                aria-label={`Milestone: ${s.text}`}
                aria-pressed={done}
                onClick={() => onToggle(s.index)}
                className={`flex size-6 shrink-0 items-center justify-center rounded-full ${FOCUS_RING}`}
              >
                {s.state === 'next' ? (
                  <span aria-hidden="true" className="echo-pulse block size-4 rounded-full border-2" style={{ borderColor: ORB_COLOR.goal }} />
                ) : done ? (
                  <span aria-hidden="true" className="block size-3.5 rounded-full" style={{ background: ORB_COLOR.goal, filter: AMBER_GLOW }} />
                ) : (
                  <span aria-hidden="true" className="block size-3.5 rounded-full border border-dashed border-border-strong" />
                )}
              </button>
              {(i < steps.length - 1 || more > 0) && <span aria-hidden="true" className={`h-0.5 min-w-1 flex-1 ${done ? '' : 'bg-border'}`} style={done ? { background: ORB_COLOR.goal } : undefined} />}
            </div>
          )
        })}
        {more > 0 && <span className="shrink-0 pl-1 text-xs text-muted-foreground">+{more}</span>}
      </div>
      <p className="mt-1.5 text-xs" style={next ? { color: `color-mix(in srgb, ${ORB_COLOR.goal} 70%, white)` } : undefined}>
        {next ? `Next: ${next.text}` : <span className="text-muted-foreground">All milestones done 🎉</span>}
      </p>
    </div>
  )
}

function GoalCard({ uid, goal, onError }: { uid: string; goal: GoalRow; onError: (m: string) => void }) {
  const [progress, setProgress] = useState(Math.round(goal.progress))
  const [text, setText] = useState('')
  const [confirming, setConfirming] = useState(false)
  // Touch layouts: the whole row (label) toggles the milestone; desktop: only the checkbox does.
  const HitRow = useIsMobile() ? 'label' : 'div'
  const saver = useRef<Debounced<[number]> | null>(null)

  useEffect(() => {
    const s = debounce((p: number) => {
      updateGoal(uid, goal.id, { progress: p }).catch((e) => onError(e instanceof Error ? e.message : 'Could not save progress.'))
    }, 500)
    saver.current = s
    return () => s.flush()
  }, [uid, goal.id, onError])

  const saveMilestones = (milestones: Goal['milestones']) =>
    updateGoal(uid, goal.id, { milestones }).catch((e) => onError(e instanceof Error ? e.message : 'Could not save milestones.'))

  // Only a tick chimes: removing a milestone shifts the others, so it must never look like one got done.
  const toggle = (i: number) => {
    const next = toggleMilestone(goal.milestones, i, Date.now())
    if (newlyDone(goal.milestones, next)) playCue('goal')
    void saveMilestones(next)
  }

  const addMilestone = () => {
    const t = text.trim()
    if (!t) return
    setText('')
    saveMilestones([...goal.milestones, { text: t.slice(0, 200), done: false }])
  }

  const remove = async () => {
    setConfirming(false)
    saver.current?.cancel()
    try {
      await deleteGoal(uid, goal.id)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not delete this goal.')
    }
  }

  return (
    <Card className="flex flex-col" style={glowCardStyle('goal')}>
      <div className="flex items-center justify-between">
        <KindTag kind="goal">{goal.category}</KindTag>
        <IconButton icon={Trash2} label="Delete goal" size="sm" onClick={() => setConfirming(true)} />
      </div>
      {confirming && <ConfirmDialog title={`Delete “${goal.title}”?`} body="This can't be undone." confirmLabel="Delete" onCancel={() => setConfirming(false)} onConfirm={() => void remove()} />}
      <div className="mt-4 flex items-center gap-3">
        <ProgressRing value={progress} label={`${progress}% complete`} />
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-base font-semibold text-foreground">{goal.title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{goalSubtitle(progress, goal.targetDate)}</p>
        </div>
      </div>
      <div className="mt-3">
        <input
          type="range"
          min={0}
          max={100}
          value={progress}
          aria-label="Progress"
          onChange={(e) => {
            const p = Number(e.target.value)
            setProgress(p)
            saver.current?.(p)
          }}
          className="mt-3 w-full accent-primary max-lg:mt-1 max-lg:h-11"
        />
      </div>
      {goal.milestones.length > 0 && <MilestonePath milestones={goal.milestones} onToggle={toggle} />}
      <ul className="mt-4 flex flex-col gap-2 text-sm">
        {goal.milestones.map((m, i) => (
          <li key={i} className="flex items-center gap-2">
            {/* The label makes the whole row the checkbox's tap target on touch screens. */}
            <HitRow className="flex min-w-0 flex-1 items-center gap-2 max-lg:min-h-11 max-lg:gap-3">
              <input
                type="checkbox"
                aria-label={`Milestone: ${m.text}`}
                className="size-4 shrink-0 accent-primary max-lg:size-5"
                checked={m.done}
                onChange={() => toggle(i)}
              />
              <span className={`min-w-0 flex-1 break-words ${m.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{m.text}</span>
            </HitRow>
            <IconButton icon={X} label="Remove milestone" size="sm" onClick={() => saveMilestones(goal.milestones.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Input
          aria-label="New milestone"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addMilestone()}
          placeholder="Add a milestone"
          className="h-8 text-xs"
        />
        <IconButton icon={Plus} label="Add milestone" variant="secondary" size="sm" onClick={addMilestone} />
      </div>
    </Card>
  )
}

const AREA_LOOK: Record<string, { icon: LucideIcon; color: string }> = {
  Health: { icon: HeartPulse, color: ORB_COLOR.health },
  Learning: { icon: BookOpen, color: ORB_COLOR.note },
  Money: { icon: PiggyBank, color: ORB_COLOR.person },
  Career: { icon: Briefcase, color: ORB_COLOR.goal },
  Family: { icon: Users, color: ORB_COLOR.person },
  Friends: { icon: Users, color: ORB_COLOR.person },
  Creativity: { icon: Palette, color: ORB_COLOR.interest },
  Rest: { icon: Moon, color: ORB_COLOR.interest },
}
const DEFAULT_LOOK = { icon: Target, color: ORB_COLOR.goal }
const lookOf = (area: string) => AREA_LOOK[area] ?? DEFAULT_LOOK

/** One slim goal: icon, title, next step, bar, and the one-tap progress button. Tapping the rest opens the detail. */
function GoalSlim({ goal, onOpen, onStep }: { goal: GoalRow; onOpen: () => void; onStep: (next: number) => void }) {
  const { icon: Icon, color } = lookOf(goal.category)
  const pct = Math.round(Math.min(100, Math.max(0, goal.progress)))
  const done = pct >= 100
  const step = progressStep(goal)
  return (
    <li className="relative rounded-2xl border border-border bg-surface px-3 pb-3 pt-2.5 transition-[filter] hover:brightness-125">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
          <Icon size={17} />
        </span>
        {/* The whole card opens the detail (stretched ::after); the progress button sits above it. */}
        <button type="button" onClick={onOpen} className={`min-w-0 flex-1 text-left after:absolute after:inset-0 after:rounded-2xl ${FOCUS_RING}`}>
          <span className="block truncate text-[15px] font-semibold text-foreground lg:text-sm">{goal.title}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{goalMeta(goal)}</span>
        </button>
        {done ? (
          <span className="relative shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ color }}>
            Done
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onStep(step.next)}
            aria-label={`${step.label} for ${goal.title}`}
            className={`relative inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-primary/40 bg-primary-soft px-3.5 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground lg:min-h-8 ${FOCUS_RING}`}
          >
            {step.label}
          </button>
        )}
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-label={`${goal.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color, boxShadow: pct > 0 ? `0 0 8px color-mix(in srgb, ${color} 50%, transparent)` : undefined }} />
      </div>
    </li>
  )
}

export function GoalsView({ uid, focusGoalId = null, onFocusHandled }: { uid: string; focusGoalId?: string | null; onFocusHandled?: () => void }) {
  const day = useDay()
  const [goals, setGoals] = useState<GoalRow[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [area, setArea] = useState('Personal')
  const [target, setTarget] = useState('')
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const q = query(goalsCol(uid), orderBy('createdAt', 'desc'))
    return onSnapshot(
      q,
      (snap) => {
        setGoals(snap.docs.map((s) => ({ ...s.data({ serverTimestamps: 'estimate' }), id: s.id })))
        setLoadError('')
      },
      (e) => {
        setGoals([])
        setLoadError(e.message || 'Could not load your goals.')
      },
    )
  }, [uid])

  // Deep link (?goal=<id>): open that goal's detail.
  useEffect(() => {
    if (!focusGoalId || goals === null) return
    if (goals.some((g) => g.id === focusGoalId)) setOpenId(focusGoalId)
    onFocusHandled?.()
  }, [focusGoalId, goals, onFocusHandled])

  useEffect(() => {
    if (formOpen) titleRef.current?.focus()
  }, [formOpen])

  const list = useMemo(() => goals ?? [], [goals])
  const opened = openId ? list.find((g) => g.id === openId) ?? null : null

  // If the open goal disappears (deleted), return to the list.
  useEffect(() => {
    if (openId && goals !== null && !opened) setOpenId(null)
  }, [openId, goals, opened])

  // `day` refreshes the pace words when the date rolls over.
  const { goalsPct, weekDone, behind, active, nowMs } = useMemo(() => {
    const t = Date.now()
    return {
      nowMs: t,
      goalsPct: overallProgress(list),
      weekDone: milestonesDoneThisWeek(list, new Date(t)),
      active: list.filter((g) => g.progress < 100).length,
      behind: list.filter((g) => g.progress < 100 && paceLine(g.progress, goalFraction({ createdMs: g.createdAt?.toMillis?.() ?? null, targetDate: g.targetDate }, t)) === 'A bit behind the year').length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, day])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    setAdding(true)
    setError('')
    try {
      await addGoal(uid, { title: t.slice(0, 500), category: area, ...(target ? { targetDate: target } : {}) })
      setTitle('')
      setTarget('')
      setFormOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the goal.')
    } finally {
      setAdding(false)
    }
  }

  const step = (g: GoalRow, next: number) => {
    if (next >= 100 && g.progress < 100) playCue('goal')
    updateGoal(uid, g.id, { progress: next }).catch((e) => setError(e instanceof Error ? e.message : 'Could not save progress.'))
  }

  if (opened) {
    return (
      <div className="animate-in">
        <div className="mb-3">
          <Button variant="ghost" icon={ArrowLeft} onClick={() => setOpenId(null)} className="-ml-2 max-lg:h-11">
            All goals
          </Button>
        </div>
        {error && (
          <div className="mb-4">
            <Alert variant="danger">{error}</Alert>
          </div>
        )}
        <div className="max-w-xl">
          <GoalCard key={opened.id} uid={uid} goal={opened} onError={setError} />
        </div>
      </div>
    )
  }

  const oneLiner =
    goals === null ? undefined
    : list.length === 0 ? 'No goals yet'
    : active === 0 ? `${list.length} done`
    : `${active} active${behind ? ` · ${behind} ${behind === 1 ? 'needs' : 'need'} you` : ''}`

  return (
    <div className="animate-in">
      <PageHeader
        title="Goals"
        description={oneLiner}
        action={
          <div className="flex justify-end">
            <IconButton icon={formOpen ? X : Plus} label={formOpen ? 'Close the new goal form' : 'New goal by hand'} variant="secondary" aria-expanded={formOpen} onClick={() => setFormOpen((o) => !o)} />
          </div>
        }
      />

      {formOpen && (
        <Card className="mb-4">
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
            <Input ref={titleRef} label="New goal" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What do you want to achieve?" maxLength={500} />
            <Select label="Area" value={area} onChange={(e) => setArea(e.target.value)}>
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
            <Input label="Target date" type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
            <Button type="submit" icon={Plus} loading={adding} disabled={!title.trim()} className="max-md:w-full">
              Add goal
            </Button>
          </form>
        </Card>
      )}

      {(error || loadError) && (
        <div className="mb-4">
          <Alert variant="danger">{error || loadError}</Alert>
        </div>
      )}

      {goals === null ? (
        <div className="grid gap-3">
          <Skeleton className="h-24" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : goals.length === 0 ? (
        <EmptyState icon={Target} title="No goals yet" description="Tell Echo a goal in the diary (“I want to read 12 books this year”), or tap + to add one yourself." />
      ) : (
        <div className="grid gap-3">
          <Card style={glowCardStyle('goal')} className="rounded-2xl">
            <div className="flex items-center gap-4">
              <div className="relative grid shrink-0 place-items-center">
                <OverallRing pct={goalsPct} />
                <span aria-hidden="true" className="absolute text-sm font-bold tabular-nums text-foreground">{goalsPct}%</span>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-foreground">{paceLine(goalsPct, yearFraction(nowMs))}</h2>
                <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{nextStepLine(list)}</p>
                {weekDone > 0 && (
                  <p className="mt-1 text-xs text-foreground">
                    {weekDone} milestone{weekDone === 1 ? '' : 's'} finished this week ✨
                  </p>
                )}
              </div>
            </div>
          </Card>
          <ul className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {list.map((g) => (
              <GoalSlim key={g.id} goal={g} onOpen={() => setOpenId(g.id)} onStep={(next) => step(g, next)} />
            ))}
          </ul>
          <p className="text-center text-xs text-muted-foreground">Tap a goal for milestones</p>
        </div>
      )}
    </div>
  )
}
