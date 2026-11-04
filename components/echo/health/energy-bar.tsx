'use client'

import { useRef } from 'react'
import { ORB_COLOR } from '@/lib/echo/orbs'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import type { Energy } from '@/lib/firestore'

const ENERGIES: Energy[] = ['low', 'medium', 'high']
const C = ORB_COLOR.health

// 3-step radiogroup: steps up to the selected level glow green. Roving tabindex, arrow keys.
export function EnergyBar({ value, onChange }: { value: Energy | null; onChange: (e: Energy) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const level = value ? ENERGIES.indexOf(value) : -1
  const go = (j: number) => {
    const k = (j + ENERGIES.length) % ENERGIES.length
    onChange(ENERGIES[k])
    refs.current[k]?.focus()
  }
  return (
    <div role="radiogroup" aria-label="Energy" className="grid grid-cols-3 gap-2">
      {ENERGIES.map((e, i) => {
        const lit = i <= level
        const on = i === level
        return (
          <button
            key={e}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (i === 0 && level < 0) ? 0 : -1}
            onClick={() => onChange(e)}
            onKeyDown={(ev) => {
              const next = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? i + 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? i - 1 : null
              if (next !== null) {
                ev.preventDefault()
                go(next)
              }
            }}
            className={`flex min-h-11 flex-col items-stretch justify-end gap-1.5 rounded-lg px-0.5 pb-1 pt-1 text-xs font-medium ${on ? 'text-foreground' : 'text-muted-foreground'} ${FOCUS_RING}`}
          >
            <span
              aria-hidden="true"
              className="block rounded-full transition-[background-color,box-shadow] motion-reduce:transition-none"
              style={{
                height: 8 + i * 4,
                background: lit ? C : `color-mix(in srgb, ${C} 16%, transparent)`,
                boxShadow: lit ? `0 0 10px color-mix(in srgb, ${C} 70%, transparent)` : 'none',
              }}
            />
            {e.charAt(0).toUpperCase() + e.slice(1)}
          </button>
        )
      })}
    </div>
  )
}
