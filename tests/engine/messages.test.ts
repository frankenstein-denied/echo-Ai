// Echo Legacy engine — user-facing message catalog (ticket 2.09).
// Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as errors from '@/engine/src/errors'
import { MESSAGES, NEUTRAL_REPLY, messageFor } from '@/engine/src/messages'

const errorClasses = Object.entries(errors).filter(([name]) => name !== 'EchoLegacyError')

describe('message catalog', () => {
  it('has one message for each error type', () => {
    for (const [name] of errorClasses) expect(MESSAGES[name as keyof typeof MESSAGES], name).toBeDefined()
  })

  it('denied access reads the same whatever the hidden reason or entry', () => {
    const a = messageFor(new errors.AccessDenied('Nothing to share.'), 'asker')
    const b = messageFor(new errors.AccessDenied('entry e3 (business) exists but is not permitted'), 'asker')
    expect(a).toEqual(b)
  })

  it('no asker-facing message reveals that a protected entry exists', () => {
    const asker = [
      ...errorClasses.map(([, E]) => messageFor(new (E as new (m: string, a?: number, b?: number) => Error)('entry e3 about the store', 1, 1), 'asker')),
      messageFor(new Error('database exploded on entry e3'), 'asker'),
    ]
    for (const m of asker) {
      const text = `${m.title} ${m.body}`.toLowerCase()
      for (const word of ['exist', 'protected', 'hidden', 'secret', 'e3', 'store', 'entries about', 'not allowed to see']) {
        expect(text, `"${text}" contains "${word}"`).not.toContain(word)
      }
    }
  })

  it('askers get the neutral reply for anything that is not plain access denial', () => {
    for (const e of [new errors.TamperDetected('broken link at entry #3', 3), new errors.UnknownEntryType('photo'), new Error('boom')]) {
      expect(messageFor(e, 'asker').body).toBe(NEUTRAL_REPLY)
    }
  })

  it('a policy syntax error tells the owner exactly where', () => {
    const m = messageFor(new errors.PolicySyntaxError('Unknown character "@"', 3, 7), 'owner')
    expect(m.title).toBe('Line 3, column 7: Unknown character "@"')
  })

  it('an unexpected error gets a calm generic message, never the raw error text', () => {
    const m = messageFor(new Error('ECONNRESET at socket 4'), 'owner')
    expect(`${m.title} ${m.body}`).not.toContain('ECONNRESET')
  })

  it('the catalog document lists every message word for word', () => {
    const doc = readFileSync(path.resolve(__dirname, '../../project-docs/10-error-messages.md'), 'utf8')
    for (const [name, m] of Object.entries(MESSAGES)) {
      for (const text of [m.owner.title, m.owner.body, m.asker.title, m.asker.body]) {
        if (text.includes('{')) continue // templates are shown with their placeholders
        expect(doc, `${name}: ${text}`).toContain(text)
      }
    }
  })
})
