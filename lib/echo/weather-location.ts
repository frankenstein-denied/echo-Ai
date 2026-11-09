// Weather from the phone's location: keeps the Weather connector on the device's rough area when the person allowed it.
// Never log coordinates.
import { doc, getDoc } from 'firebase/firestore'
import { connectorsCol, setWeatherLocation } from '@/lib/firestore'
import { roundCoord } from './weather'

/** The same label the Connectors "Use my location" button saves, so the rules need no change. */
export const AUTO_PLACE = 'Your location'

type WeatherDoc = { connected?: boolean; place?: string; lat?: number; lon?: number }
type Position = { lat: number; lon: number }
/** fromSetup: the person just allowed location on the welcome step that says it is for the weather. */
type SyncOptions = { fromSetup?: boolean }

/** Off with no place saved: never set up (onboarding writes this) or turned off. Only the welcome step may connect it. */
function offWithoutPlace(d: WeatherDoc): boolean {
  return d.connected === false && d.place === undefined && d.lat === undefined && d.lon === undefined
}

/** Only a missing doc or one that follows the phone can change; a turned-off connector or a hand-picked city never does. */
function followsPhone(d: WeatherDoc | null, { fromSetup = false }: SyncOptions = {}): boolean {
  return !d || (d.connected === true && d.place === AUTO_PLACE) || (fromSetup && offWithoutPlace(d))
}

export function weatherAction(d: WeatherDoc | null, pos: Position, { fromSetup = false }: SyncOptions = {}): 'connect' | 'update' | 'none' {
  if (!d || (fromSetup && offWithoutPlace(d))) return 'connect'
  if (!followsPhone(d)) return 'none'
  const same = typeof d.lat === 'number' && typeof d.lon === 'number' && roundCoord(d.lat) === roundCoord(pos.lat) && roundCoord(d.lon) === roundCoord(pos.lon)
  return same ? 'none' : 'update'
}

const AUTO_SYNC_GAP_MS = 6 * 3600000

/** The automatic sync runs at most every 6 hours: with only approximate location allowed, every position request shows Android's "use precise location?" pop-up. */
export function autoSyncDue(nowMs: number, lastMs: number | null): boolean {
  if (lastMs === null || lastMs > nowMs) return true
  return nowMs - lastMs >= AUTO_SYNC_GAP_MS
}

const LAST_AUTO_SYNC_KEY = 'echo.weather.lastAutoSync'

export function readLastAutoSync(): number | null {
  try {
    const n = Number(localStorage.getItem(LAST_AUTO_SYNC_KEY))
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export function saveLastAutoSync(ms: number) {
  try {
    localStorage.setItem(LAST_AUTO_SYNC_KEY, String(ms))
  } catch {}
}

async function readWeatherDoc(uid: string): Promise<WeatherDoc | null> {
  const snap = await getDoc(doc(connectorsCol(uid), 'weather'))
  return snap.exists() ? (snap.data() as WeatherDoc) : null
}

function currentPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new Error('No location on this device.'))
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => reject(new Error('Location unavailable.')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 1800000 },
    )
  })
}

type SyncDeps = {
  getDoc: (uid: string) => Promise<WeatherDoc | null>
  getPosition: () => Promise<Position>
  save: (uid: string, loc: { place: string; lat: number; lon: number }) => Promise<void>
}

const DEFAULT_DEPS: SyncDeps = { getDoc: readWeatherDoc, getPosition: currentPosition, save: setWeatherLocation }

// The app-open sync and the welcome step can fire together; one position request is enough.
let inFlight: Promise<void> | null = null

/** Saves the phone's rough location to Weather when it was never set up or already follows the phone. Never throws. */
export function syncWeatherLocation(uid: string, deps: SyncDeps = DEFAULT_DEPS, opts: SyncOptions = {}): Promise<void> {
  // A welcome-step sync may connect what the automatic one may not, so it runs after an automatic one already going.
  if (inFlight) return opts.fromSetup ? inFlight.then(() => syncWeatherLocation(uid, deps, opts)) : inFlight
  inFlight = runSync(uid, deps, opts).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function runSync(uid: string, deps: SyncDeps, opts: SyncOptions): Promise<void> {
  try {
    const d = await deps.getDoc(uid)
    // Skip the position request (and any pop-up it brings) when nothing could change.
    if (!followsPhone(d, opts)) return
    const pos = await deps.getPosition()
    if (weatherAction(d, pos, opts) === 'none') return
    await deps.save(uid, { place: AUTO_PLACE, lat: pos.lat, lon: pos.lon })
  } catch {
    // Offline, location off or a timeout: the next sync tries again.
  }
}
