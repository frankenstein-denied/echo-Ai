'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useAuth } from '@/lib/auth-context'
import { ensureUserProfile, type UserProfile } from '@/lib/firestore'
import { Landing } from '@/components/echo/landing'
import { Onboarding } from '@/components/echo/onboarding'
import { Dashboard } from '@/components/echo/shell'
import { Alert, Button, EchoMark } from '@/components/echo/ui'

const HINT_KEY = 'echo:signed-in'
const readHint = () => {
  try {
    return window.localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return false
  }
}
const writeHint = (on: boolean) => {
  try {
    if (on) window.localStorage.setItem(HINT_KEY, '1')
    else window.localStorage.removeItem(HINT_KEY)
  } catch {}
}
const subscribeNone = () => () => {}

function Loader() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <div role="status" aria-label="Loading Echo">
        <EchoMark state="thinking" />
      </div>
    </main>
  )
}

export default function Page() {
  const { user, loading } = useAuth()
  const [state, setState] = useState<{ uid: string; profile: UserProfile | null; error: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const uid = user?.uid
  const hinted = useSyncExternalStore(subscribeNone, readHint, () => false)

  useEffect(() => {
    if (user) writeHint(true)
    else if (!loading) writeHint(false)
  }, [user, loading])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ensureUserProfile(user)
      .then((profile) => {
        if (!cancelled) setState({ uid: user.uid, profile, error: '' })
      })
      .catch((e) => {
        if (!cancelled) setState({ uid: user.uid, profile: null, error: e instanceof Error ? e.message : 'Could not load your profile.' })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, attempt])

  if (loading && hinted) return <Loader />
  if (!user) return <Landing />
  if (loading) return <Loader />
  if (!state || state.uid !== user.uid) return <Loader />
  if (!state.profile) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <div className="w-full max-w-sm text-left">
          <Alert variant="danger" title="Could not load your profile">
            {state.error}
          </Alert>
        </div>
        <Button
          onClick={() => {
            setState(null)
            setAttempt(attempt + 1)
          }}
        >
          Try again
        </Button>
      </main>
    )
  }
  const profile = state.profile
  if (!profile.onboarded) return <Onboarding key={user.uid} profile={profile} onDone={(a) => setState({ uid: user.uid, profile: { ...profile, ...a, onboarded: true }, error: '' })} />
  return <Dashboard profile={profile} />
}
