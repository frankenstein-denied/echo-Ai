'use client'

/**
 * ConfirmDialog: modal confirmation for destructive actions.
 * Props: title (full heading text), body (ReactNode), confirmLabel, busy?, error?, onCancel, onConfirm.
 * Focus moves into the dialog and returns on close, Tab is trapped, Escape cancels (unless busy).
 */
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { Alert } from './surfaces'
import { Button } from './button'

export function ConfirmDialog({ title, body, confirmLabel, busy = false, error = null, onCancel, onConfirm }: { title: string; body: ReactNode; confirmLabel: string; busy?: boolean; error?: string | null; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const uid = useId()
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    return () => prev?.focus()
  }, [])
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !busy) {
      e.stopPropagation()
      onCancel()
    }
    if (e.key === 'Tab' && ref.current) {
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>('button:not([disabled])'))
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onKeyDown={onKeyDown}>
      <div aria-hidden="true" className="absolute inset-0 bg-background/80" onClick={busy ? undefined : onCancel} />
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby={`${uid}-title`} aria-describedby={`${uid}-desc`} className="relative w-full max-w-md rounded-xl border border-border-strong bg-surface p-6">
        <h2 id={`${uid}-title`} className="text-base font-semibold text-foreground">{title}</h2>
        <div id={`${uid}-desc`} className="mt-2 text-sm text-muted-foreground">{body}</div>
        {error && (
          <div className="mt-3">
            <Alert variant="danger">{error}</Alert>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" icon={Trash2} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
