'use client'

import { useEffect } from 'react'
import { isLegacyEnabled, noteLegacyActivity } from '@/lib/echo/legacy-activity'
import { writeLegacyProfile } from '@/lib/legacy-store'
import type { UserProfile } from '@/lib/firestore'

type ProfileCopy = Pick<UserProfile, 'displayName' | 'preferredName' | 'importantPeople' | 'tone' | 'language'>

const PROFILE_KEY = 'echo.legacy.profileKey.'

function profileKey(p: ProfileCopy): string {
  return JSON.stringify([p.displayName ?? null, p.preferredName ?? '', p.importantPeople ?? [], p.tone ?? '', p.language ?? null])
}

function readKey(uid: string): string | null {
  try {
    return globalThis.localStorage?.getItem(PROFILE_KEY + uid) ?? null
  } catch {
    return null
  }
}

function writeKey(uid: string, key: string): void {
  try {
    globalThis.localStorage?.setItem(PROFILE_KEY + uid, key)
  } catch {
    // Storage blocked: the copy is just rewritten more often.
  }
}

/**
 * Owner-side Legacy upkeep for the signed-in app: marks the owner active on open and whenever the app comes back
 * into view, and refreshes the inheritor-readable profile copy when the profile changes while Legacy is on.
 */
export function useLegacyActivity(uid: string | undefined, profile: ProfileCopy): void {
  useEffect(() => {
    if (!uid) return
    void noteLegacyActivity(uid)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void noteLegacyActivity(uid)
    }
    const onFocus = () => void noteLegacyActivity(uid)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [uid])

  const key = profileKey(profile)
  useEffect(() => {
    if (!uid || readKey(uid) === key) return
    let cancelled = false
    isLegacyEnabled(uid)
      .then(async (enabled) => {
        if (cancelled || !enabled) return
        await writeLegacyProfile(uid, profileFromKey(key))
        writeKey(uid, key)
      })
      .catch(() => null)
    return () => {
      cancelled = true
    }
  }, [uid, key])
}

function profileFromKey(key: string): ProfileCopy {
  const [displayName, preferredName, importantPeople, tone, language] = JSON.parse(key) as [string | null, string, string[], string, ProfileCopy['language'] | null]
  return { displayName, preferredName, importantPeople, tone, language: language ?? undefined }
}

/** The Legacy page writes the copy on enable; this records it so the shell does not write it again. */
export function markLegacyProfileWritten(uid: string, profile: ProfileCopy): void {
  writeKey(uid, profileKey(profile))
}
