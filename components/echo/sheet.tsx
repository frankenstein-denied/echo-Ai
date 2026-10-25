'use client'

/**
 * Sheet: bottom sheet for touch layouts.
 * Props: open, onClose, title (visible heading + accessible name), description?, children, footer?.
 * Slides up from the bottom with a drag handle (drag down or flick to dismiss), focus-trapped,
 * Esc / browser Back / backdrop tap close it, body scroll is locked, safe-area padded.
 * Motion is removed by the global prefers-reduced-motion rule. Renders in a portal on document.body.
 * SheetItem: a 48 px row button for action lists (icon, label, optional description, tone 'danger').
 */
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'
import { MOBILE_QUERY, sheetDragOffset, shouldDismissSheet } from '@/lib/echo/mobile'
import { FOCUS_RING } from '@/lib/echo/ui-classes'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

let sheetSeq = 0

export function Sheet({ open, onClose, title, description, children, footer }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <SheetPanel onClose={onClose} title={title} description={description} footer={footer}>
      {children}
    </SheetPanel>,
    document.body,
  )
}

function SheetPanel({ onClose, title, description, children, footer }: { onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const titleId = useId()
  const descId = useId()
  const [dy, setDy] = useState(0)
  // A sheet opened by a tap (e.g. on a graph node) must ignore that same tap's trailing click landing on the new backdrop.
  const openedAt = useRef(performance.now())
  const drag = useRef<{ y: number; t: number; lastY: number; lastT: number; v: number } | null>(null)

  // Focus, scroll lock, restore focus on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const first = panel.current?.querySelector<HTMLElement>(`[data-sheet-body] ${FOCUSABLE.split(',').join(`, [data-sheet-body] `)}`)
    ;(first ?? panel.current)?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = prevOverflow
      previous?.focus?.({ preventScroll: true })
    }
  }, [])

  // Sheets are a touch-layout pattern: close if the viewport grows to the desktop layout (>= lg).
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = (e: MediaQueryListEvent) => {
      if (!e.matches) closeRef.current()
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Browser Back closes the sheet: push a history entry (copying Next's router state) and pop it on close.
  useEffect(() => {
    const id = `sheet-${++sheetSeq}`
    let pushed = false
    const onPop = () => {
      pushed = false
      closeRef.current()
    }
    // Deferred so React StrictMode's mount/unmount/mount in dev does not push and pop twice.
    const t = window.setTimeout(() => {
      window.history.pushState({ ...(window.history.state ?? {}), echoSheet: id }, '')
      pushed = true
      window.addEventListener('popstate', onPop)
    }, 0)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('popstate', onPop)
      if (pushed && window.history.state?.echoSheet === id) window.history.back()
    }
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      e.nativeEvent.stopImmediatePropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !panel.current) return
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
    if (!items.length) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    if (!panel.current.contains(document.activeElement) || document.activeElement === panel.current) {
      e.preventDefault()
      ;(e.shiftKey ? last : first).focus()
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const onDragStart = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const now = performance.now()
    drag.current = { y: e.clientY, t: now, lastY: e.clientY, lastT: now, v: 0 }
  }
  const onDragMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const now = performance.now()
    if (now > d.lastT) d.v = (e.clientY - d.lastY) / (now - d.lastT)
    d.lastY = e.clientY
    d.lastT = now
    setDy(sheetDragOffset(e.clientY - d.y))
  }
  const onDragEnd = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const moved = e.clientY - d.y
    const height = panel.current?.getBoundingClientRect().height ?? 400
    if (shouldDismissSheet(moved, height, d.v)) onClose()
    else setDy(0)
  }

  return (
    <div
      className="fixed inset-0 z-50"
      onKeyDown={onKeyDown}
      onClickCapture={(e) => {
        if (performance.now() - openedAt.current < 400) {
          e.stopPropagation()
          e.preventDefault()
        }
      }}
    >
      <div aria-hidden="true" className="sheet-backdrop absolute inset-0 bg-background/80" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        style={dy ? { transform: `translateY(${dy}px)`, transition: drag.current ? 'none' : undefined } : undefined}
        className="sheet-panel absolute inset-x-0 bottom-0 mx-auto flex max-h-[min(85dvh,calc(100dvh-env(safe-area-inset-top)-16px))] w-full max-w-lg flex-col rounded-t-2xl border-x border-t border-border-strong bg-surface pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] transition-transform duration-200 focus:outline-none"
      >
        <div
          aria-hidden="true"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center pt-2"
        >
          <span className="h-1 w-10 rounded-full bg-border-strong" />
        </div>
        <div onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd} className="shrink-0 touch-none px-5 pb-3 pt-2">
          <h2 id={titleId} className="truncate text-base font-semibold text-foreground">
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-0.5 text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <div data-sheet-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-1">
          {children}
        </div>
        {footer && <div className="shrink-0 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function SheetItem({ icon: Icon, label, description, tone = 'default', active = false, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: LucideIcon; label: string; description?: string; tone?: 'default' | 'danger'; active?: boolean }) {
  const color = tone === 'danger' ? 'text-danger' : active ? 'text-primary' : 'text-foreground'
  return (
    <button
      type="button"
      className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-base transition-colors active:bg-surface-2 disabled:opacity-50 ${active ? 'bg-primary-soft' : 'hover:bg-surface-2'} ${color} ${FOCUS_RING} ${className}`}
      {...rest}
    >
      {Icon && <Icon size={20} aria-hidden="true" className={tone === 'danger' ? 'text-danger' : active ? 'text-primary' : 'text-muted-foreground'} />}
      <span className="grid min-w-0 flex-1">
        <span className="truncate">{label}</span>
        {description && <span className="text-sm text-muted-foreground">{description}</span>}
      </span>
    </button>
  )
}
