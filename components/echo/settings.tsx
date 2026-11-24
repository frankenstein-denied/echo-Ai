'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { Bell, ChevronDown, ChevronRight, Download, Flame, LogOut, Mic, Pin, Play, ShieldCheck, type LucideIcon } from 'lucide-react'
import { checkInSummary } from '@/lib/echo/page-lines'
import { FOCUS_RING } from '@/lib/echo/ui-classes'
import { updateCalorieSettings, updateCheckInSettings, updateLanguage, watchCalorieSettings, watchCheckInSettings, watchLanguage, type UserProfile } from '@/lib/firestore'
import { bubbleStatusLine, gapIsUnsaved, gapLabel, gapParts, parseGap, resolveCheckInSettings, sleepProblem, wakeStatusLines, type CheckInSettings, type GapUnit } from '@/lib/echo/check-ins'
import { LIMITS, parseCalorieGoal } from '@/lib/echo/health-helpers'
import { languageCode, LANGUAGES, type LanguageCode } from '@/lib/echo/languages'
import { listVoices, speak, VoiceError, type VoiceOption } from '@/lib/echo/voice-client'
import { DEFAULT_VOICE_PREFS, loadVoicePrefs, saveVoicePrefs, type VoicePrefs } from '@/lib/echo/voice-prefs'
import { DEFAULT_SOUND_PREFS, loadSoundPrefs, playCue, saveSoundPrefs, type SoundPrefs } from '@/lib/echo/cues'
import { openPermissionSetup } from '@/lib/echo/permission-setup'
import { Alert, Button, Card, Input, PageHeader, Select, Switch } from './ui'
import { useOpenInstallGuide } from './guide'
import { Capacitor } from '@capacitor/core'
import {
  getCheckInStatus,
  getNativePermissions,
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

function LanguageField({ uid, initial }: { uid: string; initial: unknown }) {
  const [value, setValue] = useState<LanguageCode>(() => languageCode(initial))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useSavedNote()

  // The profile prop is read once at sign-in, so follow the stored value live.
  useEffect(() => watchLanguage(uid, setValue, () => {}), [uid])

  const change = async (next: LanguageCode) => {
    if (busy || next === value) return
    const prev = value
    setValue(next)
    setError('')
    setNote('')
    setBusy(true)
    try {
      await updateLanguage(uid, next)
      setNote('Saved.')
    } catch (e) {
      setValue(prev)
      setError(e instanceof Error ? e.message : 'Could not save your language.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 grid gap-2">
      <Select
        label="Echo's language"
        hint="Echo talks to you in this language. Menus stay in English."
        value={value}
        disabled={busy}
        onChange={(e) => void change(languageCode(e.target.value))}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </Select>
      {error && <Alert variant="danger">{error}</Alert>}
      {note && <p role="status" className="text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}

/** A titled group of short rows in one card ("Echo", "Phone"). */
function SettingsGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h2>
      <div className="divide-y divide-border rounded-xl border border-border bg-surface px-4">{children}</div>
    </section>
  )
}

/**
 * One settings row: icon, title and the current value. With `children` the row opens them underneath on tap (the
 * detailed controls); with `onClick` it runs an action; with `control` the control sits on the right instead.
 */
function SettingsRow({
  icon: Icon,
  color,
  title,
  value,
  valueClass = 'text-muted-foreground',
  open = false,
  onToggle,
  onClick,
  control,
  children,
}: {
  icon: LucideIcon
  color: string
  title: string
  value: ReactNode
  valueClass?: string
  open?: boolean
  onToggle?: () => void
  onClick?: () => void
  control?: ReactNode
  children?: ReactNode
}) {
  const panelId = useId()
  const head = (
    <>
      <Icon size={18} aria-hidden="true" className="shrink-0" style={{ color }} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className={`block truncate text-xs ${valueClass}`}>{value}</span>
      </span>
    </>
  )
  const rowClass = `flex min-h-14 w-full items-center gap-3 py-2 text-left ${FOCUS_RING} rounded-lg`
  return (
    <div>
      {control ? (
        <div className="flex min-h-14 items-center gap-3 py-2">
          {head}
          {control}
        </div>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={rowClass}>
          {head}
          <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId} className={rowClass}>
          {head}
          <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
      {children && (
        <div id={control ? undefined : panelId} hidden={!control && !open} className="pb-4">
          {children}
        </div>
      )}
    </div>
  )
}

type RowId = 'check-ins' | 'voice' | 'calories'

export function SettingsView({ user, profile, signOut }: { user: User; profile: UserProfile; signOut: () => void | Promise<void> }) {
  const [openRow, setOpenRow] = useState<RowId | null>(null)
  const toggleRow = (id: RowId) => setOpenRow((r) => (r === id ? null : id))
  const [language, setLanguage] = useState<LanguageCode>(() => languageCode(profile.language))
  useEffect(() => watchLanguage(user.uid, setLanguage, () => {}), [user.uid])
  const openInstallGuide = useOpenInstallGuide()
  const [prefs, setPrefs] = useState<VoicePrefs>(DEFAULT_VOICE_PREFS)
  const [sounds, setSounds] = useState<SoundPrefs>(DEFAULT_SOUND_PREFS)
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
  // False on an APK older than 1.14, which cannot run the permission steps.
  const [canSetUpPermissions, setCanSetUpPermissions] = useState(false)
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
    setSounds(loadSoundPrefs())
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
    getNativePermissions()
      .then((p) => {
        if (mounted.current) setCanSetUpPermissions(p !== null)
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

  const updateSounds = (enabled: boolean) => {
    setSounds({ enabled })
    saveSoundPrefs({ enabled })
    // Turning it on plays the chime once, so the user hears what they chose.
    if (enabled) playCue('saved', { force: true })
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

  const voiceLabel = options.find((v) => v.id === prefs.voice)?.label ?? prefs.voice
  const languageLabel = LANGUAGES.find((l) => l.code === language)?.label ?? 'English'
  const calorieValue = !calOn ? 'Off' : savedGoal ? `${savedGoal.toLocaleString('en-US')} kcal a day` : 'On · no daily goal'
  const initial = (name || email || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="animate-in mx-auto max-w-2xl">
      <PageHeader title="Settings" />
      <div className="grid gap-5">
        <Card
          className="flex items-center gap-3"
          style={{ background: 'linear-gradient(160deg, color-mix(in srgb, var(--color-primary) 14%, transparent), transparent 60%), var(--color-surface)', boxShadow: '0 0 24px -14px var(--color-primary)' }}
        >
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full text-base font-bold text-[#04201c]" style={{ background: 'linear-gradient(135deg, #2dd4bf, #3b82f6)' }}>
            {initial}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">{name || 'Your profile'}</h2>
            <p className="truncate text-sm text-muted-foreground">{email || '—'}</p>
          </div>
        </Card>

        <SettingsGroup label="Echo">
          {isNative && (
            <SettingsRow icon={Bell} color="var(--color-primary)" title="Check-ins" value={checkInSummary(checkIn)} open={openRow === 'check-ins'} onToggle={() => toggleRow('check-ins')}>
              <div className="divide-y divide-border">
                {row('Check-ins', 'The Echo bubble pops up short check-ins through the day.', <Switch checked={checkIn.enabled} onChange={(v) => void saveCheckIn({ enabled: v })} label="Check-ins" />)}
              </div>
              {checkIn.enabled && (
                <div className="mt-2 grid gap-3">
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
            </SettingsRow>
          )}

          <SettingsRow icon={Mic} color="#a78bfa" title="Voice and language" value={`${voiceLabel} · ${languageLabel}`} open={openRow === 'voice'} onToggle={() => toggleRow('voice')}>
            <LanguageField uid={user.uid} initial={profile.language} />
            <div className="mt-2 divide-y divide-border">
              {row('Enable voice', 'Show the Call button in the Diary.', <Switch checked={prefs.enabled} onChange={(v) => update({ enabled: v })} label="Enable voice" />)}
              {row('Speak typed replies aloud', 'Echo reads each reply to a typed message. Calls always use voice.', <Switch checked={prefs.autoSpeak} onChange={(v) => update({ autoSpeak: v })} label="Speak typed replies aloud" />)}
              {row('Sounds & vibration', 'A soft chime and a light tap when Echo replies, saves something or a goal moves forward. On this device.', <Switch checked={sounds.enabled} onChange={updateSounds} label="Sounds and vibration" />)}
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-3">
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
          </SettingsRow>

          <SettingsRow icon={Flame} color="#fbbf24" title="Calorie tracking" value={calorieValue} open={openRow === 'calories'} onToggle={() => toggleRow('calories')}>
            <div className="divide-y divide-border">
              {row('Track calories', 'Show the Calories card in Health. When off, Echo will not log meals.', <Switch checked={calOn} onChange={toggleCalories} label="Track calories" disabled={calBusy} />)}
            </div>
            {calOn && (
              <form
                className="mt-2 flex flex-wrap items-start gap-3"
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
          </SettingsRow>
        </SettingsGroup>

        {isNative && (
          <SettingsGroup label="Phone">
            <SettingsRow
              icon={Pin}
              color="#60a5fa"
              title="Pinned notification"
              value={pinned ? 'Reminders and goals in your bar' : 'Off'}
              control={<Switch checked={pinned} onChange={(v) => void togglePinned(v)} label="Pinned Echo notification" disabled={pinBusy} />}
            >
              {(pinDenied || pinError || (pinned && batteryOptimized)) && (
                <>
                  {pinDenied && <Alert variant="warning">Notifications are blocked for Echo. Allow them in your phone settings, then try again.</Alert>}
                  {pinError && <Alert variant="danger">Couldn&apos;t turn on the Echo notification. Please try again.</Alert>}
                  {pinned && batteryOptimized && batteryAdvice}
                </>
              )}
            </SettingsRow>
            {canSetUpPermissions && (
              <SettingsRow
                icon={ShieldCheck}
                color="#34d399"
                title="Permissions"
                value={notificationsAllowed && overlayAllowed ? 'Notifications, microphone, location, chathead' : 'Some are off · tap to set up'}
                valueClass={notificationsAllowed && overlayAllowed ? 'text-muted-foreground' : 'text-warning'}
                onClick={openPermissionSetup}
              />
            )}
          </SettingsGroup>
        )}

        <SettingsGroup label="App">
          <SettingsRow icon={Download} color="var(--color-primary)" title="Install Echo" value="Add Echo to your phone or computer" onClick={openInstallGuide} />
        </SettingsGroup>

        <button type="button" onClick={() => void signOut()} className={`mx-auto flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium text-danger hover:bg-danger-soft ${FOCUS_RING}`}>
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </div>
  )
}
