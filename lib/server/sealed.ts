import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Server-only encryption for connector secrets (OAuth tokens, login state). AES-256-GCM with a 12-byte IV;
// `aad` (the uid for tokens, a fixed purpose string for login state) is authenticated, so a value sealed for
// one account does not open for another. Format: v1.<iv b64url>.<ciphertext+tag b64url>, JSON inside.
const VERSION = 'v1'
const TAG_BYTES = 16

/** The AES key: CONNECTOR_SECRET must be base64 of exactly 32 bytes; anything else gives null. */
function keyOf(secret: string | undefined): Buffer | null {
  if (!secret || !/^[A-Za-z0-9+/]+={0,2}$/.test(secret.trim())) return null
  const key = Buffer.from(secret.trim(), 'base64')
  return key.length === 32 ? key : null
}

export const validSecret = (secret: string | undefined) => keyOf(secret) !== null

export function seal(value: unknown, aad: string, secret = process.env.CONNECTOR_SECRET): string {
  const key = keyOf(secret)
  if (!key) throw new Error('CONNECTOR_SECRET is not set or not 32 bytes of base64')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad))
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final(), cipher.getAuthTag()])
  return `${VERSION}.${iv.toString('base64url')}.${body.toString('base64url')}`
}

export function open<T>(sealed: string, aad: string, secret = process.env.CONNECTOR_SECRET): T | null {
  const key = keyOf(secret)
  if (!key || typeof sealed !== 'string') return null
  const parts = sealed.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) return null
  try {
    const iv = Buffer.from(parts[1], 'base64url')
    const body = Buffer.from(parts[2], 'base64url')
    if (iv.length !== 12 || body.length <= TAG_BYTES) return null
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAAD(Buffer.from(aad))
    decipher.setAuthTag(body.subarray(body.length - TAG_BYTES))
    const plain = Buffer.concat([decipher.update(body.subarray(0, body.length - TAG_BYTES)), decipher.final()])
    return JSON.parse(plain.toString('utf8')) as T
  } catch {
    return null
  }
}
