'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { onSnapshot, orderBy, query } from 'firebase/firestore'
import { Plus, Target, Trash2, X } from 'lucide-react'
import { addGoal, deleteGoal, goalsCol, updateGoal, type Goal } from '@/lib/firestore'
import { areaShares, debounce, type Debounced } from '@/lib/echo/view-helpers'
import { Alert, Badge, Button, Card, EmptyState, IconButton, Input, PageHeader, Select, Skeleton } from './ui'
import { useIsMobile } from './use-mobile'

type GoalRow = Goal & { id: string }

const AREAS = ['Personal', 'Career', 'Health', 'Learning', 'Family', 'Friends', 'Creativity', 'Money', 'Rest']
const AREA_COLORS = ['bg-primary', 'bg-success', 'bg-warning', 'bg-info', 'bg-node-person', 'bg-node-interest']

function dayOfYear(now: Date): number {
  return Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
}

function GoalCard({ uid, goal, onError }: { uid: string; goal: GoalRow; onError: (m: string) => void }) {
  const [progress, setProgress] = useState(Math.round(goal.progress))
  const [text, setText] = useState('')
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
    if (!window.confirm(`Delete the goal "${goal.title}"?`)) return
    saver.current?.cancel()
    try {
      await deleteGoal(uid, goal.id)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not delete this goal.')
    }
  }

  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between">
        <Badge>{goal.category}</Badge>
        <IconButton icon={Trash2} label="Delete goal" size="sm" onClick={remove} />
      </div>
      <h2 className="mt-4 text-base font-semibold text-foreground">{goal.title}</h2>
      {goal.targetDate && <p className="mt-1 text-xs text-muted-foreground">Target {goal.targetDate}</p>}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progress</span>
          <span className="font-medium text-foreground">{progress}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
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
                onChange={() => saveMilestones(goal.milestones.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
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
  const [goals, setGoals] = useState<GoalRow[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [area, setArea] = useState('Personal')
  const [target, setTarget] = useState('')
  const [adding, setAdding] = useState(false)

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

  const shares = useMemo(() => areaShares(goals ?? []), [goals])
  const now = new Date()
  const doy = dayOfYear(now)
  const yearDays = dayOfYear(new Date(now.getFullYear(), 11, 31))

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

      <Card className="mb-5">
        <h2 className="text-base font-semibold text-foreground">Your year in view</h2>
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
        <div className="mt-4 h-1 rounded-full bg-surface-2" aria-hidden="true">
          <div className="h-full rounded-full bg-info" style={{ width: `${Math.min(100, (doy / yearDays) * 100)}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>Jan 01</span>
          <span>Today · day {doy}</span>
          <span>Dec 31</span>
        </div>
      </Card>

      {goals === null ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : goals.length === 0 ? (
        <EmptyState icon={Target} title="No goals yet" description="Add one above, or tell Echo a goal." />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => (
            <GoalCard key={g.id} uid={uid} goal={g} onError={setError} />
          ))}
        </div>
      )}
    </div>
  )
}
