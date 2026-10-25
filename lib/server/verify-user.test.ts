import { describe, expect, it } from 'vitest'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose'
import { verifyFirebaseIdToken } from './verify-user'

const PROJECT = 'echo-test'

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }
  const jwks = createLocalJWKSet({ keys: [jwk] })
  const now = Math.floor(Date.now() / 1000)
  const sign = (claims: JWTPayload, opts: { iss?: string; aud?: string; exp?: number; kid?: string } = {}) =>
    new SignJWT({ auth_time: now - 10, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? 'k1' })
      .setIssuer(opts.iss ?? `https://securetoken.google.com/${PROJECT}`)
      .setAudience(opts.aud ?? PROJECT)
      .setIssuedAt(now - 10)
      .setExpirationTime(opts.exp ?? now + 3600)
      .sign(privateKey)
  return { jwks, sign, now }
}

describe('verifyFirebaseIdToken', () => {
  it('returns the uid for a valid Firebase ID token', async () => {
    const { jwks, sign } = await setup()
    const token = await sign({ sub: 'user-123' })
    expect(await verifyFirebaseIdToken(token, PROJECT, jwks)).toEqual({ uid: 'user-123' })
  })

  it('rejects a token for another project', async () => {
    const { jwks, sign } = await setup()
    expect(await verifyFirebaseIdToken(await sign({ sub: 'u' }, { aud: 'other' }), PROJECT, jwks)).toBeNull()
    expect(await verifyFirebaseIdToken(await sign({ sub: 'u' }, { iss: 'https://securetoken.google.com/other' }), PROJECT, jwks)).toBeNull()
  })

  it('rejects expired, unsigned-by-Google and subject-less tokens', async () => {
    const { jwks, sign, now } = await setup()
    expect(await verifyFirebaseIdToken(await sign({ sub: 'u' }, { exp: now - 60 }), PROJECT, jwks)).toBeNull()
    expect(await verifyFirebaseIdToken(await sign({ sub: 'u' }, { kid: 'unknown' }), PROJECT, jwks)).toBeNull()
    expect(await verifyFirebaseIdToken(await sign({}), PROJECT, jwks)).toBeNull()
    expect(await verifyFirebaseIdToken('not-a-jwt', PROJECT, jwks)).toBeNull()
  })

  it('rejects a token whose auth_time is in the future', async () => {
    const { jwks, sign, now } = await setup()
    expect(await verifyFirebaseIdToken(await sign({ sub: 'u', auth_time: now + 600 }), PROJECT, jwks)).toBeNull()
  })

  it('fails closed when the project id is missing', async () => {
    const { jwks, sign } = await setup()
    expect(await verifyFirebaseIdToken(await sign({ sub: 'u' }), undefined, jwks)).toBeNull()
  })
})
