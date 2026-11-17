'use client'

import { useState, type FormEvent } from 'react'
import { ArrowLeft } from 'lucide-react'
import { isValidAnswer, MAX_TRIES, questionText } from '@/lib/echo/legacy'
import { deniedGuessOutcome } from '@/lib/echo/legacy-chat-helpers'
import { isReleased, submitGuess } from '@/lib/legacy-store'
import { Alert, Button, Card, IconButton, Input } from '../ui'
import { ANSWER_INVALID } from './kinds'

const LOCKED = 'Too many tries. Try again tomorrow.'

function wrongText(triesLeft: number): string {
  return `Not quite. ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left.`
}

/** Step 1 of opening a released legacy: answer the owner's one-word question. */
export function UnlockScreen({
  ownerName,
  ownerUid,
  inheritorUid,
  questionId,
  onUnlocked,
  onRelocked,
  onBack,
}: {
  ownerName: string
  ownerUid: string
  inheritorUid: string
  questionId: string
  onUnlocked: () => void
  /** The owner came back while this screen was open: the legacy is locked again. */
  onRelocked: () => void
  onBack: () => void
}) {
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ variant: 'warning' | 'danger'; text: string } | null>(null)
  const [locked, setLocked] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const question = questionText(questionId) ?? `${ownerName}'s question`

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy || locked || !answer.trim()) return
    // Never spend one of the tries on something that can't be an answer.
    if (!isValidAnswer(answer)) return setInvalid(true)
    setInvalid(false)
    setBusy(true)
    setMessage(null)
    try {
      const res = await submitGuess(ownerUid, inheritorUid, answer)
      if (res.correct) return onUnlocked()
      // A denied write is either the tries limit or a legacy that locked again; only the beacon can tell.
      if (res.denied && deniedGuessOutcome(await isReleased(ownerUid)) === 'relocked') return onRelocked()
      if (res.triesLeft <= 0 || res.lockedUntil !== null) {
        setLocked(true)
        setMessage({ variant: 'warning', text: LOCKED })
      } else {
        setMessage({ variant: 'warning', text: wrongText(res.triesLeft) })
      }
      setAnswer('')
    } catch {
      setMessage({ variant: 'danger', text: "Couldn't check your answer. Try again." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <IconButton icon={ArrowLeft} label="Back to Legacy" onClick={onBack} />
      </div>
      <Card className="mx-auto w-full max-w-md text-center">
        <div aria-hidden="true" className="text-4xl">
          🕯️
        </div>
        <h2 className="mt-3 text-lg font-semibold text-foreground">{ownerName}&apos;s legacy</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {ownerName} left this for you. Answer {ownerName}&apos;s question to open it.
        </p>
        <form className="mt-5 grid gap-3 text-left" onSubmit={(e) => void submit(e)}>
          <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-center text-sm font-medium text-foreground">{question}</p>
          <Input
            aria-label={question}
            placeholder="One word"
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value)
              setInvalid(false)
            }}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={60}
            disabled={busy || locked}
            error={invalid ? ANSWER_INVALID : undefined}
          />
          <Button type="submit" loading={busy} disabled={locked || !answer.trim()}>
            Open
          </Button>
          {message && <Alert variant={message.variant}>{message.text}</Alert>}
          <p className="text-center text-xs text-muted-foreground">{MAX_TRIES} tries, then locked for 24 hours.</p>
        </form>
      </Card>
    </div>
  )
}
