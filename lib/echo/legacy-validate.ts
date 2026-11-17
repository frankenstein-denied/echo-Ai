import { isValidAnswer, MAX_INHERITORS, questionText } from './legacy'

export type NewInheritorError = 'self' | 'not-found' | 'limit' | 'question' | 'answer' | 'email'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** userDirectory ids are the lowercased email. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw)
  return email.length <= 320 && EMAIL_RE.test(email)
}

/** Checks a new inheritor before anything is written. */
export function validateNewInheritor(input: {
  ownerUid: string
  ownerEmail: string | null
  email: string
  questionId: string
  answer: string
  existingCount: number
  found: { uid: string; displayName: string } | null
}): { ok: true } | { ok: false; error: NewInheritorError } {
  const fail = (error: NewInheritorError) => ({ ok: false as const, error })
  if (!isValidEmail(input.email)) return fail('email')
  if (input.ownerEmail && normalizeEmail(input.ownerEmail) === normalizeEmail(input.email)) return fail('self')
  if (input.existingCount >= MAX_INHERITORS) return fail('limit')
  if (questionText(input.questionId) === null) return fail('question')
  if (!isValidAnswer(input.answer)) return fail('answer')
  if (!input.found) return fail('not-found')
  if (input.found.uid === input.ownerUid) return fail('self')
  return { ok: true }
}
