'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { documentId, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { Droplet, Flame, Minus, Moon, Plus, Smile, Utensils, Zap, type LucideIcon } from 'lucide-react'
import { healthLogsCol, mealsInRange, saveHealthChanges, watchCalorieSettings, type Energy, type HealthLog, type MealDoc } from '@/lib/firestore'
import { chartDays, debounce, healthPeriodDates, healthPeriodStats, localDateKey, mealsByDay, parseSleepInput, splitSleep, stepWater, type Debounced } from '@/lib/echo/view-helpers'
import { dailyTotals, MEAL_TYPE_LABELS, moodFromScore, MOOD_LABELS, moodScore, moodTagOf, type HealthWeekPoint, type MoodTag } from '@/lib/echo/health-helpers'
import { DEFAULT_PERIOD, emptyPeriodText, PERIOD_OPTIONS, type Period } from '@/lib/echo/period'
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

// Chart titles and empty-state wording per period. Today keeps the original 7-day wording.
const SPAN: Record<Period, { title: string; empty: string }> = {
  today: { title: 'this week', empty: 'in the last 7 days.' },
  week: { title: 'this week', empty: 'this week. Try another period.' },
  month: { title: 'this month', empty: 'this month. Try another period.' },
  all: { title: 'over the last 90 days', empty: 'in the last 90 days.' },
}

const dayLabel = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const kcal = (n: number) => `${n.toLocaleString('en-US')} kcal`

const daysHint = (n: number) => (n ? `over ${n} ${n === 1 ? 'day' : 'days'} logged` : 'nothing logged')

function Stat({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface-2 p-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon size={16} aria-hidden="true" />
        {label}
      </p>
      <p className="mt-2 truncate text-xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

export function HealthView({ uid }: { uid: string }) {
  const day = useDay()
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD)
  const [today, setToday] = useState<Fields | null | undefined>(undefined)
  const [logs, setLogs] = useState<{ date: string; mood?: number; moodTag?: string; sleepMinutes?: number }[] | null>(null)
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

  // Date keys the charts and averages cover (today: the last 7 days, as before).
  const keys = useMemo(() => {
    const [y, m, d] = day.split('-').map(Number)
    return healthPeriodDates(period, new Date(y, m - 1, d, 12))
  }, [day, period])
  const startKey = keys[0]
  const endKey = keys[keys.length - 1]

  // healthLogs are keyed by date, so a documentId range covers the period (single-field range: no index).
  useEffect(() => {
    setLogs(null)
    const q = query(healthLogsCol(uid), where(documentId(), '>=', startKey), where(documentId(), '<=', endKey), orderBy(documentId()))
    return onSnapshot(
      q,
      (snap) => setLogs(snap.docs.map((s) => ({ date: s.id, mood: s.data().mood, moodTag: s.data().moodTag, sleepMinutes: s.data().sleepMinutes }))),
      (e) => {
        setLogs([])
        setError(e.message || 'Could not load your health logs.')
      },
    )
  }, [uid, startKey, endKey])

  useEffect(() => watchCalorieSettings(uid, setCal, () => setCal({ enabled: true })), [uid])

  const calEnabled = cal?.enabled ?? false
  useEffect(() => {
    setMeals(null)
    if (!calEnabled) {
      setMealError('')
      return
    }
    return mealsInRange(uid, startKey, endKey, setMeals, (e) => {
      setMeals([])
      setMealError(e.message || 'Could not load your meals.')
    })
  }, [uid, startKey, endKey, calEnabled])

  const series = useMemo<HealthWeekPoint[]>(() => {
    const base = chartDays(keys, logs ?? [])
    const byDate = new Map((logs ?? []).map((l) => [l.date, l]))
    const totals = new Map(dailyTotals(meals ?? [], keys).map((t) => [t.date, t.calories]))
    return base.map((b) => ({ ...b, moodTag: moodTagOf(byDate.get(b.date)), calories: totals.get(b.date) ?? 0 }))
  }, [keys, logs, meals])
  const hasMood = series.some((p) => p.mood != null || p.moodTag != null)
  const hasCalories = series.some((p) => p.calories > 0)
  const todayMeals = useMemo(() => (meals ?? []).filter((m) => m.date === day), [meals, day])
  const stats = useMemo(() => healthPeriodStats(keys, logs ?? [], meals ?? []), [keys, logs, meals])
  const mealDays = useMemo(() => mealsByDay(meals ?? []), [meals])
  const isToday = period === 'today'
  const span = SPAN[period]
  const avgTag = stats.avgMood != null ? moodFromScore(stats.avgMood) : null
  const avgSleep = stats.avgSleepMinutes != null ? splitSleep(stats.avgSleepMinutes) : null
  const nothingLogged = logs !== null && (!calEnabled || meals !== null) && !stats.moodDays && !stats.sleepDays && !stats.mealDays

  return (
    <div className="animate-in">
      <PageHeader title="Health" description="Log how you feel today and see your week." />
      <div className="mb-5 max-w-full overflow-x-auto">
        <Segmented ariaLabel="Time period" value={period} onChange={(v) => setPeriod(v as Period)} options={PERIOD_OPTIONS} />
      </div>
      {error && (
        <div className="mb-4">
          <Alert variant="danger">{error}</Alert>
        </div>
      )}
      {isToday && (today === undefined ? <Skeleton className="h-64" /> : <TodayForm key={`${uid}-${day}`} uid={uid} day={day} live={today ?? {}} />)}
      {!isToday &&
        (logs === null ? (
          <Skeleton className="h-40" />
        ) : (
          <Card>
            <h2 className="text-base font-semibold text-foreground">Averages</h2>
            {nothingLogged ? (
              <p className="mt-2 text-sm text-muted-foreground">{emptyPeriodText(period)} Try another period.</p>
            ) : (
              <div className={`mt-4 grid grid-cols-2 gap-3 ${calEnabled ? 'md:grid-cols-4' : ''}`}>
                <Stat icon={Smile} label="Mood" value={stats.avgMood != null ? `${stats.avgMood}/10` : '-'} hint={avgTag ? `${MOOD_LABELS[avgTag]}, ${daysHint(stats.moodDays)}` : daysHint(stats.moodDays)} />
                <Stat icon={Moon} label="Sleep" value={avgSleep ? `${avgSleep.hours}h ${avgSleep.minutes}m` : '-'} hint={daysHint(stats.sleepDays)} />
                {calEnabled && (
                  <>
                    <Stat icon={Flame} label="Calories" value={meals === null ? '...' : kcal(stats.totalCalories)} hint="total" />
                    <Stat icon={Utensils} label="Daily average" value={stats.avgDailyCalories != null ? kcal(stats.avgDailyCalories) : '-'} hint={daysHint(stats.mealDays)} />
                  </>
                )}
              </div>
            )}
          </Card>
        ))}
      {cal === null ? (
        <Skeleton className="mt-5 h-48" />
      ) : (
        calEnabled &&
        isToday && (
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
        <h2 className="text-base font-semibold text-foreground">Mood {span.title}</h2>
        {logs !== null && !hasMood && <p className="mt-2 text-sm text-muted-foreground">No mood logged {span.empty}</p>}
        {hasMood && (
          <div className="mt-4">
            <MoodWeekChart points={series} />
          </div>
        )}
      </Card>
      {calEnabled && (
        <Card className="mt-5">
          <h2 className="text-base font-semibold text-foreground">Calories {span.title}</h2>
          {meals !== null && !hasCalories && <p className="mt-2 text-sm text-muted-foreground">No meals logged {span.empty}</p>}
          {hasCalories && (
            <div className="mt-4">
              <CaloriesWeekChart points={series} goal={cal?.goal} />
            </div>
          )}
        </Card>
      )}
      {calEnabled && !isToday && (
        <Card className="mt-5">
          <h2 className="text-base font-semibold text-foreground">Meals {span.title}</h2>
          {mealError && (
            <div className="mt-3">
              <Alert variant="danger">{mealError}</Alert>
            </div>
          )}
          {meals === null ? (
            <Skeleton className="mt-4 h-24" />
          ) : mealDays.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No meals logged {span.empty}</p>
          ) : (
            <div className="mt-4 grid gap-4">
              {mealDays.map((g) => (
                <section key={g.date} aria-label={dayLabel(g.date)}>
                  <div className="flex items-baseline justify-between gap-3 border-b border-border pb-1.5">
                    <h3 className="text-sm font-medium text-foreground">{dayLabel(g.date)}</h3>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{kcal(g.total)}</span>
                  </div>
                  <ul className="mt-2 grid gap-1.5">
                    {g.meals.map((m) => (
                      <li key={m.id} className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-foreground">
                          <span className="text-muted-foreground">{MEAL_TYPE_LABELS[m.mealType]}:</span> {m.description}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{kcal(m.totalCalories)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Card>
      )}
      <p className="mt-5 text-xs text-muted-foreground">Echo logs and summarizes. It does not diagnose.</p>
    </div>
  )
}
