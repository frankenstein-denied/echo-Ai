'use client'

/**
 * TellEchoButton: the suggested sentence of an empty state and a button that sends it to Echo.
 * Props: sentence (shown in quotes), onSend(sentence) (the page sends it, e.g. through quickSend; a throw shows its
 * message), label? (button text, default "Tell Echo"). After a send it says "Sent to Echo." or the reply text.
 */
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from './button'

export type TellEcho = { sentence: string; onSend: (sentence: string) => Promise<string | void> | string | void; label?: string }

export function TellEchoButton({ sentence, onSend, label = 'Tell Echo' }: TellEcho) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [failed, setFailed] = useState(false)

  const send = async () => {
    if (busy) return
    setBusy(true)
    setNote('')
    setFailed(false)
    try {
      const reply = await onSend(sentence)
      setNote(typeof reply === 'string' && reply.trim() ? reply : 'Sent to Echo.')
    } catch (e) {
      setFailed(true)
      setNote(e instanceof Error && e.message ? e.message : "Couldn't reach Echo. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid justify-items-center gap-2">
      <p className="text-sm text-foreground">“{sentence}”</p>
      <Button icon={Sparkles} loading={busy} onClick={() => void send()}>
        {label}
      </Button>
      {note && (
        <p role={failed ? 'alert' : 'status'} className={`max-w-sm text-xs ${failed ? 'text-danger' : 'text-muted-foreground'}`}>
          {note}
        </p>
      )}
    </div>
  )
}
