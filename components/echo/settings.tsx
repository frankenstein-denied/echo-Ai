'use client'

import { useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { LogOut, Play } from 'lucide-react'
import { updateCalorieSettings, watchCalorieSettings, type UserProfile } from '@/lib/firestore'
import { LIMITS, parseCalorieGoal } from '@/lib/echo/health-helpers'
import { listVoices, speak, VoiceError, type VoiceOption } from '@/lib/echo/voice-client'
import { DEFAULT_VOICE_PREFS, loadVoicePrefs, saveVoicePrefs, type VoicePrefs } from '@/lib/echo/voice-prefs'
import { Alert, Button, Card, Input, PageHeader, Select, Switch } from './ui'
import { InstallAppButton } from './pwa'

export function SettingsView({ user, profile, signOut }: { user: User; profile: UserProfile; signOut: () => void | Promise<void> }) {
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
            {/* Renders nothing when the app is installed or the browser cannot install it. */}
            <InstallAppButton className="max-sm:w-full max-lg:*:h-11 max-sm:[&>button:first-child]:flex-1 max-sm:[&>button:first-child]:justify-center" />
          </div>
        </Card>
      </div>
    </div>
  )
}
