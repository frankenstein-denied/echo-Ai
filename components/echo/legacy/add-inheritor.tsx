'use client'

import { useState, type FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { UserPlus } from 'lucide-react'
import { DEFAULT_SHARED, isValidAnswer, MAX_INHERITORS, type LegacyKind } from '@/lib/echo/legacy'
import { addInheritor } from '@/lib/legacy-store'
import { Alert, Button, Card, Input } from '../ui'
import { ANSWER_HINT, ANSWER_INVALID, INHERITOR_ERROR, KindPicker, QuestionSelect } from './kinds'

/** Add an inheritor: email, preset question, one-word answer and what they can open. */
export function AddInheritor({ user, count }: { user: User; count: number }) {
  const [email, setEmail] = useState('')
  const [questionId, setQuestionId] = useState('')
  const [answer, setAnswer] = useState('')
  const [shared, setShared] = useState<LegacyKind[]>(() => [...DEFAULT_SHARED])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')
  const full = count >= MAX_INHERITORS
  const answerError = answer.trim() && !isValidAnswer(answer) ? ANSWER_INVALID : undefined

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSent('')
    if (!questionId) return setError(INHERITOR_ERROR.question)
    if (!isValidAnswer(answer)) return setError(INHERITOR_ERROR.answer)
    setBusy(true)
    try {
      const res = await addInheritor(user, { email, questionId, answer, shared })
      if (!res.ok) return setError(INHERITOR_ERROR[res.error])
      setSent(`Request sent to ${email.trim()}. They'll see it on their Legacy page.`)
      setEmail('')
      setQuestionId('')
      setAnswer('')
      setShared([...DEFAULT_SHARED])
    } catch {
      setError("Couldn't send the request. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-foreground">Add an inheritor</h2>
      <p className="mt-1 text-sm text-muted-foreground">They need an Echo account with a verified email. They'll get a request to accept.</p>
      {full ? (
        <div className="mt-4">
          <Alert variant="info">You've named {MAX_INHERITORS} inheritors, the most allowed. Remove one to add someone else.</Alert>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 grid gap-4">
          <Input label="Their email" type="email" autoComplete="off" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} />
          <QuestionSelect value={questionId} onChange={setQuestionId} disabled={busy} />
          <Input
            label="Answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={60}
            hint={ANSWER_HINT}
            error={answerError}
            disabled={busy}
            required
          />
          <KindPicker value={shared} onChange={setShared} disabled={busy} />
          {error && <Alert variant="danger">{error}</Alert>}
          {sent && <Alert variant="success">{sent}</Alert>}
          <div>
            <Button type="submit" icon={UserPlus} loading={busy} disabled={!email.trim() || !questionId || !answer.trim() || !!answerError}>
              Send request
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}
