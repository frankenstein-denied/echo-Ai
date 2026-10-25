import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

// Verifies Firebase ID tokens the way the Firebase docs describe (RS256, Google's
// securetoken keys, iss/aud = project, non-empty sub, auth_time in the past) without
// firebase-admin, whose CommonJS deps fail to load in Vercel's bundled runtime.
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

let googleKeys: JWTVerifyGetKey | null = null
function firebaseKeys(): JWTVerifyGetKey {
  googleKeys ??= createRemoteJWKSet(new URL(GOOGLE_JWKS_URL))
  return googleKeys
}

export async function verifyFirebaseIdToken(
  token: string,
  projectId: string | undefined,
  keys: JWTVerifyGetKey = firebaseKeys(),
): Promise<{ uid: string } | null> {
  if (!projectId) return null
  try {
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    })
    const authTime = typeof payload.auth_time === 'number' ? payload.auth_time : NaN
    if (typeof payload.sub !== 'string' || !payload.sub || !(authTime <= Date.now() / 1000 + 5)) return null
    return { uid: payload.sub }
  } catch {
    return null
  }
}

export async function verifyUser(req: Request): Promise<{ uid: string } | null> {
  const header = req.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  if (!match) return null
  return verifyFirebaseIdToken(match[1], process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
}
