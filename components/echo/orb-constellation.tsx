'use client'

import { useSyncExternalStore, type CSSProperties } from 'react'
import { ORB_COLOR } from '@/lib/echo/orbs'
import { SAMPLE_ORBS, SAMPLE_THREADS } from '@/lib/echo/sample-orbs'
import { MemoryOrb, OrbDefs } from './memory-orb'

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)'
function subscribeReduce(cb: () => void) {
  const mq = window.matchMedia(REDUCE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduce, () => window.matchMedia(REDUCE_QUERY).matches, () => false)
}

// Fixed spots in a 360 x 300 box, by sample orb id. Halos stay inside the box.
const SPOTS: Record<string, { x: number; y: number }> = {
  'orb-sample-1': { x: 178, y: 152 },
  'orb-sample-2': { x: 74, y: 76 },
  'orb-sample-3': { x: 288, y: 92 },
  'orb-sample-4': { x: 296, y: 232 },
  'orb-sample-5': { x: 82, y: 226 },
}

// Each orb floats on its own 6-9 s loop, staggered so they never move in step.
const DRIFT = [7.2, 6.1, 8.6, 6.8, 7.9]

/** Decorative constellation of sample memory orbs joined by faint threads (landing page). */
export function OrbConstellation({ className = '' }: { className?: string }) {
  const reduced = usePrefersReducedMotion()
  return (
    <svg
      viewBox="0 0 360 300"
      role="img"
      aria-label="Example memories as glowing orbs: each day is an orb colored by its notes, goals, reminders, health, people and interests, joined by threads"
      className={`overflow-visible ${className}`}
    >
      <OrbDefs />
      <g>
        {SAMPLE_THREADS.map((t) => {
          const a = SPOTS[t.source]
          const b = SPOTS[t.target]
          return <line key={`${t.source}-${t.target}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ORB_COLOR[t.kind]} strokeOpacity={0.45} strokeWidth={1.5} strokeLinecap="round" />
        })}
      </g>
      {SAMPLE_ORBS.map((orb, i) => {
        const { x, y } = SPOTS[orb.id]
        const dur = DRIFT[i % DRIFT.length]
        const style = { animationDuration: `${dur}s`, animationDelay: `${-(i * 1.3).toFixed(1)}s` } as CSSProperties
        return (
          <g key={orb.id} transform={`translate(${x} ${y})`}>
            <g className="orb-drift" style={style}>
              <MemoryOrb orb={orb} reducedMotion={reduced} />
            </g>
          </g>
        )
      })}
    </svg>
  )
}
