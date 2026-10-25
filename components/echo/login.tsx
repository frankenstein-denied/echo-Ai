'use client'

import { useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { authErrorMessage, useAuth } from '@/lib/auth-context'
import { Alert, Button, Card, EchoMark, IconButton, Input, Segmented } from '@/components/echo/ui'
import { GoogleG } from '@/components/echo/google-g'

type Mode = 'signin' | 'signup'

export function Login() {
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      await fn()
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    run(() => (mode === 'signup' ? signUp(name.trim(), email.trim(), password) : signIn(email.trim(), password)))
  }

  const forgot = () => {
    if (!email.trim()) {
      setError('Enter your email above first, then tap Forgot password.')
      setInfo('')
      return
    }
    run(async () => {
      await resetPassword(email.trim())
      setInfo('Password reset email sent. Check your inbox.')
    })
  }

  const switchMode = (m: string) => {
    setMode(m as Mode)
    setError('')
    setInfo('')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <EchoMark small />
          <h1 className="mt-3 text-2xl font-semibold leading-8 text-foreground">Echo</h1>
          <p className="text-sm text-muted-foreground">Your private journal that remembers for you.</p>
        </div>
        <Card className="p-6">
          <div className="mb-5">
            <Segmented
              fullWidth
              ariaLabel="Authentication mode"
              value={mode}
              onChange={switchMode}
              options={[
                { value: 'signin', label: 'Sign in' },
                { value: 'signup', label: 'Create account' },
              ]}
            />
          </div>
          <form onSubmit={submit} className="grid gap-4">
            {mode === 'signup' && (
              <Input label="Name" required value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
            )}
            <Input label="Email" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                hint={mode === 'signup' ? 'At least 6 characters.' : undefined}
                className="pr-11"
              />
              <IconButton
                icon={showPassword ? EyeOff : Eye}
                label="Show password"
                aria-pressed={showPassword}
                size="sm"
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-1 top-[30px]"
              />
            </div>
            {error && <Alert variant="danger">{error}</Alert>}
            {info && <Alert variant="success">{info}</Alert>}
            <Button type="submit" loading={busy} className="w-full">
              {busy ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </Button>
            {mode === 'signin' && (
              <div className="text-center">
                <Button variant="ghost" size="sm" onClick={forgot} disabled={busy}>Forgot password?</Button>
              </div>
            )}
          </form>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground" role="separator">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(signInWithGoogle)}
            className="flex h-10 w-full items-center justify-center gap-3 rounded-lg border border-[#8E918F] bg-[#131314] px-4 text-sm font-medium text-[#E3E3E3] transition-colors hover:bg-[#1e1f20] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <GoogleG size={20} />
            Continue with Google
          </button>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">Your data stays yours. Export or delete it anytime.</p>
      </div>
    </main>
  )
}
