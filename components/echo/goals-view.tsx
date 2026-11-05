'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { onSnapshot, orderBy, query } from 'firebase/firestore'
import { Plus, Target, Trash2, X } from 'lucide-react'
import { addGoal, deleteGoal, goalsCol, updateGoal, type Goal } from '@/lib/firestore'
import { areaShares, debounce, goalsInPeriod, type Debounced } from '@/lib/echo/view-helpers'
import { DEFAULT_PERIOD, emptyPeriodText, PERIOD_OPTIONS, type Period } from '@/lib/echo/period'
import { Alert, Button, Card, ConfirmDialog, EmptyState, IconButton, Input, PageHeader, Segmented, Select, Skeleton } from './ui'
import { useDay } from './use-day'
import { useIsMobile } from './use-mobile'
import { glowCardStyle, goalSubtitle } from '@/lib/echo/glow'
import { KindTag, ProgressRing } from './glow'
import { ORB_COLOR } from '@/lib/echo/orbs'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { milestonePath, milestonesDoneThisWeek, overallProgress, toggleMilestone, yearProgress } from '@/lib/echo/goals-helpers'

type GoalRow = Goal & { id: string }

const AREAS = ['Personal', 'Career', 'Health', 'Learning', 'Family', 'Friends', 'Creativity', 'Money', 'Rest']
const AREA_COLORS = ['bg-primary', 'bg-success', 'bg-warning', 'bg-info', 'bg-node-person', 'bg-node-interest']

const AMBER_GLOW = `drop-shadow(0 0 3px color-mix(in srgb, ${ORB_COLOR.goal} 60%, transparent))`

function OverallRing({ goalsPct, yearPct }: { goalsPct: number; yearPct: number }) {
  const size = 72
  const ring = (r: number, pct: number, color: string, glow: boolean) => {
    const circ = 2 * Math.PI * r
    return (
      <>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border)" strokeWidth={6} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={glow && pct > 0 ? { filter: AMBER_GLOW } : undefined}
        />
      </>
    )
  }
  return (
    <svg role="img" aria-label={`Goals ${goalsPct}% done, ${yearPct}% of the year gone`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      {ring(32, goalsPct, ORB_COLOR.goal, true)}
      {ring(22, yearPct, 'var(--color-primary)', false)}
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
      {goal.milestones.length > 0 && <MilestonePath milestones={goal.milestones} onToggle={(i) => saveMilestones(toggleMilestone(goal.milestones, i, Date.now()))} />}
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
                onChange={() => saveMilestones(toggleMilestone(goal.milestones, i, Date.now()))}
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

export function GoalsView({ uid }: { uid: string }) {
  const day = useDay()
  const [goals, setGoals] = useState<GoalRow[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [area, setArea] = useState('Personal')
  const [target, setTarget] = useState('')
  const [adding, setAdding] = useState(false)
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD)

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

  const shown = useMemo(
    () => goalsInPeriod((goals ?? []).map((g) => ({ ...g, createdMs: g.createdAt?.toMillis?.() ?? null, updatedMs: g.updatedAt?.toMillis?.() ?? null })), period, new Date()),
    [goals, period, day],
  )
  const shares = useMemo(() => areaShares(goals ?? []), [goals])
  const now = new Date()
  const goalsPct = overallProgress(goals ?? [])
  const yearPct = yearProgress(now)
  const weekDone = milestonesDoneThisWeek(goals ?? [], now)

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the goal.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="animate-in">
      <PageHeader title="Goals" description="Set goals, track progress and break them into milestones." />

      <Card className="mb-5">
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
          <Input label="New goal" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What do you want to achieve?" maxLength={500} />
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

      {(error || loadError) && (
        <div className="mb-4">
          <Alert variant="danger">{error || loadError}</Alert>
        </div>
      )}

      <div className="mb-5 max-w-full overflow-x-auto">
        <Segmented ariaLabel="Time period" value={period} onChange={(v) => setPeriod(v as Period)} options={PERIOD_OPTIONS} />
      </div>

      <Card className="mb-5" style={glowCardStyle('goal')}>
        <div className="flex items-center gap-4">
          <OverallRing goalsPct={goalsPct} yearPct={yearPct} />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">
              {goalsPct}% done · {yearPct}% of the year gone
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Outer ring: your goals. Inner ring: the year.</p>
            {weekDone > 0 && (
              <p className="mt-1 text-xs text-foreground">
                {weekDone} milestone{weekDone === 1 ? '' : 's'} finished this week ✨
              </p>
            )}
          </div>
        </div>
        {shares.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Add goals and their areas will appear here.</p>
        ) : (
          <>
            <div className="mt-4 flex h-3 gap-1">
              {shares.map((s, i) => (
                <div key={s.category} title={`${s.category}: ${s.count}`} className={`h-3 rounded-full ${AREA_COLORS[i % AREA_COLORS.length]}`} style={{ width: `${s.pct}%` }} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {shares.map((s, i) => (
                <span key={s.category} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={`size-2 rounded-full ${AREA_COLORS[i % AREA_COLORS.length]}`} />
                  {s.category} ({s.count})
                </span>
              ))}
            </div>
          </>
        )}
      </Card>

      {goals === null ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : goals.length === 0 ? (
        <EmptyState icon={Target} title="No goals yet" description="Add one above, or tell Echo a goal." />
      ) : shown.length === 0 ? (
        <EmptyState icon={Target} title="No goals here" description={period === 'all' ? emptyPeriodText(period) : `${emptyPeriodText(period)} Pick another period.`} action={<Button variant="secondary" onClick={() => setPeriod('all')}>Show all</Button>} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((g) => (
            <GoalCard key={g.id} uid={uid} goal={g} onError={setError} />
          ))}
        </div>
      )}
    </div>
  )
}
