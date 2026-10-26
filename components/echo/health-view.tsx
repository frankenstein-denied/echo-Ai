'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { documentId, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { Droplet, Minus, Moon, Plus, Smile, Zap, type LucideIcon } from 'lucide-react'
import { healthLogsCol, mealsInRange, saveHealthChanges, watchCalorieSettings, type Energy, type HealthLog, type MealDoc } from '@/lib/firestore'
import { debounce, lastSevenDays, localDateKey, parseSleepInput, splitSleep, stepWater, type Debounced } from '@/lib/echo/view-helpers'
import { dailyTotals, moodScore, moodTagOf, type HealthWeekPoint, type MoodTag } from '@/lib/echo/health-helpers'
import { Alert, Card, IconButton, Input, PageHeader, Segmented, Skeleton } from './ui'
import { MoodPicker } from './health/mood-picker'
import { CaloriesCard } from './health/calories-card'
import { CaloriesWeekChart, MoodWeekChart } from './health/week-charts'

type Fields = Partial<Pick<HealthLog, 'mood' | 'moodTag' | 'sleepMinutes' | 'waterGlasses' | 'energy'>>

const ENERGIES: Energy[] = ['low', 'medium', 'high']
const SLEEP_STEP = 30

// Re-renders when the local day changes.
function useDay(): string {
  const [day, setDay] = useState(() => localDateKey(new Date()))
  useEffect(() => {
    const id = setInterval(() => setDay(localDateKey(new Date())), 60000)
    return () => clearInterval(id)
  }, [])
  return day
}

type Edits = { moodTag?: MoodTag; energy?: Energy; water?: number; sleep?: { h: string; m: string } }
type EditKey = 'mood' | 'energy' | 'water' | 'sleep'

function Tile({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon size={16} aria-hidden="true" className="text-muted-foreground" />
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  )
}

// Displayed values come from the live snapshot, overlaid by local edits that are still unsaved or in flight.
function TodayForm({ uid, day, live }: { uid: string; day: string; live: Fields }) {
  const [edits, setEdits] = useState<Edits>({})
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [error, setError] = useState('')
  const pending = useRef<Fields>({})
  const pendingWater = useRef(0)
  const versions = useRef<Record<string, number>>({})
  const chain = useRef<Promise<void>>(Promise.resolve())
  const saver = useRef<Debounced<[]> | null>(null)

  useEffect(() => {
    const s = debounce(() => {
      const fields = pending.current
      const water = pendingWater.current
      pending.current = {}
      pendingWater.current = 0
      if (!Object.keys(fields).length && !water) return
      const sent = { ...versions.current }
      // Serialise writes so the get-then-create can never race itself.
      chain.current = chain.current.then(async () => {
        try {
          await saveHealthChanges(uid, day, fields, water)
          setStatus('saved')
          setError('')
          // Drop local overrides that have not been touched since this batch was sent.
          setEdits((prev) => {
            const next = { ...prev }
            for (const k of Object.keys(sent) as EditKey[]) {
              if (versions.current[k] !== sent[k]) continue
              if (k === 'mood') delete next.moodTag
              else delete next[k]
            }
            return next
          })
        } catch (e) {
          setStatus('error')
          setError(e instanceof Error ? e.message : 'Could not save your health log.')
        }
      })
    }, 700)
    saver.current = s
    return () => s.flush()
  }, [uid, day])

  const touch = (k: EditKey) => {
    versions.current[k] = (versions.current[k] ?? 0) + 1
    setStatus('saving')
  }
  const queue = () => saver.current?.()

  const moodTag = edits.moodTag ?? moodTagOf(live)
  const energy = edits.energy ?? live.energy
  const water = edits.water ?? live.waterGlasses ?? 0
  const liveSleep = live.sleepMinutes != null ? splitSleep(live.sleepMinutes) : null
  const sleepH = edits.sleep ? edits.sleep.h : liveSleep ? String(liveSleep.hours) : ''
  const sleepM = edits.sleep ? edits.sleep.m : liveSleep ? String(liveSleep.minutes) : ''

  const logMood = (tag: MoodTag) => {
    if ((edits.moodTag ?? live.moodTag) === tag) return
    touch('mood')
    setEdits((p) => ({ ...p, moodTag: tag }))
    pending.current = { ...pending.current, mood: moodScore(tag), moodTag: tag }
    queue()
  }

  const changeSleep = (h: string, m: string) => {
    setEdits((p) => ({ ...p, sleep: { h, m } }))
    const minutes = parseSleepInput(h, m)
    if (minutes === null) return // empty or invalid: keep typing, do not save yet
    touch('sleep')
    pending.current = { ...pending.current, sleepMinutes: minutes }
    queue()
  }

  const stepSleep = (delta: number) => {
    const cur = parseSleepInput(sleepH, sleepM) ?? 0
    const next = Math.min(24 * 60, Math.max(0, cur + delta))
    const { hours, minutes } = splitSleep(next)
    changeSleep(String(hours), String(minutes))
  }

  const stepGlass = (delta: number) => {
    const next = stepWater(water, delta)
    if (next === water) return
    touch('water')
    setEdits((p) => ({ ...p, water: next }))
    pendingWater.current += next - water
    queue()
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Today</h2>
        <span className="text-xs text-muted-foreground" aria-live="polite">{status === 'saving' ? 'Saving...' : status === 'error' ? 'Not saved' : 'Saved'}</span>
      </div>
      {error && (
        <div className="mt-3">
          <Alert variant="danger">{error}</Alert>
        </div>
      )}
      <div className="mt-4 grid gap-4">
        <Tile icon={Smile} title={moodTag ? 'How are you feeling?' : 'How are you feeling? Not logged yet.'}>
          <MoodPicker value={moodTag} onChange={logMood} />
        </Tile>
        <div className="grid gap-4 md:grid-cols-2">
          <Tile icon={Moon} title="Sleep">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <IconButton icon={Minus} label="Less sleep" variant="secondary" onClick={() => stepSleep(-SLEEP_STEP)} />
              <Input type="number" inputMode="numeric" min={0} max={24} value={sleepH} placeholder="0" aria-label="Sleep hours" onChange={(e) => changeSleep(e.target.value, sleepM)} className="w-16 text-center" />
              h
              <Input type="number" inputMode="numeric" min={0} max={59} value={sleepM} placeholder="0" aria-label="Sleep minutes" onChange={(e) => changeSleep(sleepH, e.target.value)} className="w-16 text-center" />
              m
              <IconButton icon={Plus} label="More sleep" variant="secondary" onClick={() => stepSleep(SLEEP_STEP)} />
            </div>
          </Tile>
          <Tile icon={Droplet} title="Water">
            <div className="flex items-center gap-3">
              <IconButton icon={Minus} label="Fewer glasses" variant="secondary" onClick={() => stepGlass(-1)} />
              <span className="min-w-24 text-center text-foreground">
                <span className="text-2xl font-semibold tabular-nums">{water}</span>
                <span className="ml-1 text-sm text-muted-foreground">{water === 1 ? 'glass' : 'glasses'}</span>
              </span>
              <IconButton icon={Plus} label="More glasses" variant="secondary" onClick={() => stepGlass(1)} />
            </div>
          </Tile>
          <div className="md:col-span-2">
            <Tile icon={Zap} title="Energy">
              <Segmented
                ariaLabel="Energy"
                fullWidth
                value={energy ?? ''}
                onChange={(v) => {
                  const e = v as Energy
                  touch('energy')
                  setEdits((p) => ({ ...p, energy: e }))
                  pending.current = { ...pending.current, energy: e }
                  queue()
                }}
                options={ENERGIES.map((e) => ({ value: e, label: e.charAt(0).toUpperCase() + e.slice(1) }))}
              />
            </Tile>
          </div>
        </div>
      </div>
    </Card>
  )
}

export function HealthView({ uid }: { uid: string }) {
  const day = useDay()
  const [today, setToday] = useState<Fields | null | undefined>(undefined)
  const [week, setWeek] = useState<{ date: string; mood?: number; moodTag?: string }[] | null>(null)
  const [meals, setMeals] = useState<MealDoc[] | null>(null)
  const [cal, setCal] = useState<{ enabled: boolean; goal?: number } | null>(null)
  const [error, setError] = useState('')
  const [mealError, setMealError] = useState('')

  // Today's doc stays live so the form reflects what Echo chat logs while the page is open.
  useEffect(() => {
    setToday(undefined)
    return onSnapshot(
      query(healthLogsCol(uid), where(documentId(), '==', day)),
      (snap) => setToday(snap.docs[0]?.data() ?? null),
      (e) => {
        setToday(null)
        setError(e.message || 'Could not load today\'s log.')
      },
    )
  }, [uid, day])

  const startKey = useMemo(() => {
    const [y, m, d] = day.split('-').map(Number)
    return localDateKey(new Date(y, m - 1, d - 6))
  }, [day])

  useEffect(() => {
    const q = query(healthLogsCol(uid), where(documentId(), '>=', startKey), where(documentId(), '<=', day), orderBy(documentId()))
    return onSnapshot(
      q,
      (snap) => setWeek(snap.docs.map((s) => ({ date: s.id, mood: s.data().mood, moodTag: s.data().moodTag }))),
      (e) => {
        setWeek([])
        setError(e.message || 'Could not load this week.')
      },
    )
  }, [uid, day, startKey])

  useEffect(() => watchCalorieSettings(uid, setCal, () => setCal({ enabled: true })), [uid])

  const calEnabled = cal?.enabled ?? false
  useEffect(() => {
    if (!calEnabled) {
      setMeals(null)
      setMealError('')
      return
    }
    return mealsInRange(uid, startKey, day, setMeals, (e) => {
      setMeals([])
      setMealError(e.message || 'Could not load your meals.')
    })
  }, [uid, day, startKey, calEnabled])

  const series = useMemo<HealthWeekPoint[]>(() => {
    const base = lastSevenDays(day, week ?? [])
    const byDate = new Map((week ?? []).map((l) => [l.date, l]))
    const totals = new Map(dailyTotals(meals ?? [], base.map((b) => b.date)).map((t) => [t.date, t.calories]))
    return base.map((b) => ({ ...b, moodTag: moodTagOf(byDate.get(b.date)), calories: totals.get(b.date) ?? 0 }))
  }, [day, week, meals])
  const hasMood = series.some((p) => p.mood != null || p.moodTag != null)
  const hasCalories = series.some((p) => p.calories > 0)
  const todayMeals = useMemo(() => (meals ?? []).filter((m) => m.date === day), [meals, day])

  return (
    <div className="animate-in">
      <PageHeader title="Health" description="Log how you feel today and see your week." />
      {error && (
        <div className="mb-4">
          <Alert variant="danger">{error}</Alert>
        </div>
      )}
      {today === undefined ? <Skeleton className="h-64" /> : <TodayForm key={`${uid}-${day}`} uid={uid} day={day} live={today ?? {}} />}
      {cal === null ? (
        <Skeleton className="mt-5 h-48" />
      ) : (
        calEnabled && (
          <>
            {mealError && (
              <div className="mt-5">
                <Alert variant="danger">{mealError}</Alert>
              </div>
            )}
            {meals === null ? <Skeleton className="mt-5 h-48" /> : <CaloriesCard uid={uid} day={day} meals={todayMeals} goal={cal.goal} />}
          </>
        )
      )}
      <Card className="mt-5">
        <h2 className="text-base font-semibold text-foreground">Mood this week</h2>
        {week !== null && !hasMood && <p className="mt-2 text-sm text-muted-foreground">No mood logged in the last 7 days.</p>}
        {hasMood && (
          <div className="mt-4">
            <MoodWeekChart points={series} />
          </div>
        )}
      </Card>
      {calEnabled && (
        <Card className="mt-5">
          <h2 className="text-base font-semibold text-foreground">Calories this week</h2>
          {meals !== null && !hasCalories && <p className="mt-2 text-sm text-muted-foreground">No meals logged in the last 7 days.</p>}
          {hasCalories && (
            <div className="mt-4">
              <CaloriesWeekChart points={series} goal={cal?.goal} />
            </div>
          )}
        </Card>
      )}
      <p className="mt-5 text-xs text-muted-foreground">Echo logs and summarizes. It does not diagnose.</p>
    </div>
  )
}
