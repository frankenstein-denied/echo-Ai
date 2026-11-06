'use client'

import { useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { Download, LogOut, Play } from 'lucide-react'
import { updateCalorieSettings, updateCheckInSettings, watchCalorieSettings, watchCheckInSettings, type UserProfile } from '@/lib/firestore'
import { bubbleStatusLine, gapParts, parseGap, resolveCheckInSettings, type CheckInSettings, type GapUnit } from '@/lib/echo/check-ins'
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

function CheckInGapField({ minutes, onSave }: { minutes: number; onSave: (minutes: number) => void }) {
  const [text, setText] = useState(() => String(gapParts(minutes).value))
  const [unit, setUnit] = useState<GapUnit>(() => gapParts(minutes).unit)
  const [error, setError] = useState('')
  const [shown, setShown] = useState(minutes)

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

  const commit = (raw: string, u: GapUnit) => {
    const next = parseGap(raw, u)
    setError(next === null ? 'Choose between 1 minute and 30 days.' : '')
    if (next !== null && next !== minutes) onSave(next)
  }

  return (
    <>
      <div className="grid grid-cols-2 items-end gap-3">
        <Input
          label="Message me every"
          inputMode="numeric"
          value={text}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => commit(text, unit)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
        <Select
          aria-label="Check-in gap unit"
          value={unit}
          onChange={(e) => {
            const u = e.target.value as GapUnit
            setUnit(u)
            commit(text, u)
          }}
        >
          <option value="minutes">{`Minute${plural}`}</option>
          <option value="hours">{`Hour${plural}`}</option>
          <option value="days">{`Day${plural}`}</option>
        </Select>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
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
  // The time inputs can hold a pair that is not saved yet (start equal to end).
  const [sleep, setSleep] = useState({ start: checkIn.sleepStart, end: checkIn.sleepEnd })
  const [sleepError, setSleepError] = useState('')
  const [checkInError, setCheckInError] = useState('')
  const [overlayAllowed, setOverlayAllowed] = useState(true)
  const [bubbleLine, setBubbleLine] = useState<string | null>(null)
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

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    setIsNative(true)
    getNativeStatus()
      .then((s) => {
        if (!s || !mounted.current) return
        setPinnedState(s.pinned && s.notificationsAllowed)
        setBatteryOptimized(s.batteryOptimized)
      })
      .catch(() => null)

    const readCheckInStatus = () => {
      getCheckInStatus()
        .then((s) => {
          if (!s || !mounted.current) return
          setOverlayAllowed(s.overlayAllowed)
          setBubbleLine(bubbleStatusLine(s))
        })
        .catch(() => null)
    }
    readCheckInStatus()

    // Re-check after returning from the system battery / notification / overlay settings.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      readCheckInStatus()
      getNativeStatus()
        .then((s) => {
          if (!s || !mounted.current) return
          setPinnedState(s.pinned && s.notificationsAllowed)
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
      if (s && mounted.current) setBatteryOptimized(s.batteryOptimized)
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

  const showCheckIn = (s: CheckInSettings) => {
    setCheckIn(s)
    setSleep({ start: s.sleepStart, end: s.sleepEnd })
    setSleepError('')
  }

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    return watchCheckInSettings(user.uid, showCheckIn, () => {})
  }, [user.uid])

  // No busy state: a save offline only resolves once back online, and the watcher in CheckInsPrompt still tells native.
  const saveCheckIn = async (patch: Partial<CheckInSettings>) => {
    const prev = checkIn
    const next = { ...checkIn, ...patch }
    setCheckInError('')
    showCheckIn(next)
    try {
      await updateCheckInSettings(user.uid, patch)
      await setCheckInSettings(next)
    } catch (e) {
      showCheckIn(prev)
      setCheckInError(e instanceof Error ? e.message : 'Could not save your check-in settings.')
    }
  }

  const changeSleep = (start: string, end: string) => {
    setSleep({ start, end })
    if (!start || !end) return setSleepError('Enter both times.')
    if (start === end) return setSleepError('Sleep start and end must be different.')
    setSleepError('')
    void saveCheckIn({ sleepStart: start, sleepEnd: end })
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
        <p>TECNO/HiOS may close Echo in the background.</p>
        <p className="mt-1">Allow Auto-start for Echo in Phone Master, and lock Echo in your recent apps.</p>
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
                <CheckInGapField minutes={checkIn.everyMinutes} onSave={(everyMinutes) => void saveCheckIn({ everyMinutes })} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Sleep starts" type="time" value={sleep.start} onChange={(e) => changeSleep(e.target.value, sleep.end)} />
                  <Input label="Sleep ends" type="time" value={sleep.end} onChange={(e) => changeSleep(sleep.start, e.target.value)} />
                </div>
                {sleepError && <Alert variant="danger">{sleepError}</Alert>}
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
            {checkIn.enabled && bubbleLine && <p className="mt-3 text-xs text-muted-foreground">{bubbleLine}</p>}
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
