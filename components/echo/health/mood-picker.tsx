'use client'

import { useRef } from 'react'
import { Angry, Annoyed, BatteryLow, Frown, Laugh, Meh, Smile, type LucideIcon } from 'lucide-react'
import { MOOD_LABELS, MOOD_TAGS, type MoodTag } from '@/lib/echo/health-helpers'
import { FOCUS_RING } from '@/lib/echo/ui-classes'

export const MOOD_COLORS: Record<MoodTag, string> = {
  great: '#fbbf24',
  happy: '#34d399',
  okay: '#94a3b8',
  tired: '#818cf8',
  sad: '#60a5fa',
  anxious: '#a78bfa',
  angry: '#f87171',
}

export const MOOD_ICONS: Record<MoodTag, LucideIcon> = {
  great: Laugh,
  happy: Smile,
  okay: Meh,
  tired: BatteryLow,
  sad: Frown,
  anxious: Annoyed,
  angry: Angry,
}

// Single-select radiogroup of mood icons (roving tabindex, arrow keys). Each button is >= 44 px.
// variant 'grid' (default): labelled tiles; 'row': one row of 7 round faces, the label as the accessible name
// (needs 7 x 44 px = 308 px; the Health card gives it that much on a 360 px phone).
export function MoodPicker({ value, onChange, variant = 'grid' }: { value: MoodTag | null; onChange: (tag: MoodTag) => void; variant?: 'grid' | 'row' }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const go = (j: number) => {
    const k = (j + MOOD_TAGS.length) % MOOD_TAGS.length
    onChange(MOOD_TAGS[k])
    refs.current[k]?.focus()
  }
  return (
    <div role="radiogroup" aria-label="Mood" className={variant === 'row' ? 'flex justify-between gap-0.5 sm:justify-start sm:gap-3' : 'grid grid-cols-4 gap-2 sm:grid-cols-7'}>
      {MOOD_TAGS.map((tag, i) => {
        const on = tag === value
        const Icon = MOOD_ICONS[tag]
        const c = MOOD_COLORS[tag]
        if (variant === 'row')
          return (
            <button
              key={tag}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={MOOD_LABELS[tag]}
              title={MOOD_LABELS[tag]}
              tabIndex={on || (i === 0 && !value) ? 0 : -1}
              onClick={() => onChange(tag)}
              onKeyDown={(e) => {
                const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? MOOD_TAGS.length - 1 : null
                if (next !== null) {
                  e.preventDefault()
                  go(next)
                }
              }}
              style={{
                color: c,
                borderColor: c,
                opacity: on || !value ? 1 : 0.55,
                ...(on ? { background: `color-mix(in srgb, ${c} 22%, transparent)`, boxShadow: `0 0 12px color-mix(in srgb, ${c} 55%, transparent)` } : {}),
              }}
              className={`grid size-11 shrink-0 place-items-center rounded-full border-[1.5px] transition-[background-color,box-shadow,opacity] hover:opacity-100 motion-reduce:transition-none ${FOCUS_RING}`}
            >
              <Icon size={20} aria-hidden="true" />
            </button>
          )
        return (
          <button
            key={tag}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (i === 0 && !value) ? 0 : -1}
            onClick={() => onChange(tag)}
            onKeyDown={(e) => {
              const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? MOOD_TAGS.length - 1 : null
              if (next !== null) {
                e.preventDefault()
                go(next)
              }
            }}
            style={
              on
                ? { background: `color-mix(in srgb, ${c} 18%, transparent)`, borderColor: c, boxShadow: `0 0 14px color-mix(in srgb, ${c} 45%, transparent), inset 0 0 10px color-mix(in srgb, ${c} 15%, transparent)` }
                : { borderColor: `color-mix(in srgb, ${c} 28%, var(--color-border))` }
            }
            className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-xs font-medium transition-[background-color,box-shadow,border-color] motion-reduce:transition-none ${FOCUS_RING} ${on ? 'text-foreground' : 'bg-surface text-muted-foreground hover:bg-surface-2 hover:text-foreground'}`}
          >
            <Icon size={24} aria-hidden="true" style={{ color: c }} />
            {MOOD_LABELS[tag]}
          </button>
        )
      })}
    </div>
  )
}
