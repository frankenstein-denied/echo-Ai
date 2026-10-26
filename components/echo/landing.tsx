'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  AudioLines, BellRing, BookOpen, Brain, HeartPulse, Mic, Network, NotebookPen, Target, ShieldCheck, Lock, Stethoscope,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AuthCard, type AuthMode } from '@/components/echo/login'
import { Badge, Button, Card, EchoMark } from '@/components/echo/ui'
import { InstallAppButton } from '@/components/echo/pwa'

const features: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: BookOpen, title: 'Diary pages', text: 'Write or talk through your day and keep every entry in one place.' },
  { icon: Mic, title: 'Voice calls with Echo', text: 'Speak out loud and hear Echo answer back, hands free.' },
  { icon: Brain, title: 'Remembers for you', text: 'People, topics and goals you mention are linked in your 2nd Brain.' },
  { icon: Target, title: 'Goals & habits', text: 'Say what you want to work on and Echo tracks it with you.' },
  { icon: HeartPulse, title: 'Health check-ins', text: 'Log mood, sleep, water and energy in a sentence.' },
  { icon: BellRing, title: 'Reminders from conversation', text: 'Mention "call mum Friday" and it becomes a reminder.' },
]

const steps = [
  { title: 'Talk or type', text: 'Tell Echo about your day the way you would tell a friend.' },
  { title: 'Echo files it', text: 'Notes, reminders, goals and health logs are sorted for you.' },
  { title: 'Your 2nd Brain grows', text: 'Connections between people, topics and plans build up over time.' },
]

const privacy = [
  { icon: ShieldCheck, title: 'Private to your account', text: 'Only you can read your entries, memories and reminders.' },
  { icon: Lock, title: 'Stored under your account', text: 'Your entries are stored under your account only.' },
  { icon: Stethoscope, title: 'No diagnoses', text: 'Echo helps you track how you feel. It does not give medical advice.' },
]

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 border-t border-border py-16 max-md:py-10">
      <div className="mx-auto max-w-6xl px-6 max-md:px-4">
        <h2 id={`${id}-title`} className="text-2xl font-semibold leading-8 text-foreground">{title}</h2>
        {intro && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{intro}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  )
}

const nodes = [
  { x: 150, y: 90, r: 14, type: 'diary', label: 'Today' },
  { x: 60, y: 40, r: 10, type: 'person', label: 'Mum' },
  { x: 250, y: 40, r: 10, type: 'goal', label: 'Run 5k' },
  { x: 260, y: 140, r: 10, type: 'health', label: 'Sleep' },
  { x: 50, y: 140, r: 10, type: 'task', label: 'Call' },
  { x: 150, y: 175, r: 8, type: 'interest', label: 'Music' },
] as const

function BrainMock() {
  return (
    <svg viewBox="0 0 310 200" role="img" aria-label="Example 2nd Brain: today's diary linked to a person, a goal, a health log, a task and an interest" className="w-full">
      {nodes.slice(1).map(n => (
        <line key={n.label} x1={150} y1={90} x2={n.x} y2={n.y} stroke="var(--color-border-strong)" strokeWidth={1.5} />
      ))}
      {nodes.map(n => (
        <g key={n.label}>
          <circle cx={n.x} cy={n.y} r={n.r} fill={`var(--color-node-${n.type})`} />
          <text x={n.x} y={n.y + n.r + 13} textAnchor="middle" fontSize={11} fill="var(--color-muted-foreground)">{n.label}</text>
        </g>
      ))}
    </svg>
  )
}

function Preview() {
  return (
    <div aria-hidden="true" className="grid gap-4 md:grid-cols-5">
      <Card className="p-5 md:col-span-3">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground"><NotebookPen size={16} /> Diary, Thursday</div>
        <div className="grid gap-3 text-sm">
          <div className="ml-auto max-w-[85%] rounded-lg bg-primary-soft px-3 py-2 text-foreground">Long day. I need to call mum on Friday and I want to run 5k this month.</div>
          <div className="flex max-w-[85%] items-start gap-2">
            <EchoMark small />
            <div className="rounded-lg bg-surface-2 px-3 py-2 text-foreground">Got it. I set a reminder for Friday and added a goal. How are you feeling tonight?</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="warning">Reminder: Call mum, Fri 6 pm</Badge>
          <Badge type="goal">Goal: Run 5k</Badge>
        </div>
      </Card>
      <Card className="p-5 md:col-span-2">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Network size={16} /> 2nd Brain</div>
        <BrainMock />
      </Card>
    </div>
  )
}

export function Landing() {
  const [mode, setMode] = useState<AuthMode>('signin')

  const [focusTick, setFocusTick] = useState(0)
  const [announce, setAnnounce] = useState('')

  useEffect(() => {
    if (focusTick === 0) return
    document.getElementById('auth-card')?.querySelector<HTMLElement>('input')?.focus()
  }, [focusTick])

  const openAuth = (m: AuthMode) => {
    setMode(m)
    setAnnounce(m === 'signup' ? 'Create account form' : 'Sign in form')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById('auth-card')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
    setFocusTick(t => t + 1)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">Skip to content</a>
      <div role="status" aria-live="polite" className="sr-only">{announce}</div>
      <header className="sticky top-0 z-40 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6 max-md:h-14 max-md:px-4">
          <a href="#main" className="touch-hit flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground"><AudioLines size={16} /></span>
            <span className="text-base font-semibold">Echo</span>
          </a>
          <nav aria-label="Page sections" className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            {[['features', 'Features'], ['how-it-works', 'How it works'], ['privacy', 'Privacy']].map(([id, label]) => (
              <a key={id} href={`#${id}`} className="rounded-md hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => openAuth('signin')}>Sign in</Button>
            <Button size="sm" onClick={() => openAuth('signup')}>Get started</Button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="focus:outline-none">
        <section aria-labelledby="hero-title" className="mx-auto grid max-w-6xl gap-12 px-6 py-16 max-md:gap-8 max-md:px-4 max-md:py-8 lg:grid-cols-2 lg:items-center lg:py-24">
          <div className="landing-fade">
            <h1 id="hero-title" className="text-4xl font-semibold leading-tight text-foreground md:text-5xl">A diary that speaks back.</h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground">Talk or type about your day. Echo turns it into notes, reminders, goals and health check-ins, and keeps it all connected for you.</p>
            <div className="mt-8 flex flex-wrap gap-3 max-md:mt-6 max-md:grid max-md:grid-cols-2">
              <Button onClick={() => openAuth('signup')}>Get started</Button>
              <Button variant="secondary" onClick={() => openAuth('signin')}>Sign in</Button>
            </div>
            {/* Mobile only; renders nothing when installed or not installable. */}
            <InstallAppButton dismissible className="mt-4 lg:hidden max-lg:*:h-11 max-lg:*:min-w-11" />
          </div>
          <div className="landing-fade mx-auto w-full max-w-[400px] lg:ml-auto">
            <AuthCard mode={mode} onModeChange={setMode} />
          </div>
        </section>

        <Section id="preview" title="See how it looks" intro="One conversation becomes a diary entry, a reminder, a goal and a new link in your 2nd Brain.">
          <Preview />
        </Section>

        <Section id="features" title="Everything in one quiet place">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(f => (
              <li key={f.title}>
                <Card className="h-full p-5">
                  <f.icon size={20} aria-hidden="true" className="text-primary" />
                  <h3 className="mt-3 text-base font-semibold text-foreground">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
                </Card>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="how-it-works" title="How it works">
          <ol className="grid gap-4 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title}>
                <Card className="h-full p-5">
                  <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{i + 1}</span>
                  <h3 className="mt-3 text-base font-semibold text-foreground">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                </Card>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="privacy" title="Your diary stays yours">
          <ul className="grid gap-4 md:grid-cols-3">
            {privacy.map(p => (
              <li key={p.title} className="flex gap-3">
                <p.icon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <h3 className="text-base font-semibold text-foreground">{p.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <section aria-labelledby="cta-title" className="px-6 pb-16 max-md:px-4 max-md:pb-10">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-xl border border-border bg-surface p-8 max-md:p-5 md:flex-row md:items-center">
            <div>
              <h2 id="cta-title" className="text-2xl font-semibold leading-8 text-foreground">Start your first entry today</h2>
              <p className="mt-1 text-sm text-muted-foreground">It takes a minute to set up.</p>
            </div>
            <Button onClick={() => openAuth('signup')} className="max-md:w-full">Create your diary</Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground max-md:px-4 max-md:pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <p>&copy; {new Date().getFullYear()} Echo</p>
          <nav aria-label="Footer" className="flex gap-4">
            <a href="#privacy" className="hover:text-foreground max-md:py-3">Privacy</a>
            <a href="#features" className="hover:text-foreground max-md:py-3">Features</a>
            <a href="#main" className="hover:text-foreground max-md:py-3">Back to top</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
