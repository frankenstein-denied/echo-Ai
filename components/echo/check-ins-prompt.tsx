'use client'

import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { watchCheckInSettings } from '@/lib/firestore'
import { shouldPromptOverlay, shouldShellAskNotifications } from '@/lib/echo/check-ins'
import { readPermissionSetupDone } from '@/lib/echo/permission-setup'
import { getCheckInStatus, getNativePermissions, openOverlaySettings, requestNativeNotificationPermission, setCheckInSettings } from '@/lib/native/echo-bridge'
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
 * asks once for the overlay permission unless the welcome permission steps already did. paused holds the question back while something else is on screen.
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
        // Check-ins fall back to a notification, and Android 13+ posts nothing without this. Android asks at most twice,
        // so on an APK with the welcome steps (it reports permissions) only those steps ask.
        if (onboarded && s.enabled) {
          void getNativePermissions()
            .then((perms) => {
              if (live && shouldShellAskNotifications({ onboarded, enabled: s.enabled, hasPermissionBridge: perms !== null })) return requestNativeNotificationPermission()
            })
            .catch(() => null)
        }
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

  // The welcome permission steps own this question once they are done (an older APK never runs them).
  if (!open || paused || readPermissionSetupDone()) return null
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
