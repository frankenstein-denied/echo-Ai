'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Check, Copy, Info, X } from 'lucide-react'
import { GUIDE_SLIDES, SHARE_LINK, type GuideSlide } from '@/lib/echo/guide'
import { Button, IconButton } from './ui'

const GuideContext = createContext<(() => void) | null>(null)
export const GuideProvider = GuideContext.Provider

/** The (i) icon that reopens the walkthrough. Renders nothing outside the dashboard (floating Echo windows). */
export function GuideInfoButton({ className = '' }: { className?: string }) {
  const open = useContext(GuideContext)
  if (!open) return null
  return <IconButton icon={Info} label="How Echo works" size="sm" className={className} onClick={open} />
}

function ShareCard() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SHARE_LINK)
      setState('copied')
    } catch {
      setState('failed')
    }
  }
  return (
    <div className="mt-5 grid gap-3 rounded-xl border border-border bg-surface p-4">
      <p className="select-all break-all text-sm text-muted-foreground">{SHARE_LINK}</p>
      <Button icon={state === 'copied' ? Check : Copy} onClick={() => void copy()}>
        {state === 'copied' ? 'Link copied' : 'Copy app link'}
      </Button>
      {state === 'failed' && <p className="text-sm text-muted-foreground">Couldn&apos;t copy. Press and hold the link above to copy it.</p>}
    </div>
  )
}

function Slide({ slide }: { slide: GuideSlide }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-6 lg:flex-row lg:items-center lg:gap-12">
      {slide.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slide.image} alt={slide.alt ?? ''} className="max-h-[42dvh] w-auto max-w-full shrink-0 rounded-2xl border border-border-strong shadow-lg lg:max-h-[70dvh]" />
      ) : (
        slide.id === 'welcome' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/icons/echo.svg" alt="Echo logo" width={128} height={128} className="size-32 shrink-0" />
        )
      )}
      <div className="w-full min-w-0 max-w-md">
        <h2 className="text-2xl font-semibold text-foreground">{slide.title}</h2>
        <p className="mt-2 text-base leading-6 text-muted-foreground">{slide.body}</p>
        {(slide.points || slide.avoid) && (
          <ul className="mt-4 grid gap-2.5">
            {slide.points?.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm text-foreground">
                <Check size={18} aria-hidden="true" className="mt-px shrink-0 text-primary" />
                <span>{p}</span>
              </li>
            ))}
            {slide.avoid?.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm text-foreground">
                <X size={18} aria-hidden="true" className="mt-px shrink-0 text-danger" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}
        {slide.id === 'share' && <ShareCard />}
      </div>
    </div>
  )
}

function GuidePanel({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const nextBtn = useRef<HTMLDivElement>(null)
  const last = GUIDE_SLIDES.length - 1
  const slide = GUIDE_SLIDES[index]

  useEffect(() => {
    const body = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    nextBtn.current?.querySelector('button')?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = body
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(last, i + 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [last, onClose])

  return (
    <div role="dialog" aria-modal="true" aria-label="How Echo works" className="fixed inset-0 z-[60] flex flex-col bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {index + 1} of {GUIDE_SLIDES.length}
        </p>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {index === last ? 'Close' : 'Skip'}
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 overflow-y-auto px-4 py-2">
        <div key={slide.id} className="animate-in m-auto w-full">
          <Slide slide={slide} />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-4xl shrink-0 items-center gap-3 p-4">
        <div className="min-w-24">
          {index > 0 && (
            <Button variant="secondary" icon={ArrowLeft} onClick={() => setIndex(index - 1)}>
              Back
            </Button>
          )}
        </div>
        <div aria-hidden="true" className="flex flex-1 justify-center gap-1.5">
          {GUIDE_SLIDES.map((s, i) => (
            <span key={s.id} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-primary' : 'w-1.5 bg-border-strong'}`} />
          ))}
        </div>
        <div ref={nextBtn} className="flex min-w-24 justify-end">
          {index === last ? (
            <Button onClick={onClose}>Start</Button>
          ) : (
            <Button icon={ArrowRight} onClick={() => setIndex(index + 1)}>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function Guide({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open || typeof document === 'undefined') return null
  return createPortal(<GuidePanel onClose={onClose} />, document.body)
}
