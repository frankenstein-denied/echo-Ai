'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { documentId, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { Droplet, Minus, Moon, Plus, Smile, Zap, type LucideIcon } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { healthLogsCol, saveHealthChanges, type Energy, type HealthLog } from '@/lib/firestore'
import { debounce, lastSevenDays, localDateKey, parseSleepInput, splitSleep, stepWater, type Debounced } from '@/lib/echo/view-helpers'
import { Alert, Card, IconButton, Input, PageHeader, Segmented, Skeleton } from './ui'

type Fields = Partial<Pick<HealthLog, 'mood' | 'sleepMinutes' | 'waterGlasses' | 'energy'>>

const ENERGIES: Energy[] = ['low', 'medium', 'high']

// Re-renders when the local day changes.
function useDay(): string {
  const [day, setDay] = useState(() => localDateKey(new Date()))
  useEffect(() => {
    const id = setInterval(() => setDay(localDateKey(new Date())), 60000)
    return () => clearInterval(id)
  }, [])
  return day
}

type Edits = { mood?: number; energy?: Energy; water?: number; sleep?: { h: string; m: string } }
type EditKey = keyof Edits

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
            for (const k of Object.keys(sent) as EditKey[]) if (versions.current[k] === sent[k]) delete next[k]
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

  const mood = edits.mood ?? live.mood
  const energy = edits.energy ?? live.energy
  const water = edits.water ?? live.waterGlasses ?? 0
  const liveSleep = live.sleepMinutes != null ? splitSleep(live.sleepMinutes) : null
  const sleepH = edits.sleep ? edits.sleep.h : liveSleep ? String(liveSleep.hours) : ''
  const sleepM = edits.sleep ? edits.sleep.m : liveSleep ? String(liveSleep.minutes) : ''

  const logMood = (v: number) => {
    if (mood === v) return
    touch('mood')
    setEdits((p) => ({ ...p, mood: v }))
    pending.current = { ...pending.current, mood: v }
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

  const stepGlass = (delta: number) => {
    const next = stepWater(water, delta)
    if (next === water) return
    touch('water')
    setEdits((p) => ({ ...p, water: next }))
    pendingWater.current += next - water
    queue()
  }

  const label = (Icon: LucideIcon, text: string) => (
    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
      <Icon size={16} aria-hidden="true" className="text-muted-foreground" />
      {text}
    </p>
  )

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
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div>
          {label(Smile, mood != null ? `Mood · ${mood}/10` : 'Mood')}
          {mood == null && <p className="mt-1 text-xs text-muted-foreground">Not logged. Tap the slider to log it.</p>}
          <input
            type="range"
            min={1}
            max={10}
            value={mood ?? 5}
            aria-label="Mood"
            onChange={(e) => logMood(Number(e.target.value))}
            onPointerUp={(e) => logMood(Number(e.currentTarget.value))}
            onClick={(e) => logMood(Number(e.currentTarget.value))}
            className={`mt-3 w-full accent-primary ${mood == null ? 'opacity-50' : ''}`}
          />
        </div>
        <div>
          {label(Moon, 'Sleep')}
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Input type="number" min={0} max={24} value={sleepH} placeholder="0" aria-label="Sleep hours" onChange={(e) => changeSleep(e.target.value, sleepM)} className="w-20 text-center" />
            h
            <Input type="number" min={0} max={59} value={sleepM} placeholder="0" aria-label="Sleep minutes" onChange={(e) => changeSleep(sleepH, e.target.value)} className="w-20 text-center" />
            m
          </div>
        </div>
        <div>
          {label(Droplet, 'Water')}
          <div className="mt-3 flex items-center gap-3">
            <IconButton icon={Minus} label="Fewer glasses" variant="secondary" onClick={() => stepGlass(-1)} />
            <span className="min-w-24 text-center text-sm text-foreground">{water} glasses</span>
            <IconButton icon={Plus} label="More glasses" variant="secondary" onClick={() => stepGlass(1)} />
          </div>
        </div>
        <div>
          {label(Zap, 'Energy')}
          <div className="mt-3">
            <Segmented
              ariaLabel="Energy"
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
          </div>
        </div>
      </div>
    </Card>
  )
}

export function HealthView({ uid }: { uid: string }) {
  const day = useDay()
  const [today, setToday] = useState<Fields | null | undefined>(undefined)
  const [week, setWeek] = useState<{ date: string; mood?: number }[] | null>(null)
  const [error, setError] = useState('')

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
      (snap) => setWeek(snap.docs.map((s) => ({ date: s.id, mood: s.data().mood }))),
      (e) => {
        setWeek([])
        setError(e.message || 'Could not load this week.')
      },
    )
  }, [uid, day, startKey])

  const series = useMemo(() => lastSevenDays(day, week ?? []), [day, week])
  const hasMood = series.some((p) => p.mood != null)

  return (
    <div className="animate-in">
      <PageHeader title="Health" description="Log how you feel today and see your mood over the week." />
      {error && (
        <div className="mb-4">
          <Alert variant="danger">{error}</Alert>
        </div>
      )}
      {today === undefined ? <Skeleton className="h-64" /> : <TodayForm key={`${uid}-${day}`} uid={uid} day={day} live={today ?? {}} />}
      <Card className="mt-5">
        <h2 className="text-base font-semibold text-foreground">This week</h2>
        {week !== null && !hasMood && <p className="mt-2 text-sm text-muted-foreground">No mood logged in the last 7 days.</p>}
        <div className="mt-5 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--color-border-strong)" tick={{ fill: 'var(--color-muted-foreground)' }} fontSize={12} tickLine={false} />
              <YAxis domain={[0, 10]} ticks={[0, 5, 10]} stroke="var(--color-border-strong)" tick={{ fill: 'var(--color-muted-foreground)' }} fontSize={12} tickLine={false} />
              <Tooltip contentStyle={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border-strong)', borderRadius: 8, fontSize: 12, color: 'var(--color-foreground)' }} />
              <Line type="monotone" dataKey="mood" name="Mood" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 4, fill: 'var(--color-primary)' }} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <p className="mt-5 text-xs text-muted-foreground">Echo logs and summarizes. It does not diagnose.</p>
    </div>
  )
}
