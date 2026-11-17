'use client'

import { useState } from 'react'
import { disconnectMusic, setMusicAccount } from '@/lib/firestore'
import { listenbrainzUserExists, MUSIC_USERNAME_MAX } from '@/lib/echo/music'
import { Button, Input } from '../ui'

const LB_CHECK_TIMEOUT_MS = 10000

/** Music card body: type a ListenBrainz username to connect; or show the account and disconnect. */
export function MusicBody({ uid, connected, username }: { uid: string; connected: boolean; username?: string }) {
  const [busy, setBusy] = useState<'listenbrainz' | 'disconnect' | null>(null)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')

  async function listenbrainz() {
    const user = name.trim()
    if (!user) return
    setBusy('listenbrainz')
    setMessage('')
    try {
      // listenbrainzUserExists has no timeout of its own: race it so a hung request can not spin forever.
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), LB_CHECK_TIMEOUT_MS)
      let exists: boolean
      try {
        const signalled: typeof fetch = (input, init) => fetch(input, { ...init, signal: ctrl.signal })
        exists = await listenbrainzUserExists(user, signalled)
      } catch {
        setMessage("Couldn't reach ListenBrainz. Try again.")
        return
      } finally {
        clearTimeout(timer)
      }
      if (!exists) {
        setMessage("We couldn't find that ListenBrainz user. Check the spelling and try again.")
        return
      }
      try {
        await setMusicAccount(uid, 'listenbrainz', user)
        setName('')
      } catch {
        setMessage('Could not save your account. Please try again.')
      }
    } finally {
      setBusy(null)
    }
  }

  async function disconnect() {
    setBusy('disconnect')
    setMessage('')
    try {
      await disconnectMusic(uid)
    } catch {
      setMessage('Could not disconnect. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {connected ? (
        <>
          <p className="break-words text-sm text-foreground">
            Connected as <span className="font-medium">{username}</span> (ListenBrainz)
          </p>
          <Button variant="secondary" loading={busy === 'disconnect'} onClick={() => void disconnect()} className="w-full">
            Disconnect
          </Button>
        </>
      ) : (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            void listenbrainz()
          }}
        >
          <div className="min-w-0 flex-1">
            <Input label="Your ListenBrainz username" value={name} onChange={(e) => setName(e.target.value)} placeholder="username" maxLength={MUSIC_USERNAME_MAX} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </div>
          <Button type="submit" variant="primary" loading={busy === 'listenbrainz'} disabled={(busy !== null && busy !== 'listenbrainz') || !name.trim()} className="w-full sm:w-auto">
            Connect
          </Button>
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
