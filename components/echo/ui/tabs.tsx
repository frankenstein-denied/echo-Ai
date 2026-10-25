/**
 * Segmented (single-choice switcher) props: value: string, onChange(value), ariaLabel: string,
 *   options: {value,label,icon?: LucideIcon}[], fullWidth?: boolean (stretch to container, equal-width segments). Renders role="radiogroup" with role="radio" buttons (roving tabindex);
 *   Arrow keys move and focus, Home/End jump. Selected segment uses primary-soft.
 */
import { useRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { FOCUS_RING } from '@/lib/echo/ui-classes'

export function Segmented({ value, onChange, options, ariaLabel, fullWidth = false }: { value: string; onChange: (v: string) => void; options: { value: string; label: string; icon?: LucideIcon }[]; ariaLabel: string; fullWidth?: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const go = (j: number) => {
    const k = (j + options.length) % options.length
    onChange(options[k].value)
    refs.current[k]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`${fullWidth ? 'flex w-full' : 'inline-flex'} gap-1 rounded-lg border border-border bg-surface p-1`}>
      {options.map((o, i) => {
        const on = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            ref={el => { refs.current[i] = el }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (i === 0 && !options.some(x => x.value === value)) ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={e => {
              const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : null
              if (next !== null) { e.preventDefault(); go(next) }
            }}
            className={`touch-hit inline-flex h-8 max-lg:h-10 items-center justify-center gap-1.5 ${fullWidth ? 'flex-1' : ''} rounded-md px-3 text-sm font-medium transition-colors ${FOCUS_RING} ${on ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {Icon && <Icon size={16} aria-hidden="true" />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
