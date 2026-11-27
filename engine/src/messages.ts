/*
 * Echo Legacy engine — the user-facing message catalog (ticket 2.09).
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 *
 * One message per error type, in two versions: for the owner (who may see details about
 * their own diary) and for an asker (who must never learn that a protected entry exists).
 * Screens show messageFor(error, audience); they never show an error's own text to an asker.
 * The same wording is listed in project-docs/10-error-messages.md (a test keeps them in sync).
 */
import { PolicySyntaxError } from './errors'

export type Audience = 'owner' | 'asker'
export type Tone = 'neutral' | 'warning' | 'danger' | 'info'
export type UserMessage = Readonly<{ title: string; body: string; tone: Tone }>
type Entry = Readonly<{ owner: UserMessage; asker: UserMessage }>

/** The one reply an asker gets whenever there is nothing they may be told. */
export const NEUTRAL_REPLY = "I don't have anything I can share about that."

const neutral: UserMessage = { title: 'Nothing to share', body: NEUTRAL_REPLY, tone: 'neutral' }

export const MESSAGES = {
  AccessDenied: {
    owner: { title: 'This isn’t available', body: 'Your account can’t open this item.', tone: 'danger' },
    asker: { title: 'This isn’t available', body: 'Echo can only show what was shared with your account.', tone: 'danger' },
  },
  AmbiguousName: {
    owner: { title: 'More than one person has that name', body: 'Choose the person you mean from the list.', tone: 'warning' },
    asker: neutral,
  },
  TamperDetected: {
    owner: {
      title: 'Your saved entries were changed outside Echo',
      body: 'Echo found a change it did not make, starting at entry {index}. Nothing is shared with anyone until this is checked. Contact your trustee.',
      tone: 'danger',
    },
    asker: neutral,
  },
  PolicySyntaxError: {
    owner: { title: 'Line {line}, column {column}: {problem}', body: 'Fix the highlighted line, then check the policy again.', tone: 'danger' },
    asker: neutral,
  },
  PolicyFrozen: {
    owner: { title: 'Your legacy policy is locked', body: 'The policy locked when your legacy was released, so it can no longer change.', tone: 'info' },
    asker: neutral,
  },
  UnknownEntryType: {
    owner: { title: 'This kind of entry can’t be saved yet', body: 'Save it as a diary entry or a Letter of Wishes instead.', tone: 'warning' },
    asker: neutral,
  },
  Unexpected: {
    owner: { title: 'Something went wrong', body: 'Nothing was changed. Please try again in a moment.', tone: 'warning' },
    asker: neutral,
  },
} as const satisfies Record<string, Entry>

/** Fills a catalog message for this error and audience. Unknown errors get the calm generic one. */
export function messageFor(error: unknown, audience: Audience): UserMessage {
  const name = error instanceof Error && error.name in MESSAGES ? (error.name as keyof typeof MESSAGES) : 'Unexpected'
  const base = MESSAGES[name][audience]
  if (audience === 'asker') return base
  if (error instanceof PolicySyntaxError) {
    const problem = error.message.replace(/ \(line \d+, column \d+\)$/, '')
    return { ...base, title: `Line ${error.line}, column ${error.column}: ${problem}` }
  }
  if (name === 'TamperDetected' && error && typeof error === 'object' && 'index' in error) {
    return { ...base, body: base.body.replace('{index}', `#${String((error as { index: number }).index)}`) }
  }
  return base
}
