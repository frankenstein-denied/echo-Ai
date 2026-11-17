import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEMO_MINUTES,
  LEGACY_KINDS,
  MAX_RELEASE_MINUTES,
  MAX_TRIES,
  MEMORY_TYPES_BY_KIND,
  TRY_WINDOW_MS,
} from './legacy'

const rules = readFileSync(join(__dirname, '..', '..', 'firestore.rules'), 'utf8')

/** The text of the `match <header> { ... }` block, braces balanced. */
function block(header: string, from = rules): string {
  const start = from.indexOf(`match ${header} {`)
  if (start < 0) throw new Error(`no block: match ${header}`)
  let depth = 0
  for (let i = from.indexOf('{', start + `match ${header}`.length); i < from.length; i++) {
    if (from[i] === '{') depth++
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1)
  }
  throw new Error(`unbalanced block: match ${header}`)
}

/** The body of a `function name(...) { ... }`, braces balanced. */
function fn(name: string): string {
  const start = rules.indexOf(`function ${name}(`)
  if (start < 0) throw new Error(`no function ${name}`)
  let depth = 0
  for (let i = rules.indexOf('{', start); i < rules.length; i++) {
    if (rules[i] === '{') depth++
    else if (rules[i] === '}' && --depth === 0) return rules.slice(start, i + 1)
  }
  throw new Error(`unbalanced function ${name}`)
}

/** The `allow <ops>: if ...;` statement in a block (statements end at `;`). */
function allow(text: string, ops: string): string {
  const m = text.match(new RegExp(`allow ${ops}: if [^;]*;`))
  if (!m) throw new Error(`no "allow ${ops}"`)
  return m[0].replace(/\s+/g, ' ')
}

/** The block's own text, without its nested match blocks. */
function ownText(text: string): string {
  let out = text
  const inner = /match (\/\S+) \{/g
  inner.lastIndex = 1
  let m: RegExpExecArray | null
  while ((m = inner.exec(out))) {
    const nested = block(m[1], out.slice(m.index))
    out = out.slice(0, m.index) + out.slice(m.index + nested.length)
    inner.lastIndex = m.index
  }
  return out
}

describe('firestore.rules: legacy collections', () => {
  it('declares every legacy path', () => {
    for (const header of [
      '/legacyLinks/{linkId}',
      '/legacySecrets/{linkId}',
      '/legacyAttempts/{linkId}',
      '/userDirectory/{email}',
      '/legacy/settings',
      '/legacy/beacon',
      '/legacy/profile',
      '/legacy/voice',
    ]) {
      expect(rules).toContain(`match ${header} {`)
    }
    expect(rules).toContain('match /legacyChats/{ownerUid}')
  })

  it('never lets anyone read a secret', () => {
    const secrets = block('/legacySecrets/{linkId}')
    expect(secrets).toContain('allow read: if false')
    expect(secrets).not.toMatch(/allow (get|list)/)
    expect(secrets).toContain("matches('^[0-9a-f]{64}$')")
  })

  it('computes release live from lastActiveAt and the minute setting', () => {
    const released = fn('released')
    expect(released).toContain('duration.value(')
    expect(released).toContain("'m')")
    expect(released).toContain('lastActiveAt')
    expect(released).toContain('enabled == true')
  })

  it('caps releaseAfterMinutes to the same range as the app', () => {
    const settings = block('/legacy/settings')
    expect(settings).toContain(`releaseAfterMinutes >= ${DEMO_MINUTES}`)
    expect(settings).toContain(`releaseAfterMinutes <= ${MAX_RELEASE_MINUTES}`)
    expect(rules).toContain('1051200')
    expect(settings).toContain('lastActiveAt == request.time')
  })

  it('only verified emails can claim a directory entry, which cannot be listed', () => {
    const dir = block('/userDirectory/{email}')
    expect(dir).toContain('email_verified == true')
    expect(dir).toContain('request.auth.token.email.lower() == email')
    expect(dir).toContain('uid == request.auth.uid')
    expect(dir).toMatch(/allow get: if/)
    expect(dir).not.toMatch(/allow (read|list)/)
  })

  it('limits guesses with the same numbers as the app', () => {
    const attempts = block('/legacyAttempts/{linkId}')
    expect(attempts).toContain(`count <= ${MAX_TRIES}`)
    expect(attempts).toContain(`duration.value(${TRY_WINDOW_MS / 1000}, 's')`)
    expect(attempts).toContain('lastAt == request.time')
    expect(attempts).toContain('.data.answerHash')
    expect(attempts).toContain('released(')
    expect(attempts).toContain("status == 'accepted'")
  })

  it('link shared kinds are exactly the app kinds', () => {
    const links = block('/legacyLinks/{linkId}')
    const list = links.match(/shared\.hasOnly\(\[([^\]]*)\]\)/)
    expect(list).not.toBeNull()
    const kinds = [...list![1].matchAll(/'([^']*)'/g)].map(m => m[1])
    expect(kinds).toEqual([...LEGACY_KINDS])
    expect(links).toContain("status == 'pending'")
    expect(links).toContain("ownerUid + '_' + ")
  })

  it('unlocked needs an accepted link, a release and a correct answer', () => {
    const unlocked = fn('unlocked')
    expect(unlocked).toContain("status == 'accepted'")
    expect(unlocked).toContain('released(owner)')
    expect(unlocked).toContain('correct == true')
  })

  it('only gets the four legacy docs (link, settings, attempts, secret)', () => {
    const code = rules.replace(/\/\/.*$/gm, '')
    const paths = [...code.matchAll(/\b(?:get|exists)\(([^\n]*)/g)].map(m => m[1])
    expect(paths.length).toBeGreaterThan(0)
    for (const p of paths) {
      expect(p).toMatch(/legacyLinks|legacy\/settings|legacyAttempts|legacySecrets|linkPath|attemptsPath|settingsPath/)
    }
  })
})

describe('firestore.rules: shared reads', () => {
  const sharedBy: Record<string, string> = {
    '/notes/{id}': 'notes',
    '/goals/{id}': 'goals',
    '/healthLogs/{date}': 'health',
    '/meals/{id}': 'health',
  }

  it.each(Object.entries(sharedBy))('%s is readable by an unlocked inheritor sharing %s', (header, kind) => {
    const b = block(header)
    expect(allow(b, 'read')).toBe(`allow read: if isOwner(uid) || (unlocked(uid) && shares(uid, '${kind}'));`)
    expect(allow(b, 'delete')).toBe('allow delete: if isOwner(uid);')
  })

  it('diary pages are shared, their raw messages are not', () => {
    const pages = ownText(block('/diaryPages/{pageId}'))
    expect(allow(pages, 'read')).toBe("allow read: if isOwner(uid) || (unlocked(uid) && shares(uid, 'diary'));")
    expect(allow(pages, 'delete')).toBe('allow delete: if isOwner(uid);')
    const messages = block('/messages/{id}', block('/diaryPages/{pageId}'))
    expect(allow(messages, 'read, delete')).toBe('allow read, delete: if isOwner(uid);')
    expect(messages).not.toContain('unlocked')
  })

  it('every memory type of every kind appears in the memories read rule with its kind', () => {
    const read = allow(block('/memories/{id}'), 'read')
    expect(read.startsWith('allow read: if isOwner(uid) || (unlocked(uid) && (')).toBe(true)
    for (const kind of LEGACY_KINDS) {
      const types = MEMORY_TYPES_BY_KIND[kind]
      if (types.length === 0) {
        expect(read).not.toContain(`shares(uid, '${kind}')`)
        continue
      }
      const list = types.map(t => `'${t}'`).join(', ')
      expect(read).toContain(`(resource.data.type in [${list}] && shares(uid, '${kind}'))`)
    }
  })

  it('owner-only collections stay owner-only', () => {
    for (const header of ['/reminders/{id}', '/routines/{id}', '/connectors/{provider}']) {
      expect(allow(block(header), 'read, delete')).toBe('allow read, delete: if isOwner(uid);')
    }
    expect(allow(ownText(block('/users/{uid}')), 'read, delete')).toBe('allow read, delete: if isOwner(uid);')
  })

  it('profile and voice open to unlocked inheritors regardless of shared kinds', () => {
    for (const header of ['/legacy/profile', '/legacy/voice']) {
      expect(allow(block(header), 'read')).toBe('allow read: if isOwner(uid) || unlocked(uid);')
    }
    expect(allow(block('/legacy/beacon'), 'read')).toContain("linkFor(uid).data.status == 'accepted' && released(uid)")
    expect(allow(block('/legacy/settings'), 'read, delete')).toBe('allow read, delete: if isOwner(uid);')
  })

  it('legacy chat history lives only in the inheritor own space', () => {
    const chat = block('/legacyChats/{ownerUid}/messages/{id}')
    expect(allow(chat, 'read, delete')).toBe('allow read, delete: if isOwner(uid);')
    expect(chat).toContain('isString(d.text, 4000)')
    expect(chat).toContain('createdAt == request.time')
    expect(chat).not.toContain('allow update')
  })
})
