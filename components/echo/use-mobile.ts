'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { isTextEntry, keyboardInsets, MOBILE_QUERY } from '@/lib/echo/mobile'

function subscribe(cb: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** True below 1024 px (the tab bar / bottom sheet layout). False during SSR. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  )
}

/**
 * Keeps mobile layout CSS in sync with the device:
 * - `html[data-kb]` while a text field is focused on a mobile layout (hides the tab bar),
 * - `--kb` / `--vv-top`: on-screen keyboard height and visual-viewport pan, from `visualViewport`,
 *   so fixed surfaces (the Diary composer) stay above the keyboard.
 */
export function useMobileViewportSync() {
  useEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia(MOBILE_QUERY)
    const vv = window.visualViewport

    const syncFocus = () => {
      const on = mq.matches && isTextEntry(document.activeElement as HTMLElement | null)
      if (on) root.dataset.kb = ''
      else delete root.dataset.kb
    }
    const syncViewport = () => {
      const { top, bottom } = mq.matches && vv ? keyboardInsets({ layoutHeight: window.innerHeight, viewportHeight: vv.height, offsetTop: vv.offsetTop, scale: vv.scale }) : { top: 0, bottom: 0 }
      root.style.setProperty('--kb', `${bottom}px`)
      root.style.setProperty('--vv-top', `${top}px`)
    }
    // focusout fires before focus lands on the next element: check on the next frame.
    let raf = 0
    const onFocusChange = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        syncFocus()
        syncViewport()
      })
    }
    const onChange = () => {
      syncFocus()
      syncViewport()
    }

    document.addEventListener('focusin', onFocusChange)
    document.addEventListener('focusout', onFocusChange)
    vv?.addEventListener('resize', syncViewport)
    vv?.addEventListener('scroll', syncViewport)
    mq.addEventListener('change', onChange)
    onChange()
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('focusin', onFocusChange)
      document.removeEventListener('focusout', onFocusChange)
      vv?.removeEventListener('resize', syncViewport)
      vv?.removeEventListener('scroll', syncViewport)
      mq.removeEventListener('change', onChange)
      delete root.dataset.kb
      root.style.removeProperty('--kb')
      root.style.removeProperty('--vv-top')
    }
  }, [])
}

/** Marks `html[data-call]` while a voice call is active (hides the mobile tab bar). */
export function useCallFlag(active: boolean) {
  useEffect(() => {
    if (!active) return
    const root = document.documentElement
    root.dataset.call = ''
    return () => {
      delete root.dataset.call
    }
  }, [active])
}
