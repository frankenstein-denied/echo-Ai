'use client'

/**
 * SavedCard: one thing Echo saved, under a reply (diary, orb sheet, tell-Echo boxes).
 * Props: item (SavedItem), onUndo? (shows UNDO; give it only for creates that undoSaved can remove),
 * onOpen? (shows OPEN when there is no undo), undone? (greyed, struck through, no action).
 * Icon in the kind's colour, the label in bold, then a short detail ("Reminder", "Goal updated", "Meal · 540 kcal").
 */
import type { LucideIcon } from 'lucide-react'
import { Bell, Brain, FileText, HeartPulse, Plug, Target, Utensils } from 'lucide-react'
import type { SavedItem } from '@/lib/echo/client'
import { ORB_COLOR } from '@/lib/echo/orbs'
import { cn } from '@/lib/utils'

const CONNECTOR_COLOR = 'var(--color-node-connector)'

function look(item: SavedItem): { icon: LucideIcon; color: string; noun: string } {
  if (item.kcal !== undefined) return { icon: Utensils, color: ORB_COLOR.health, noun: 'Meal' }
  switch (item.type) {
    case 'note':
      return { icon: FileText, color: ORB_COLOR.note, noun: 'Note' }
    case 'goal':
      return { icon: Target, color: ORB_COLOR.goal, noun: 'Goal' }
    case 'reminder':
      return { icon: Bell, color: ORB_COLOR.reminder, noun: 'Reminder' }
    case 'health':
      return { icon: HeartPulse, color: ORB_COLOR.health, noun: 'Health' }
    case 'memory':
      return { icon: Brain, color: ORB_COLOR.interest, noun: '2nd Brain' }
    default:
      return { icon: Plug, color: CONNECTOR_COLOR, noun: 'Connector' }
  }
}

/** "Reminder", "Goal updated", "Note deleted", "Meal · 540 kcal". */
export function savedDetail(item: SavedItem): string {
  const { noun } = look(item)
  const verb = item.op === 'update' ? ' updated' : item.op === 'delete' ? ' deleted' : ''
  const kcal = item.kcal !== undefined && item.op !== 'delete' ? ` · ${item.kcal.toLocaleString('en-US')} kcal` : ''
  return `${noun}${verb}${kcal}`
}

/** The bold part: the item's title (a health log's label is only its date, so it reads "Today's health"). */
function savedTitle(item: SavedItem): string {
  if (item.type === 'health' && item.kcal === undefined && /^\d{4}-\d{2}-\d{2}$/.test(item.label)) return "Today's health"
  if (item.type === 'memory') return 'Remembered'
  return item.label
}

export function SavedCard({ item, onUndo, onOpen, undone = false }: { item: SavedItem; onUndo?: () => void; onOpen?: () => void; undone?: boolean }) {
  const { icon: Icon, color, noun } = look(item)
  const action = undone ? null : onUndo ? { label: 'UNDO', run: onUndo, aria: `Undo ${noun.toLowerCase()} ${item.label}` } : onOpen ? { label: 'OPEN', run: onOpen, aria: `Open ${noun.toLowerCase()} ${item.label}` } : null
  return (
    <div className={cn('flex min-w-0 items-center gap-2 rounded-xl border border-border bg-[#0e141b] px-2.5 py-2 text-[13px]', undone && 'opacity-60')}>
      <span aria-hidden="true" className="grid size-7 flex-none place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
        <Icon size={15} />
      </span>
      <span className={cn('min-w-0 flex-1 truncate text-foreground', undone && 'line-through')}>
        <b className="font-semibold">{savedTitle(item)}</b>
        <span className="text-muted-foreground"> · {undone ? 'Undone' : savedDetail(item)}</span>
      </span>
      {action && (
        <button type="button" onClick={action.run} aria-label={action.aria} className="touch-hit flex-none rounded-md px-1.5 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {action.label}
        </button>
      )}
    </div>
  )
}
