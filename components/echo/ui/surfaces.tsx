/**
 * Surfaces and page structure
 * Card props: children, className?, as?: 'section'|'div' (default section), style? (e.g. glowCardStyle). Solid surface, 1px border, 12px radius, p-5.
 * PageHeader props: title: string, description?: string, action?: ReactNode (primary action, right-aligned; full width
 *   on phones), line?: ReactNode (live one-liner under the title, e.g. "12 notes · 4 this week"; announced politely and
 *   shown on phones too), actions?: ReactNode (small icon buttons that stay inline on phones, e.g. search, +).
 * EmptyState props: icon: LucideIcon (24px), title: string, description?: string, action?: ReactNode,
 *   tell?: { sentence, onSend, label? } (a sentence to tell Echo and a button that sends it; see tell-echo.tsx).
 * Alert props: variant 'danger'|'warning'|'success'|'info' (default danger), title?, children. danger/warning use role="alert".
 * Skeleton props: className (set size, e.g. "h-4 w-32"). Decorative pulse block.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { TellEchoButton, type TellEcho } from './tell-echo'

export function Card({ children, className = '', as: Tag = 'section', style }: { children: ReactNode; className?: string; as?: 'section' | 'div'; style?: CSSProperties }) {
  return <Tag className={`rounded-xl border border-border bg-surface p-5 max-sm:p-4 ${className}`} style={style}>{children}</Tag>
}

export function PageHeader({ title, description, action, line, actions }: { title: string; description?: string; action?: ReactNode; line?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4 max-lg:mb-5 max-lg:gap-3">
      <div className="min-w-0 flex-1">
        {/* Below lg the shell's compact title bar shows the title; the h1 stays for screen readers. */}
        <h1 className="text-2xl font-semibold leading-8 text-foreground max-lg:sr-only">{title}</h1>
        {line && (
          <p aria-live="polite" className="truncate text-sm text-muted-foreground">
            {line}
          </p>
        )}
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      {action && <div className="shrink-0 max-sm:w-full max-sm:*:w-full">{action}</div>}
    </header>
  )
}

export function EmptyState({ icon: Icon, title, description, action, tell }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode; tell?: TellEcho }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-muted-foreground">
        <Icon size={24} aria-hidden="true" />
      </span>
      <div className="grid gap-1">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {tell && <TellEchoButton {...tell} />}
      {action}
    </div>
  )
}

const ALERT = {
  danger: { cls: 'border-danger/40 bg-danger-soft', icon: XCircle, tint: 'text-danger' },
  warning: { cls: 'border-warning/40 bg-warning-soft', icon: AlertTriangle, tint: 'text-warning' },
  success: { cls: 'border-success/40 bg-success-soft', icon: CheckCircle2, tint: 'text-success' },
  info: { cls: 'border-info/40 bg-info-soft', icon: Info, tint: 'text-info' },
} as const

export function Alert({ variant = 'danger', title, children }: { variant?: keyof typeof ALERT; title?: string; children?: ReactNode }) {
  const a = ALERT[variant]
  const Icon = a.icon
  return (
    <div role={variant === 'danger' || variant === 'warning' ? 'alert' : 'status'} className={`flex gap-3 rounded-lg border p-3 text-sm text-foreground ${a.cls}`}>
      <Icon size={16} aria-hidden="true" className={`mt-0.5 shrink-0 ${a.tint}`} />
      <div className="grid gap-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-surface-2 ${className}`} />
}
