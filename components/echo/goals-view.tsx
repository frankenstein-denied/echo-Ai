'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { onSnapshot, orderBy, query } from 'firebase/firestore'
import { ArrowLeft, BookOpen, Briefcase, Check, HeartPulse, ListChecks, Moon, Palette, PiggyBank, Plus, Target, Trash2, Users, X, type LucideIcon } from 'lucide-react'
import { addGoal, deleteGoal, goalsCol, updateGoal, type Goal } from '@/lib/firestore'
import { goalFraction, goalMeta, nextStepLine, paceLine, yearFraction } from '@/lib/echo/goal-pace'
import { goalProgress, goalWrite, hasSubgoals, isGoalDone, MIN_SUBGOALS } from '@/lib/echo/goal-progress'
import { Alert, Button, Card, ConfirmDialog, EmptyState, IconButton, Input, PageHeader, Select, Skeleton } from './ui'
import { useDay } from './use-day'
import { useIsMobile } from './use-mobile'
import { glowCardStyle } from '@/lib/echo/glow'
import { KindTag, ProgressRing } from './glow'
import { ORB_COLOR } from '@/lib/echo/orbs'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { milestonePath, milestonesDoneThisWeek, overallProgress, toggleMilestone } from '@/lib/echo/goals-helpers'
import { newlyDone, playCue } from '@/lib/echo/cues'

type GoalRow = Goal & { id: string }

const AREAS = ['Personal', 'Career', 'Health', 'Learning', 'Family', 'Friends', 'Creativity', 'Money', 'Rest']

const AMBER_GLOW = `drop-shadow(0 0 3px color-mix(in srgb, ${ORB_COLOR.goal} 60%, transparent))`

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
                aria-label={`Sub-goal: ${s.text}`}
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
        {next ? `Next: ${next.text}` : <span className="text-muted-foreground">All sub-goals done 🎉</span>}
      </p>
    </div>
  )
}

/** The round done checkbox for a goal without sub-goals (44 px tap target on touch layouts). */
function DoneCheck({ done, title, color, onToggle, className = '' }: { done: boolean; title: string; color: string; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`${title} done`}
      onClick={onToggle}
      className={`relative grid size-11 shrink-0 place-items-center rounded-full lg:size-9 ${FOCUS_RING} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`grid size-7 place-items-center rounded-full border-2 transition-colors ${done ? '' : 'border-border-strong'}`}
        style={done ? { background: color, borderColor: color, color: 'var(--color-background)', boxShadow: `0 0 8px color-mix(in srgb, ${color} 50%, transparent)` } : undefined}
      >
        {done && <Check size={16} strokeWidth={3} />}
      </span>
    </button>
  )
}

function GoalCard({ uid, goal, onError }: { uid: string; goal: GoalRow; onError: (m: string) => void }) {
  const [drafts, setDrafts] = useState<string[]>(['', ''])
  const [adding, setAdding] = useState(false)
  const [confirming, setConfirming] = useState<'goal' | 'subgoals' | null>(null)
  // Touch layouts: the whole row (label) toggles the sub-goal; desktop: only the checkbox does.
  const HitRow = useIsMobile() ? 'label' : 'div'
  const pct = goalProgress(goal)
  const withSubgoals = hasSubgoals(goal)
  const count = goal.milestones.length
  // The first time asks for two sub-goals (the minimum); after that, one at a time.
  const needed = Math.max(1, MIN_SUBGOALS - count)
  const color = lookOf(goal.category).color

  // Every write stores the derived progress next to the change.
  const save = (change: { milestones?: Goal['milestones']; progress?: number }, what: string) => {
    const fields = goalWrite(goal, change)
    if (fields.progress >= 100 && pct < 100) playCue('goal')
    return updateGoal(uid, goal.id, fields).catch((e) => onError(e instanceof Error ? e.message : `Could not save ${what}.`))
  }

  // Only a tick chimes: removing a sub-goal shifts the others, so it must never look like one got done.
  const toggle = (i: number) => {
    const next = toggleMilestone(goal.milestones, i, Date.now())
    if (newlyDone(goal.milestones, next) && goalWrite(goal, { milestones: next }).progress < 100) playCue('goal')
    void save({ milestones: next }, 'sub-goals')
  }

  const removeSubgoal = (i: number) => {
    // Two is the minimum: removing one of the last two means removing them all (confirmed first).
    if (count === MIN_SUBGOALS) setConfirming('subgoals')
    else void save({ milestones: goal.milestones.filter((_, j) => j !== i) }, 'sub-goals')
  }

  const texts = drafts.slice(0, needed).map((t) => t.trim())
  const canAdd = texts.every(Boolean)
  const addSubgoals = () => {
    if (!canAdd) return
    setDrafts(['', ''])
    setAdding(false)
    void save({ milestones: [...goal.milestones, ...texts.map((t) => ({ text: t.slice(0, 200), done: false }))].slice(0, 100) }, 'sub-goals')
  }

  const remove = async () => {
    setConfirming(null)
    try {
      await deleteGoal(uid, goal.id)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not delete this goal.')
    }
  }

  const showForm = count > 0 || adding
  return (
    <Card className="flex flex-col" style={glowCardStyle('goal')}>
      <div className="flex items-center justify-between">
        <KindTag kind="goal">{goal.category}</KindTag>
        <IconButton icon={Trash2} label="Delete goal" size="sm" onClick={() => setConfirming('goal')} />
      </div>
      {confirming === 'goal' && <ConfirmDialog title={`Delete “${goal.title}”?`} body="This can't be undone." confirmLabel="Delete" onCancel={() => setConfirming(null)} onConfirm={() => void remove()} />}
      {confirming === 'subgoals' && (
        <ConfirmDialog
          title="Remove all sub-goals?"
          body={`A goal needs at least ${MIN_SUBGOALS} sub-goals to track progress. Without them, you just mark the goal done or not done.`}
          confirmLabel="Remove all sub-goals"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null)
            void save({ milestones: [] }, 'sub-goals')
          }}
        />
      )}
      <div className="mt-4 flex items-center gap-3">
        {withSubgoals ? (
          <ProgressRing value={pct} label={`${pct}% complete`} />
        ) : (
          <DoneCheck done={pct >= 100} title={goal.title} color={color} onToggle={() => void save({ progress: pct >= 100 ? 0 : 100 }, 'the goal')} />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-base font-semibold text-foreground">{goal.title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{goalMeta(goal)}</p>
        </div>
      </div>
      {withSubgoals && <MilestonePath milestones={goal.milestones} onToggle={toggle} />}
      {count > 0 && (
        <>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sub-goals</h3>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {goal.milestones.map((m, i) => (
              <li key={i} className="flex items-center gap-2">
                {/* The label makes the whole row the checkbox's tap target on touch screens. */}
                <HitRow className="flex min-w-0 flex-1 items-center gap-2 max-lg:min-h-11 max-lg:gap-3">
                  <input type="checkbox" aria-label={`Sub-goal: ${m.text}`} className="size-4 shrink-0 accent-primary max-lg:size-5" checked={m.done} onChange={() => toggle(i)} />
                  <span className={`min-w-0 flex-1 break-words ${m.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{m.text}</span>
                </HitRow>
                <IconButton icon={X} label={`Remove sub-goal ${m.text}`} size="sm" onClick={() => removeSubgoal(i)} />
              </li>
            ))}
          </ul>
        </>
      )}
      {count > 0 && count < MIN_SUBGOALS && <p className="mt-3 text-xs text-muted-foreground">Add one more sub-goal to track progress.</p>}
      {!showForm ? (
        <div className="mt-4">
          <Button variant="secondary" icon={ListChecks} onClick={() => setAdding(true)} className="max-lg:h-11 max-md:w-full">
            Add sub-goals
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">Split it into at least {MIN_SUBGOALS} steps and the progress tracks itself.</p>
        </div>
      ) : (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            addSubgoals()
          }}
        >
          {needed > 1 ? (
            <>
              {Array.from({ length: needed }, (_, i) => (
                <Input
                  key={i}
                  aria-label={`Sub-goal ${i + 1}`}
                  value={drafts[i]}
                  onChange={(e) => setDrafts((d) => d.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={i === 0 ? 'First sub-goal' : 'Second sub-goal'}
                  maxLength={200}
                  autoFocus={i === 0}
                  className="max-lg:h-11"
                />
              ))}
              <div className="flex gap-2">
                <Button type="submit" icon={Plus} disabled={!canAdd} className="flex-1 max-lg:h-11">
                  Add sub-goals
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setAdding(false)
                    setDrafts(['', ''])
                  }}
                  className="max-lg:h-11"
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <Input aria-label="New sub-goal" value={drafts[0]} onChange={(e) => setDrafts((d) => [e.target.value, d[1]])} placeholder="Add a sub-goal" maxLength={200} className="h-8 text-xs max-lg:h-11" />
              <IconButton type="submit" icon={Plus} label="Add sub-goal" variant="secondary" size="sm" disabled={!canAdd} />
            </div>
          )}
        </form>
      )}
    </Card>
  )
}

/** One slim goal: icon, title, sub-goal count and bar, or a done checkbox without sub-goals. Tapping the rest opens the detail. */
function GoalSlim({ goal, onOpen, onToggleDone }: { goal: GoalRow; onOpen: () => void; onToggleDone: () => void }) {
  const { icon: Icon, color } = lookOf(goal.category)
  const pct = goalProgress(goal)
  const withSubgoals = hasSubgoals(goal)
  return (
    <li className="relative rounded-2xl border border-border bg-surface px-3 pb-3 pt-2.5 transition-[filter] hover:brightness-125">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
          <Icon size={17} />
        </span>
        {/* The whole card opens the detail (stretched ::after); the done checkbox sits above it. */}
        <button type="button" onClick={onOpen} className={`min-w-0 flex-1 text-left after:absolute after:inset-0 after:rounded-2xl ${FOCUS_RING}`}>
          <span className={`block truncate text-[15px] font-semibold lg:text-sm ${!withSubgoals && pct >= 100 ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{goal.title}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{goalMeta(goal)}</span>
        </button>
        {withSubgoals ? (
          <span className="relative shrink-0 text-xs font-semibold tabular-nums" style={{ color }}>
            {pct >= 100 ? 'Done' : `${pct}%`}
          </span>
        ) : (
          <DoneCheck done={pct >= 100} title={goal.title} color={color} onToggle={onToggleDone} className="-my-1 -mr-1" />
        )}
      </div>
      {withSubgoals && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-label={`${goal.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color, boxShadow: pct > 0 ? `0 0 8px color-mix(in srgb, ${color} 50%, transparent)` : undefined }} />
        </div>
      )}
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
      active: list.filter((g) => goalProgress(g) < 100).length,
      behind: list.filter((g) => goalProgress(g) < 100 && paceLine(goalProgress(g), goalFraction({ createdMs: g.createdAt?.toMillis?.() ?? null, targetDate: g.targetDate }, t)) === 'A bit behind the year').length,
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

  // Goals without sub-goals are simply done or not done.
  const toggleDone = (g: GoalRow) => {
    const fields = { progress: goalWrite(g, { progress: isGoalDone(g) ? 0 : 100 }).progress }
    if (fields.progress >= 100) playCue('goal')
    updateGoal(uid, g.id, fields).catch((e) => setError(e instanceof Error ? e.message : 'Could not save the goal.'))
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
                    {weekDone} sub-goal{weekDone === 1 ? '' : 's'} finished this week ✨
                  </p>
                )}
              </div>
            </div>
          </Card>
          <ul className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {list.map((g) => (
              <GoalSlim key={g.id} goal={g} onOpen={() => setOpenId(g.id)} onToggleDone={() => toggleDone(g)} />
            ))}
          </ul>
          <p className="text-center text-xs text-muted-foreground">Tap a goal for its sub-goals</p>
        </div>
      )}
    </div>
  )
}
