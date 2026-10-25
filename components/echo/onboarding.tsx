'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { auth } from '@/lib/firebase'
import { completeOnboarding, type OnboardingAnswers, type UserProfile } from '@/lib/firestore'
import { Alert, Button, Card, EchoMark, Input, Select, Switch } from './ui'

const QUESTIONS = [
  'What should I call you?',
  'What matters most to you right now?',
  'What are your top goals for the next year?',
  'Who are the most important people in your life?',
  'How do you want me to talk to you?',
  'Daily check-in time',
]
const TONES = ['Gentle coach', 'Direct', 'Cheerful']

const list = (v: string) =>
  v
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

export function Onboarding({ profile, onDone }: { profile: UserProfile; onDone: (a: OnboardingAnswers) => void }) {
  const { user } = useAuth()
  const emailPrefix = profile.email?.split('@')[0]
  const displayName = auth.currentUser?.displayName
  const [step, setStep] = useState(0)
  const [name, setName] = useState(!profile.preferredName || profile.preferredName === emailPrefix ? displayName || profile.preferredName : profile.preferredName)
  const [priorities, setPriorities] = useState(profile.priorities.join(', '))
  const [goals, setGoals] = useState(profile.yearGoals.join(', '))
  const [people, setPeople] = useState(profile.importantPeople.join(', '))
  const [tone, setTone] = useState(profile.tone)
  const [time, setTime] = useState(profile.checkInTime)
  const [reminders, setReminders] = useState(profile.remindersEnabled)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<OnboardingAnswers | null>(null)
  const [error, setError] = useState('')

  const finish = async () => {
    if (!user) return
    const answers: OnboardingAnswers = {
      preferredName: name.trim(),
      priorities: list(priorities),
      yearGoals: list(goals),
      importantPeople: list(people),
      tone,
      checkInTime: time || '20:30',
      remindersEnabled: reminders,
    }
    setSaving(true)
    setError('')
    try {
      await completeOnboarding(user.uid, answers)
      setSaved(answers)
      setStep(6)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your answers. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const done = step === 6 && saved

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-xl">
        {done ? (
          <div className="flex flex-col items-center text-center">
            <EchoMark />
            <p className="mt-8 text-sm text-muted-foreground">Nice to meet you, {saved.preferredName || 'friend'}.</p>
            <h1 className="mt-1 text-3xl font-semibold text-foreground">Meet your companion</h1>
            <p className="mt-3 text-sm text-muted-foreground">I&apos;m here to help you notice what matters and remember the rest.</p>
            <div className="mt-8">
              <Button onClick={() => onDone(saved)}>
                Enter Echo
                <ChevronRight size={16} aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : (
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold leading-8 text-foreground">Let&apos;s make Echo yours</h1>
                <p className="text-sm text-muted-foreground">A few questions to get to know you.</p>
              </div>
              <span className="shrink-0 text-sm text-muted-foreground">Step {step + 1} of 6</span>
            </div>
            <div
              role="progressbar"
              aria-label="Onboarding progress"
              aria-valuemin={1}
              aria-valuemax={6}
              aria-valuenow={step + 1}
              className="mt-5 h-1.5 overflow-hidden rounded-full bg-surface-2"
            >
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((step + 1) / 6) * 100}%` }} />
            </div>
            <div className="mt-6">
              {step === 0 ? (
                <Input key={0} autoFocus label={QUESTIONS[0]} value={name} onChange={(e) => setName(e.target.value)} placeholder="Peter" />
              ) : step === 1 ? (
                <Input key={1} autoFocus label={QUESTIONS[1]} hint="Separate with commas." value={priorities} onChange={(e) => setPriorities(e.target.value)} placeholder="Family, Career, Learning" />
              ) : step === 2 ? (
                <Input key={2} autoFocus label={QUESTIONS[2]} hint="Separate with commas." value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="Finish thesis, Run a half marathon" />
              ) : step === 3 ? (
                <Input key={3} autoFocus label={QUESTIONS[3]} hint="Separate with commas." value={people} onChange={(e) => setPeople(e.target.value)} placeholder="Mama, Alex, Sarah" />
              ) : step === 4 ? (
                <Select label={QUESTIONS[4]} value={tone} onChange={(e) => setTone(e.target.value)}>
                  {TONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              ) : (
                <div className="grid gap-4">
                  <Input label={QUESTIONS[5]} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-foreground">Remind me to check in</span>
                    <Switch checked={reminders} onChange={setReminders} label="Remind me to check in" />
                  </div>
                </div>
              )}
            </div>
            {error && (
              <div className="mt-4">
                <Alert variant="danger">{error}</Alert>
              </div>
            )}
            <div className="mt-8 flex justify-between">
              <Button variant="secondary" icon={ChevronLeft} disabled={!step || saving} onClick={() => setStep(step - 1)}>
                Back
              </Button>
              <Button loading={saving} onClick={() => (step === 5 ? void finish() : setStep(step + 1))}>
                {step === 5 ? (saving ? 'Saving...' : 'Finish') : 'Next'}
                {!saving && <ChevronRight size={16} aria-hidden="true" />}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </main>
  )
}
