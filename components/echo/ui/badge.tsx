/**
 * Badge props: variant 'neutral'|'primary'|'success'|'warning'|'danger'|'info' (default primary for legacy callers),
 *   type?: 2nd Brain node type ('person'|'topic'|'interest'|'goal'|'health'|'task'|'diary'|'connector') overrides variant colours,
 *   children, violet?: legacy boolean (maps to info). Sentence case, 12px, 6px radius.
 */
import type { ReactNode } from 'react'
import { badgeClass, type BadgeVariant, type NodeType } from '@/lib/echo/ui-classes'

export function Badge({ children, variant, type, violet }: { children: ReactNode; variant?: BadgeVariant; type?: NodeType; violet?: boolean }) {
  const v: BadgeVariant = variant ?? (violet ? 'info' : 'primary')
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${badgeClass(v, type)}`}>{children}</span>
}
