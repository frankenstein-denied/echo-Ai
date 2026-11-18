import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLAYLIST_LIMITS } from './playlists'

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

describe('firestore.rules: playlists', () => {
  const b = block('/playlists/{id}')
  it('is owner-only with exact fields and the app limits', () => {
    expect(b).toContain("d.keys().hasOnly(['name', 'tracks', 'createdAt', 'updatedAt'])")
    expect(b).toContain(`isString(d.name, ${PLAYLIST_LIMITS.name})`)
    expect(b).toContain(`d.tracks.size() <= ${PLAYLIST_LIMITS.tracks}`)
    expect(b).toContain('allow read, delete: if isOwner(uid);')
    expect(b).toContain('createStamps(request.resource.data)')
    expect(b).toContain('updateStamps(request.resource.data)')
    expect(b).not.toContain('unlocked(')
  })
})

describe('firestore.rules: listens', () => {
  const b = block('/listens/{id}')
  it('is owner-only, created as playing at server time, and only the outcome changes later', () => {
    expect(b).toContain("d.keys().hasOnly(['videoId', 'title', 'channel', 'startedAt', 'outcome', 'listenedSec'])")
    expect(b).toContain("d.videoId.matches('^[A-Za-z0-9_-]{11}$')")
    expect(b).toContain("request.resource.data.outcome == 'playing'")
    expect(b).toContain('request.resource.data.startedAt == request.time')
    expect(b).toContain('request.resource.data.startedAt == resource.data.startedAt')
    expect(b).toContain('allow read, delete: if isOwner(uid);')
  })
})
