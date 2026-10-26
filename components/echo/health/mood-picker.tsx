'use client'

import { useRef } from 'react'
import { Angry, Annoyed, BatteryLow, Frown, Laugh, Meh, Smile, type LucideIcon } from 'lucide-react'
import { MOOD_LABELS, MOOD_TAGS, type MoodTag } from '@/lib/echo/health-helpers'
import { FOCUS_RING } from '@/lib/echo/ui-classes'

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
export function MoodPicker({ value, onChange }: { value: MoodTag | null; onChange: (tag: MoodTag) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const go = (j: number) => {
    const k = (j + MOOD_TAGS.length) % MOOD_TAGS.length
    onChange(MOOD_TAGS[k])
    refs.current[k]?.focus()
  }
  return (
    <div role="radiogroup" aria-label="Mood" className="grid grid-cols-4 gap-2 sm:grid-cols-7">
      {MOOD_TAGS.map((tag, i) => {
        const on = tag === value
        const Icon = MOOD_ICONS[tag]
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
            className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2 text-xs font-medium transition-colors ${FOCUS_RING} ${on ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-muted-foreground hover:bg-surface-2 hover:text-foreground'}`}
          >
            <Icon size={24} aria-hidden="true" />
            {MOOD_LABELS[tag]}
          </button>
        )
      })}
    </div>
  )
}
