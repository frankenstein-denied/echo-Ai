'use client'

import { useState } from 'react'
import { auth } from '@/lib/firebase'
import { setConnectorSecret } from '@/lib/firestore'
import type { AiProvider } from '@/lib/echo/connectors'
import { Button, Input } from '../ui'

/** AI model card body: paste your own API key (sealed by the server; only the sealed copy is stored), or remove it. */
export function AiKeyBody({ uid, provider, name, connected }: { uid: string; provider: AiProvider; name: string; connected: boolean }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function save() {
    setBusy(true)
    setMessage('')
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/connectors/ai-key', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ provider, key: key.trim() }) })
      const d = (await res.json().catch(() => ({}))) as { sealed?: string; error?: string }
      if (!res.ok || !d.sealed) {
        setMessage(d.error === 'Invalid key' ? "That doesn't look like an API key." : 'Could not save the key. Please try again.')
        return
      }
      await setConnectorSecret(uid, provider, d.sealed)
      setKey('')
    } catch {
      setMessage('Could not save the key. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setMessage('')
    try {
      await setConnectorSecret(uid, provider, null)
    } catch {
      setMessage('Could not remove the key. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const short = name.replace(/ \(.*\)$/, '')
  return (
    <div className="mt-4 space-y-3">
      {connected ? (
        <>
          <p className="text-lg font-semibold text-foreground">Key added</p>
          <p className="text-sm text-muted-foreground">Say &quot;ask {short}…&quot; in your diary.</p>
          <Button variant="secondary" loading={busy} onClick={() => void remove()} className="w-full">
            Remove key
          </Button>
        </>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <Input label={`Your ${short} API key`} type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your key" autoComplete="off" maxLength={400} />
          <Button type="submit" loading={busy} disabled={!key.trim()} className="w-full">
            Add key
          </Button>
          <p className="text-xs text-muted-foreground">Your key is encrypted on Echo&apos;s server and used only when you ask {short}. Usage is billed to your account.</p>
        </form>
      )}
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  )
}
