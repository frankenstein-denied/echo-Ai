'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { addWaterGlass } from '@/lib/firestore'
import { ORB_COLOR, ORB_KINDS, orbSummary } from '@/lib/echo/orbs'
import { WATER_COLOR } from '@/lib/echo/glow'
import { MemoryOrb, OrbDefs } from './memory-orb'
import { useDay } from './use-day'
import { usePageOrb } from './use-page-orb'

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)'
function subscribeReduce(cb: () => void) {
  const mq = window.matchMedia(REDUCE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduce, () => window.matchMedia(REDUCE_QUERY).matches, () => false)
}

const STATUS_MS = 4000
const ORB_BOX = 160 // viewBox size; the halo may spill past it (overflow visible)

const chipTint = (c: string): CSSProperties => ({ borderColor: `color-mix(in srgb, ${c} 40%, var(--color-border))`, boxShadow: `0 0 12px -4px color-mix(in srgb, ${c} 55%, transparent)` })

/** Welcome on a page with no user message yet: today's orb, the greeting, quick-start chips and the call button. */
export function TodayOrbWelcome({
  uid,
  pageId,
  greeting,
  hint,
  onAsk,
  onFillComposer,
  callButton,
}: {
  uid: string
  pageId: string | undefined
  greeting: string
  hint?: string
  onAsk: (text: string) => void
  onFillComposer: (text: string) => void
  callButton?: ReactNode
}) {
  const orb = usePageOrb(uid, pageId)
  const reduced = usePrefersReducedMotion()
  const day = useDay()
  const empty = ORB_KINDS.every((k) => orb.counts[k] === 0)
  const summary = orbSummary(orb.counts).map((s) => s.text)
  const orbLabel = empty ? "Today's orb. Nothing saved yet." : `Today's orb. ${summary.join(', ')}.`
  // The diary hint repeats the greeting; show only what it adds.
  const extra = hint?.startsWith(greeting) ? hint.slice(greeting.length).trim() : hint?.trim()

  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const show = (text: string, error = false) => {
    clearTimeout(timer.current)
    setStatus({ text, error })
    timer.current = setTimeout(() => setStatus(null), STATUS_MS)
  }
  const logWater = async () => {
    if (saving) return
    setSaving(true)
    try {
      await addWaterGlass(uid, day)
      show('Logged a glass of water 💧')
    } catch (e) {
      console.error('Echo: could not log water', e)
      show('Could not log water.', true)
    } finally {
      setSaving(false)
    }
  }

  const chip =
    'inline-flex h-10 items-center justify-center gap-1.5 rounded-full border bg-surface-2 px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 max-lg:h-11'

  return (
    <div className="flex flex-col items-center py-8 text-center max-lg:py-4">
      <div className={`my-6 max-lg:my-4 ${empty && !reduced ? 'orb-breathe' : ''}`}>
        <svg role="img" aria-label={orbLabel} viewBox={`${-ORB_BOX / 2} ${-ORB_BOX / 2} ${ORB_BOX} ${ORB_BOX}`} overflow="visible" className="block size-40 overflow-visible max-lg:size-[130px]">
          <OrbDefs />
          <MemoryOrb orb={orb} reducedMotion={reduced} />
        </svg>
      </div>
      <p className="text-xl font-semibold text-foreground">{greeting}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">This is today&apos;s orb. It fills with color as you tell me about your day.</p>
      {extra ? <p className="mt-1 max-w-sm text-xs text-muted-foreground">{extra}</p> : null}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button type="button" className={chip} style={chipTint(ORB_COLOR.note)} onClick={() => onAsk('How was your day?')}>
          How was your day?
        </button>
        <button type="button" className={chip} style={chipTint(WATER_COLOR)} onClick={() => void logWater()} disabled={saving} aria-busy={saving}>
          💧 Log water
        </button>
        <button type="button" className={chip} style={chipTint(ORB_COLOR.goal)} onClick={() => onFillComposer('I want to ')}>
          🎯 Set a goal
        </button>
      </div>
      <p role="status" aria-live="polite" className={`mt-2 min-h-5 text-xs ${status?.error ? 'text-danger' : 'text-muted-foreground'}`}>
        {status?.text ?? ''}
      </p>
      {callButton ? <div className="mt-4 flex flex-col items-center">{callButton}</div> : null}
    </div>
  )
}
