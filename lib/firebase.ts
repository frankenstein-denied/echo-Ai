import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore'
import { isSupported, type Analytics, getAnalytics } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error(
    'Missing Firebase config: set NEXT_PUBLIC_FIREBASE_API_KEY and NEXT_PUBLIC_FIREBASE_PROJECT_ID in .env.local (see .env.example).',
  )
}

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
export const auth = getAuth(app)
// In the browser, keep a copy of the user's data on the device (IndexedDB), so a fresh page (the floating call
// and chat started from the notification, or a cold app start) shows cached data at once instead of waiting on the
// network, and the diary still opens offline. Multi-tab: the app WebView and the floating WebViews share it.
// Anything that fails (no IndexedDB, private mode, already initialized) falls back to the memory cache.
function makeDb(): Firestore {
  if (typeof window === 'undefined') return getFirestore(app)
  try {
    return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  } catch {
    return getFirestore(app)
  }
}
export const db = makeDb()

export async function initAnalytics(): Promise<Analytics | null> {
  if (typeof window === 'undefined') return null
  if (!(await isSupported())) return null
  return getAnalytics(app)
}
