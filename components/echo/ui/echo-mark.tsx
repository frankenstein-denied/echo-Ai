/**
 * EchoMark (also exported as Orb for existing callers)
 * Props: state?: 'idle'|'listening'|'thinking'|'speaking'; or legacy booleans listening/thinking/speaking; small?: boolean (48px vs 128-176px).
 * Solid primary circle, no gradient/glow. Idle=Sparkles, listening=Mic (scale pulse), thinking=three-dot pulse, speaking=AudioLines.
 * Animations are disabled by the global prefers-reduced-motion rule. Decorative (aria-hidden); announce state in surrounding text.
 */
import { AudioLines, Mic, Sparkles } from 'lucide-react'

export type EchoMarkState = 'idle' | 'listening' | 'thinking' | 'speaking'

export function EchoMark({ state, small = false, thinking = false, listening = false, speaking = false }: { state?: EchoMarkState; small?: boolean; thinking?: boolean; listening?: boolean; speaking?: boolean }) {
  const s: EchoMarkState = state ?? (listening ? 'listening' : thinking ? 'thinking' : speaking ? 'speaking' : 'idle')
  const icon = small ? 20 : 48
  return (
    <div aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full bg-primary text-primary-foreground ${small ? 'size-12' : 'size-32 md:size-44'} ${s === 'listening' ? 'echo-pulse' : ''}`}>
      {s === 'idle' && <Sparkles size={icon} />}
      {s === 'listening' && <Mic size={icon} />}
      {s === 'speaking' && <AudioLines size={icon} />}
      {s === 'thinking' && (
        <span className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <span key={i} className={`echo-dot rounded-full bg-primary-foreground ${small ? 'size-1.5' : 'size-3'}`} style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </span>
      )}
    </div>
  )
}

export const Orb = EchoMark
