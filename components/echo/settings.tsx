'use client'

import { useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { Download, LogOut, Play } from 'lucide-react'
import { updateCalorieSettings, updateCheckInSettings, watchCalorieSettings, watchCheckInSettings, type UserProfile } from '@/lib/firestore'
import { bubbleStatusLine, gapIsUnsaved, gapLabel, gapParts, parseGap, resolveCheckInSettings, sleepProblem, wakeStatusLines, type CheckInSettings, type GapUnit } from '@/lib/echo/check-ins'
import { LIMITS, parseCalorieGoal } from '@/lib/echo/health-helpers'
import { listVoices, speak, VoiceError, type VoiceOption } from '@/lib/echo/voice-client'
import { DEFAULT_VOICE_PREFS, loadVoicePrefs, saveVoicePrefs, type VoicePrefs } from '@/lib/echo/voice-prefs'
import { Alert, Button, Card, Input, PageHeader, Select, Switch } from './ui'
import { useOpenInstallGuide } from './guide'
import { Capacitor } from '@capacitor/core'
import {
  getCheckInStatus,
  getNativeStatus,
  openNativeBatterySettings,
  openOverlaySettings,
  requestNativeNotificationPermission,
  setCheckInSettings,
  setNativePinned,
} from '@/lib/native/echo-bridge'

const SAVED_NOTE_MS = 4000

/** A note that clears itself a few seconds after it is set. */
function useSavedNote() {
  const [note, setNote] = useState('')
  useEffect(() => {
    if (!note) return
    const timer = setTimeout(() => setNote(''), SAVED_NOTE_MS)
    return () => clearTimeout(timer)
  }, [note])
  return [note, setNote] as const
}

function CheckInGapField({ minutes, onSave }: { minutes: number; onSave: (minutes: number) => Promise<boolean> }) {
  const [text, setText] = useState(() => String(gapParts(minutes).value))
  const [unit, setUnit] = useState<GapUnit>(() => gapParts(minutes).unit)
  const [error, setError] = useState('')
  const [shown, setShown] = useState(minutes)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useSavedNote()

  // A failed save or another device moved the gap. What the user typed for this same gap stays as typed.
  if (minutes !== shown) {
    setShown(minutes)
    if (parseGap(text, unit) !== minutes) {
      const parts = gapParts(minutes)
      setText(String(parts.value))
      setUnit(parts.unit)
      setError('')
    }
  }

  const plural = Number(text.trim()) === 1 ? '' : 's'

  const save = async () => {
    if (busy) return
    const next = parseGap(text, unit)
    setError(next === null ? 'Choose between 1 minute and 30 days.' : '')
    if (next === null || next === minutes) return
    setNote('')
    setBusy(true)
    const saved = await onSave(next)
    setBusy(false)
    if (saved) setNote(`Saved. Next check-in in about ${gapLabel(next)}.`)
  }

  return (
    <>
      <div className="grid grid-cols-2 items-end gap-3">
        <Input
          label="Message me every"
          inputMode="numeric"
          value={text}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setText(e.target.value)
            setError('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
          }}
        />
        <Select
          aria-label="Check-in gap unit"
          value={unit}
          onChange={(e) => {
            setUnit(e.target.value as GapUnit)
            setError('')
          }}
        >
          <option value="minutes">{`Minute${plural}`}</option>
          <option value="hours">{`Hour${plural}`}</option>
          <option value="days">{`Day${plural}`}</option>
        </Select>
      </div>
      <Button variant="secondary" onClick={() => void save()} loading={busy} disabled={!gapIsUnsaved(text, unit, minutes)} className="justify-self-start max-sm:w-full">
        Save
      </Button>
      {error && <Alert variant="danger">{error}</Alert>}
      {note && <p role="status" className="text-xs text-muted-foreground">{note}</p>}
    </>
  )
}

function CheckInSleepField({ start, end, onSave }: { start: string; end: string; onSave: (start: string, end: string) => Promise<boolean> }) {
  // The inputs can hold a pair that is not saved yet (start equal to end).
  const [draft, setDraft] = useState({ start, end })
  const [shown, setShown] = useState({ start, end })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useSavedNote()

  // A failed save or another device moved the times.
  if (start !== shown.start || end !== shown.end) {
    setShown({ start, end })
    setDraft({ start, end })
    setError('')
  }

  const change = (next: { start: string; end: string }) => {
    setDraft(next)
    setError('')
  }

  const save = async () => {
    if (busy) return
    const problem = sleepProblem(draft.start, draft.end)
    setError(problem)
    if (problem) return
    setNote('')
    setBusy(true)
    const saved = await onSave(draft.start, draft.end)
    setBusy(false)
    if (saved) setNote('Saved.')
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Sleep starts" type="time" value={draft.start} onChange={(e) => change({ ...draft, start: e.target.value })} />
        <Input label="Sleep ends" type="time" value={draft.end} onChange={(e) => change({ ...draft, end: e.target.value })} />
      </div>
      <Button variant="secondary" onClick={() => void save()} loading={busy} disabled={draft.start === start && draft.end === end} className="justify-self-start max-sm:w-full">
        Save sleep time
      </Button>
      {error && <Alert variant="danger">{error}</Alert>}
      {note && <p role="status" className="text-xs text-muted-foreground">{note}</p>}
    </>
  )
}

export function SettingsView({ user, profile, signOut }: { user: User; profile: UserProfile; signOut: () => void | Promise<void> }) {
  const openInstallGuide = useOpenInstallGuide()
  const [prefs, setPrefs] = useState<VoicePrefs>(DEFAULT_VOICE_PREFS)
  const [voices, setVoices] = useState<VoiceOption[]>([])
  const [voicesError, setVoicesError] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewMsg, setPreviewMsg] = useState<string | null>(null)
  const [calOn, setCalOn] = useState(profile.caloriesEnabled !== false)
  const [goalText, setGoalText] = useState(profile.calorieGoal ? String(profile.calorieGoal) : '')
  const [savedGoal, setSavedGoal] = useState<number | undefined>(profile.calorieGoal)
  const [calError, setCalError] = useState('')
  const [goalError, setGoalError] = useState('')
  const [calBusy, setCalBusy] = useState(false)
  const [isNative, setIsNative] = useState(false)
  const [pinned, setPinnedState] = useState(false)
  const [pinBusy, setPinBusy] = useState(false)
  const [pinDenied, setPinDenied] = useState(false)
  const [pinError, setPinError] = useState(false)
  const [batteryOptimized, setBatteryOptimized] = useState(false)
  const [checkIn, setCheckIn] = useState<CheckInSettings>(() => resolveCheckInSettings(profile))
  const [checkInError, setCheckInError] = useState('')
  const [overlayAllowed, setOverlayAllowed] = useState(true)
  const [bubbleLine, setBubbleLine] = useState<string | null>(null)
  const [wakeLines, setWakeLines] = useState<string[]>([])
  const [notificationsAllowed, setNotificationsAllowed] = useState(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const seq = useRef(0)
  const mounted = useRef(true)
  const seeded = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      seq.current++
    }
  }, [])

  useEffect(() => {
    setPrefs(loadVoicePrefs())
  }, [])

  const readCheckInStatus = () => {
    getCheckInStatus()
      .then((s) => {
        if (!s || !mounted.current) return
        setOverlayAllowed(s.overlayAllowed)
        setBubbleLine(bubbleStatusLine(s))
        setWakeLines(wakeStatusLines(s))
      })
      .catch(() => null)
  }

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    setIsNative(true)
    getNativeStatus()
      .then((s) => {
        if (!s || !mounted.current) return
        setPinnedState(s.pinned && s.notificationsAllowed)
        setNotificationsAllowed(s.notificationsAllowed)
        setBatteryOptimized(s.batteryOptimized)
      })
      .catch(() => null)

    readCheckInStatus()

    // Re-check after returning from the system battery / notification / overlay settings.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      readCheckInStatus()
      getNativeStatus()
        .then((s) => {
          if (!s || !mounted.current) return
          setPinnedState(s.pinned && s.notificationsAllowed)
          setNotificationsAllowed(s.notificationsAllowed)
          setBatteryOptimized(s.batteryOptimized)
        })
        .catch(() => null)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  const togglePinned = async (on: boolean) => {
    setPinBusy(true)
    setPinDenied(false)
    setPinError(false)
    try {
      if (!on) {
        await setNativePinned(false)
        if (mounted.current) setPinnedState(false)
        return
      }
      const granted = await requestNativeNotificationPermission()
      if (!granted) {
        if (mounted.current) setPinDenied(true)
        return
      }
      await setNativePinned(true)
      if (mounted.current) setPinnedState(true)
      const s = await getNativeStatus()
      if (s && mounted.current) {
        setNotificationsAllowed(s.notificationsAllowed)
        setBatteryOptimized(s.batteryOptimized)
      }
    } catch {
      if (mounted.current) setPinError(true)
    } finally {
      if (mounted.current) setPinBusy(false)
    }
  }

  useEffect(() => {
    let live = true
    listVoices(user)
      .then((r) => {
        if (!live) return
        setVoices(r.voices)
      })
      .catch(() => live && setVoicesError(true))
    return () => {
      live = false
      audioRef.current?.pause()
    }
  }, [user])

  // Follow the live profile so the toggle and goal reflect the stored values.
  useEffect(
    () =>
      watchCalorieSettings(
        user.uid,
        (c) => {
          setCalOn(c.enabled)
          setSavedGoal(c.goal)
          if (!seeded.current) setGoalText(c.goal ? String(c.goal) : '')
          seeded.current = true
        },
        () => {},
      ),
    [user.uid],
  )

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    return watchCheckInSettings(user.uid, setCheckIn, () => {})
  }, [user.uid])

  // A save offline only resolves once back online, and the watcher in CheckInsPrompt still tells native. True once saved.
  const saveCheckIn = async (patch: Partial<CheckInSettings>): Promise<boolean> => {
    const prev = checkIn
    const next = { ...checkIn, ...patch }
    setCheckInError('')
    setCheckIn(next)
    try {
      await updateCheckInSettings(user.uid, patch)
      await setCheckInSettings(next)
      readCheckInStatus()
      return true
    } catch (e) {
      setCheckIn(prev)
      setCheckInError(e instanceof Error ? e.message : 'Could not save your check-in settings.')
      return false
    }
  }

  const saveCalories = async (patch: { caloriesEnabled?: boolean; calorieGoal?: number | null }, onFail?: () => void) => {
    setCalError('')
    setCalBusy(true)
    try {
      await updateCalorieSettings(user.uid, patch)
    } catch (e) {
      onFail?.()
      setCalError(e instanceof Error ? e.message : 'Could not save your calorie settings.')
    } finally {
      setCalBusy(false)
    }
  }

  const toggleCalories = (v: boolean) => {
    const prev = calOn
    setCalOn(v)
    void saveCalories({ caloriesEnabled: v }, () => setCalOn(prev))
  }

  const saveGoal = () => {
    const parsed = parseCalorieGoal(goalText)
    if (parsed === null) {
      setGoalError(`Enter a whole number from ${LIMITS.goalMin} to ${LIMITS.goalMax}, or leave it empty.`)
      return
    }
    setGoalError('')
    if (parsed === savedGoal) return
    void saveCalories({ calorieGoal: parsed ?? null })
  }

  const update = (patch: Partial<VoicePrefs>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    saveVoicePrefs(next)
  }

  const preview = async () => {
    setPreviewMsg(null)
    setPreviewing(true)
    try {
      audioRef.current?.pause()
      const my = ++seq.current
      const a = await speak(user, "Hi, I'm Echo.", prefs.voice)
      if (!mounted.current || my !== seq.current) {
        URL.revokeObjectURL(a.src)
        return
      }
      audioRef.current = a
      await a.play()
    } catch (e) {
      if (!mounted.current) return
      setPreviewMsg(
        e instanceof VoiceError && e.kind === 'quota'
          ? "Echo's voice reached today's free limit."
          : e instanceof DOMException && e.name === 'NotAllowedError'
            ? 'Your browser blocked playback. Try again.'
            : 'Could not play the preview right now.',
      )
    } finally {
      if (mounted.current) setPreviewing(false)
    }
  }

  const name = profile.preferredName || user.displayName || ''
  const email = user.email || profile.email || ''
  const options = voices.some((v) => v.id === prefs.voice) || !voices.length ? voices : [{ id: prefs.voice, label: prefs.voice }, ...voices]

  const row = (title: string, hint: string, control: React.ReactNode) => (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {control}
    </div>
  )

  const batteryAdvice = (
    <div className="mt-3">
      <Alert variant="warning">
        <p>Some phones stop apps running in the background to save battery, which can stop Echo's check-ins.</p>
        <p className="mt-1">If check-ins stop arriving, allow Echo to auto-start or run in the background in your phone&apos;s settings, set its battery use to unrestricted, and lock Echo in your recent apps if your phone offers it.</p>
        {batteryOptimized && (
          <Button variant="secondary" className="mt-2" onClick={() => void openNativeBatterySettings().catch(() => null)}>
            Turn off battery optimization
          </Button>
        )}
      </Alert>
    </div>
  )

  return (
    <div className="animate-in mx-auto max-w-2xl">
      <PageHeader title="Settings" description="Your profile, voice and account." />
      <div className="grid gap-5">
        <Card>
          <h2 className="text-base font-semibold text-foreground">Profile</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="text-foreground">{name || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="truncate text-foreground">{email || '—'}</dd>
            </div>
          </dl>
        </Card>

        {isNative && (
          <Card>
            <h2 className="text-base font-semibold text-foreground">Phone notification</h2>
            <div className="mt-1 divide-y divide-border">
              {row('Pinned Echo notification', 'Keep Reminders and Goals in your notification bar.', <Switch checked={pinned} onChange={(v) => void togglePinned(v)} label="Pinned Echo notification" disabled={pinBusy} />)}
            </div>
            {pinDenied && (
              <div className="mt-3">
                <Alert variant="warning">Notifications are blocked for Echo. Allow them in your phone settings, then try again.</Alert>
              </div>
            )}
            {pinError && (
              <div className="mt-3">
                <Alert variant="danger">Couldn&apos;t turn on the Echo notification. Please try again.</Alert>
              </div>
            )}
            {pinned && batteryOptimized && batteryAdvice}
          </Card>
        )}

        {isNative && (
          <Card>
            <h2 className="text-base font-semibold text-foreground">Echo check-ins</h2>
            <div className="mt-1 divide-y divide-border">
              {row('Check-ins', 'The Echo bubble pops up short check-ins through the day.', <Switch checked={checkIn.enabled} onChange={(v) => void saveCheckIn({ enabled: v })} label="Check-ins" />)}
            </div>
            {checkIn.enabled && (
              <div className="mt-4 grid gap-3">
                <CheckInGapField minutes={checkIn.everyMinutes} onSave={(everyMinutes) => saveCheckIn({ everyMinutes })} />
                <CheckInSleepField start={checkIn.sleepStart} end={checkIn.sleepEnd} onSave={(sleepStart, sleepEnd) => saveCheckIn({ sleepStart, sleepEnd })} />
              </div>
            )}
            {checkInError && (
              <div className="mt-3">
                <Alert variant="danger">{checkInError}</Alert>
              </div>
            )}
            {!overlayAllowed && (
              <div className="mt-3">
                <Alert variant="warning">
                  <p>Echo can&apos;t pop up yet, so check-ins arrive as notifications. Allow &quot;Display over other apps&quot; to see the bubble.</p>
                  <Button variant="secondary" className="mt-2" onClick={() => void openOverlaySettings()}>
                    Open Android settings
                  </Button>
                </Alert>
              </div>
            )}
            {checkIn.enabled && !notificationsAllowed && (
              <div className="mt-3">
                <Alert variant="warning">Notifications are blocked for Echo, so check-ins can&apos;t reach you while the phone is locked or the bubble is gone. Allow them in Android settings.</Alert>
              </div>
            )}
            {checkIn.enabled && bubbleLine && <p className="mt-3 text-xs text-muted-foreground">{bubbleLine}</p>}
            {checkIn.enabled && wakeLines.map((line) => <p key={line} className="mt-1 text-xs text-muted-foreground">{line}</p>)}
            {checkIn.enabled && batteryAdvice}
          </Card>
        )}

        <Card>
          <h2 className="text-base font-semibold text-foreground">Voice</h2>
          <div className="mt-1 divide-y divide-border">
            {row('Enable voice', 'Show the Call button in the Diary.', <Switch checked={prefs.enabled} onChange={(v) => update({ enabled: v })} label="Enable voice" />)}
            {row('Speak typed replies aloud', 'Echo reads each reply to a typed message. Calls always use voice.', <Switch checked={prefs.autoSpeak} onChange={(v) => update({ autoSpeak: v })} label="Speak typed replies aloud" />)}
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-40 max-sm:w-full">
              <Select label="Voice (calls and spoken replies)" value={prefs.voice} onChange={(e) => update({ voice: e.target.value })} disabled={voicesError && !voices.length}>
                {options.length ? options.map((v) => <option key={v.id} value={v.id}>{v.label}</option>) : <option value={prefs.voice}>{prefs.voice}</option>}
              </Select>
            </div>
            <Button variant="secondary" icon={Play} onClick={() => void preview()} loading={previewing} className="max-sm:w-full">
              {previewing ? 'Loading...' : 'Preview'}
            </Button>
          </div>
          {voicesError && (
            <div className="mt-3">
              <Alert variant="warning">Could not load the voice list. Using your saved voice.</Alert>
            </div>
          )}
          {previewMsg && (
            <div className="mt-3">
              <Alert variant="danger">{previewMsg}</Alert>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-foreground">Calorie tracking</h2>
          <div className="mt-1 divide-y divide-border">
            {row('Track calories', 'Show the Calories card in Health. When off, Echo will not log meals.', <Switch checked={calOn} onChange={toggleCalories} label="Track calories" disabled={calBusy} />)}
          </div>
          {calOn && (
            <form
              className="mt-4 flex flex-wrap items-start gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                saveGoal()
              }}
            >
              <div className="min-w-40 max-sm:w-full">
                <Input
                  label="Daily goal (kcal)"
                  type="number"
                  inputMode="numeric"
                  min={LIMITS.goalMin}
                  max={LIMITS.goalMax}
                  value={goalText}
                  placeholder="2000"
                  hint="Optional. Shown as progress on the Health page."
                  error={goalError || undefined}
                  onChange={(e) => setGoalText(e.target.value)}
                />
              </div>
              <Button type="submit" variant="secondary" loading={calBusy} className="mt-[1.625rem] max-sm:mt-0 max-sm:w-full max-lg:h-11">
                Save goal
              </Button>
            </form>
          )}
          {calError && (
            <div className="mt-3">
              <Alert variant="danger">{calError}</Alert>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-foreground">Account</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button variant="secondary" icon={LogOut} onClick={() => void signOut()} className="max-sm:w-full">
              Sign out
            </Button>
            <Button variant="secondary" icon={Download} onClick={openInstallGuide} className="max-sm:w-full">
              Install Echo
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
