'use client'

import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { watchCheckInSettings } from '@/lib/firestore'
import { shouldPromptOverlay } from '@/lib/echo/check-ins'
import { getCheckInStatus, openOverlaySettings, setCheckInSettings } from '@/lib/native/echo-bridge'
import { ConfirmDialog } from './ui'

const ASKED_KEY = 'echo.checkIns.overlayAsked'

function readAsked(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) === '1'
  } catch {
    return false
  }
}

function saveAsked() {
  try {
    localStorage.setItem(ASKED_KEY, '1')
  } catch {}
}

/**
 * Mounted only in the full app. Keeps native's check-in settings current, even if Settings is never opened, and
 * asks once for the overlay permission. paused holds the question back while something else is on screen.
 */
export function CheckInsPrompt({ uid, onboarded, paused }: { uid: string; onboarded: boolean; paused: boolean }) {
  const [open, setOpen] = useState(false)
  // Also kept here so a phone with storage blocked is not asked twice in one visit.
  const asked = useRef(false)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let live = true
    let last = ''
    const stop = watchCheckInSettings(
      uid,
      (s) => {
        // The watcher fires on any profile write; only a real change goes to native.
        const key = JSON.stringify(s)
        if (key === last) return
        last = key
        void setCheckInSettings(s)
        getCheckInStatus()
          .then((status) => {
            if (!live || !status) return // no status: an older APK, which has no check-ins to allow
            setOpen(shouldPromptOverlay({ isNative: true, embed: false, onboarded, enabled: s.enabled, overlayAllowed: status.overlayAllowed, asked: asked.current || readAsked() }))
          })
          .catch(() => null)
      },
      () => {},
    )
    return () => {
      live = false
      stop()
    }
  }, [uid, onboarded])

  const close = () => {
    asked.current = true
    saveAsked()
    setOpen(false)
  }

  if (!open || paused) return null
  return (
    <ConfirmDialog
      title="Let Echo check in"
      body={'Echo can pop up a short message over your other apps. Android needs you to allow "Display over other apps" once.'}
      confirmLabel="Allow"
      safe
      onCancel={close}
      onConfirm={() => {
        close()
        void openOverlaySettings()
      }}
    />
  )
}
