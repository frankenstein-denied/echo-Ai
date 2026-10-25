import { getApp, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

function adminApp() {
  if (getApps().length) return getApp()
  // Token verification only needs the project id; no service account.
  return initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID })
}

export async function verifyUser(req: Request): Promise<{ uid: string } | null> {
  const header = req.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  if (!match) return null
  try {
    const decoded = await getAuth(adminApp()).verifyIdToken(match[1])
    return { uid: decoded.uid }
  } catch {
    return null
  }
}
