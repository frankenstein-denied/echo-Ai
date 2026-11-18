import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BRIEF_TEXT_MAX } from './briefs'

const rules = readFileSync(join(__dirname, '..', '..', 'firestore.rules'), 'utf8')

function block(header: string): string {
  const start = rules.indexOf(`match ${header} {`)
  if (start < 0) throw new Error(`no block: match ${header}`)
  let depth = 0
  for (let i = rules.indexOf('{', start + `match ${header}`.length); i < rules.length; i++) {
    if (rules[i] === '{') depth++
    else if (rules[i] === '}' && --depth === 0) return rules.slice(start, i + 1)
  }
  throw new Error('unbalanced')
}

describe('firestore.rules: briefs', () => {
  const b = block('/briefs/{day}')
  it('is owner-only, one per date-keyed day, with exact fields stamped at server time', () => {
    expect(b).toContain("d.keys().hasOnly(['text', 'partial', 'createdAt'])")
    expect(b).toContain(`isString(d.text, ${BRIEF_TEXT_MAX})`)
    expect(b).toContain('d.partial is bool')
    expect(b).toContain("day.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')")
    expect(b).toContain('allow read, delete: if isOwner(uid);')
    expect(b).toContain('request.resource.data.createdAt == request.time')
  })
})
