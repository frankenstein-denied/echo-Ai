'use client'

import { useEffect, useRef } from 'react'
import { MemoryOrb, OrbDefs } from './memory-orb'
import { usePageOrb } from './use-page-orb'

const ORB_BOX = 160 // viewBox size, as in the welcome orb (orb radius 60)
const ORB_SHARE = (2 * 60) / ORB_BOX // the orb's diameter as a share of the box
const PULSE = 0.06 // scale 1.00–1.06 with Echo's voice
const RING_DELAYS_S = [0, 0.8, 1.6] // three rings, staggered over the 2.4 s brief-ring loop

/**
 * Today's orb while Echo speaks the daily brief: it pulses with Echo's voice and rings ripple outward,
 * only while `speaking`. Reduced motion shows a static glow instead. Decorative; the call status says the rest.
 */
export function BriefOrb({ uid, pageId, getLevel, speaking, reducedMotion, size }: { uid: string; pageId: string | undefined; getLevel: () => number; speaking: boolean; reducedMotion: boolean; size: number }) {
  const orb = usePageOrb(uid, pageId)
  const pulse = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = pulse.current
    if (!el || !speaking || reducedMotion) return
    let raf = 0
    const tick = () => {
      const level = Math.min(1, Math.max(0, getLevel()))
      el.style.transform = `scale(${1 + PULSE * level})`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      el.style.transform = ''
    }
  }, [speaking, reducedMotion, getLevel])

  const inset = `${((1 - ORB_SHARE) / 2) * 100}%`
  const glow = speaking && reducedMotion ? 'drop-shadow(0 0 18px color-mix(in srgb, var(--color-primary) 45%, transparent))' : undefined
  return (
    <div aria-hidden="true" className="relative shrink-0" style={{ width: size, height: size }}>
      {speaking && !reducedMotion
        ? RING_DELAYS_S.map((d) => <span key={d} className="brief-ring pointer-events-none absolute rounded-full border-2 border-primary/50" style={{ inset, animationDelay: `${d}s` }} />)
        : null}
      <div ref={pulse} className="size-full" style={{ filter: glow }}>
        <svg viewBox={`${-ORB_BOX / 2} ${-ORB_BOX / 2} ${ORB_BOX} ${ORB_BOX}`} overflow="visible" className="block size-full overflow-visible">
          <OrbDefs />
          <MemoryOrb orb={orb} reducedMotion={reducedMotion} />
        </svg>
      </div>
    </div>
  )
}
