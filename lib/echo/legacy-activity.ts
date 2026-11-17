import { getLegacySettings, stampActivity } from '@/lib/legacy-store'

// Keeps the owner's Legacy alive. Stamping is never gated on a cached "enabled" flag: a stale `false`
// would stop a long-lived tab from re-locking a released legacy. The flag only gates the profile copy.

const enabledByUid = new Map<string, Promise<boolean>>()

/** Whether the owner's Legacy is on; a missing settings doc means off. Cached per user. */
export function isLegacyEnabled(uid: string): Promise<boolean> {
  let p = enabledByUid.get(uid)
  if (!p) {
    // A missing settings doc means Legacy is off; a failed read is retried next time.
    p = getLegacySettings(uid).then(
      (s) => !!s?.enabled,
      () => {
        enabledByUid.delete(uid)
        return false
      },
    )
    enabledByUid.set(uid, p)
  }
  return p
}

/** The Legacy page calls this after saving, so stamping starts or stops without a reload. */
export function setLegacyEnabledCache(uid: string, enabled: boolean): void {
  enabledByUid.set(uid, Promise.resolve(enabled))
}

/** Marks the owner active (throttled inside stampActivity; a missing settings doc is a quiet no-op). Never throws. */
export async function noteLegacyActivity(uid: string): Promise<void> {
  try {
    await stampActivity(uid)
  } catch {
    // Activity stamping is best effort.
  }
}
