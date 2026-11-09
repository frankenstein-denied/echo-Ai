'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { Check } from 'lucide-react'
import { saveLastAutoSync, syncWeatherLocation } from '@/lib/echo/weather-location'
import {
  finalLine,
  nextStep,
  OPEN_PERMISSION_SETUP_EVENT,
  readPermissionSetupDone,
  savePermissionSetupDone,
  SETUP_STEPS,
  shouldShowSetup,
  STEP_COPY,
  stepStatus,
  type AskStep,
  type SetupStep,
} from '@/lib/echo/permission-setup'
import {
  getNativePermissions,
  openNativeAppSettings,
  openOverlaySettings,
  requestNativeLocation,
  requestNativeMicrophone,
  requestNativeNotificationPermission,
  type NativePermissions,
} from '@/lib/native/echo-bridge'
import { Button } from './ui'

/** Asks Android for one permission. The overlay has no pop-up: it opens a settings page and reports nothing. */
async function requestStep(step: AskStep): Promise<boolean | null> {
  try {
    if (step === 'notifications') return await requestNativeNotificationPermission()
    if (step === 'microphone') return await requestNativeMicrophone()
    if (step === 'location') return await requestNativeLocation()
    await openOverlaySettings()
    return null
  } catch {
    return false
  }
}

/**
 * Mounted only in the full app (not floating Echo). Shows the welcome steps once on a phone after onboarding, and again
 * whenever Settings fires OPEN_PERMISSION_SETUP_EVENT. onHoldChange(true) while the steps are showing or still being
 * worked out, so the shell can hold other prompts back.
 */
export function PermissionSetup({
  uid,
  onboarded,
  embed,
  paused,
  onHoldChange,
}: {
  uid: string
  onboarded: boolean
  embed: boolean
  paused: boolean
  onHoldChange: (hold: boolean) => void
}) {
  const [perms, setPerms] = useState<NativePermissions | null>(null)
  const [checked, setChecked] = useState(false)
  const [open, setOpen] = useState(false)
  const [skipped, setSkipped] = useState<SetupStep[]>([])
  // Steps whose request came back without a grant. canAsk* is only a guess, so these offer settings instead of looping.
  const [failed, setFailed] = useState<AskStep[]>([])
  const [busy, setBusy] = useState(false)
  const live = useRef(true)
  // perms.location as last seen while the sheet is open (null while it is closed), to catch a grant from either path.
  const prevLocation = useRef<boolean | null>(null)

  const refresh = useCallback(async () => {
    const p = await getNativePermissions().catch(() => null)
    // Keep the last answer: a passing bridge error must not hide the sheet mid-way.
    if (live.current && p) setPerms(p)
    return p
  }, [])

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  // First look: open once if anything is still to allow.
  useEffect(() => {
    const isNative = Capacitor.isNativePlatform()
    if (!isNative || embed || !onboarded) {
      setChecked(true)
      return
    }
    void refresh().then((p) => {
      if (!live.current) return
      if (shouldShowSetup({ isNative, embed, onboarded, done: readPermissionSetupDone(), perms: p })) {
        setOpen(true)
      }
      setChecked(true)
    })
  }, [embed, onboarded, refresh])

  // Settings' "Set up permissions" reopens the steps from the start.
  useEffect(() => {
    const reopen = () => {
      void refresh().then((p) => {
        if (!live.current || !p) return // web or an older APK: nothing to set up
        setSkipped([])
        setFailed([])
        setOpen(true)
      })
    }
    window.addEventListener(OPEN_PERMISSION_SETUP_EVENT, reopen)
    return () => window.removeEventListener(OPEN_PERMISSION_SETUP_EVENT, reopen)
  }, [refresh])

  // Coming back from Android's settings pages: read the permissions again. (@capacitor/app is not installed, so the
  // WebView's own visibilitychange and focus stand in for the App resume event.)
  useEffect(() => {
    if (!open) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const onFocus = () => void refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [open, refresh])

  useEffect(() => {
    onHoldChange(open || !checked)
  }, [open, checked, onHoldChange])

  // Weather follows the phone as soon as location is allowed, whatever the 6-hour wait of the automatic sync. This step
  // says location is for the weather, so allowing it also turns on a Weather connector that has no place yet.
  const onLocationGranted = useCallback(() => {
    saveLastAutoSync(Date.now())
    void syncWeatherLocation(uid, undefined, { fromSetup: true })
  }, [uid])

  // Runs once per grant, whether it came from the pop-up or from "Open settings". Location already on when the sheet
  // opened is not a new grant.
  const location = perms?.location ?? null
  useEffect(() => {
    if (!open) {
      prevLocation.current = null
      return
    }
    if (prevLocation.current === false && location === true) onLocationGranted()
    prevLocation.current = location
  }, [open, location, onLocationGranted])

  const allow = async (step: AskStep) => {
    setBusy(true)
    const granted = await requestStep(step)
    const p = await refresh()
    if (!live.current) return
    setBusy(false)
    if (granted === false && !(p && stepStatus(step, p) === 'granted')) setFailed((f) => (f.includes(step) ? f : [...f, step]))
  }

  const finish = () => {
    savePermissionSetupDone()
    setOpen(false)
  }

  if (!open || paused || !perms || typeof document === 'undefined') return null
  const step = nextStep(perms, skipped)
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Set up Echo" className="fixed inset-0 z-[60] flex flex-col bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div aria-hidden="true" className="flex h-14 shrink-0 items-center justify-center gap-1.5 px-4">
        {SETUP_STEPS.map((s) => (
          <span key={s} className={`h-1.5 rounded-full transition-all ${s === step ? 'w-5 bg-primary' : stepStatus(s, perms) === 'granted' ? 'w-1.5 bg-primary' : 'w-1.5 bg-border-strong'}`} />
        ))}
      </div>
      <div className="flex min-h-0 flex-1 overflow-y-auto px-4 py-2">
        <div key={step} className="animate-in m-auto w-full max-w-md py-2">
          {step === 'done' ? (
            <div className="grid justify-items-center gap-4 text-center">
              <span className="grid size-16 place-items-center rounded-full bg-primary-soft text-primary">
                <Check size={32} aria-hidden="true" />
              </span>
              <h2 className="text-2xl font-semibold text-foreground">{finalLine(perms.overlay === true)}</h2>
            </div>
          ) : (
            <div>
              <h2 className="text-2xl font-semibold text-foreground">{STEP_COPY[step].title}</h2>
              <p className="mt-2 text-base leading-6 text-muted-foreground">{STEP_COPY[step].why}</p>
            </div>
          )}
        </div>
      </div>
      <div className="mx-auto grid w-full max-w-md shrink-0 gap-2 p-4">
        {step === 'done' ? (
          <Button onClick={finish}>Done</Button>
        ) : (
          <StepButtons
            blocked={stepStatus(step, perms) === 'blocked'}
            failed={failed.includes(step)}
            busy={busy}
            onAllow={() => void allow(step)}
            onSettings={() => void openNativeAppSettings()}
            onSkip={() => setSkipped((s) => [...s, step])}
          />
        )}
      </div>
    </div>,
    document.body,
  )
}

/**
 * A step that is blocked offers settings first but keeps "Try again", since canAsk* can be wrong. A step whose request
 * already came back without a grant offers only settings, so the pop-up never loops.
 */
function StepButtons({ blocked, failed, busy, onAllow, onSettings, onSkip }: { blocked: boolean; failed: boolean; busy: boolean; onAllow: () => void; onSettings: () => void; onSkip: () => void }) {
  return (
    <>
      {failed || blocked ? (
        <Button onClick={onSettings}>Open settings</Button>
      ) : (
        <Button loading={busy} onClick={onAllow}>
          Allow
        </Button>
      )}
      {blocked && !failed && (
        <Button variant="secondary" loading={busy} onClick={onAllow}>
          Try again
        </Button>
      )}
      <Button variant="ghost" disabled={busy} onClick={onSkip}>
        Not now
      </Button>
    </>
  )
}
