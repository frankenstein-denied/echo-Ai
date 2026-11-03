import { describe, expect, it } from 'vitest'
import { musicFragment, parseMusicFragment } from './music'

describe('music login fragment', () => {
  it('round-trips a Last.fm username, including odd characters', () => {
    for (const name of ['bob', 'a b&c=d#e', 'Ünï-çode']) {
      expect(parseMusicFragment(musicFragment('lastfm', name))).toEqual({ service: 'lastfm', username: name })
    }
  })
  it('rejects other fragments, bad services, empty and oversized names', () => {
    expect(parseMusicFragment('')).toBeNull()
    expect(parseMusicFragment('#web-search=abc')).toBeNull()
    expect(parseMusicFragment('#music=spotify:bob')).toBeNull()
    expect(parseMusicFragment('#music=lastfm:')).toBeNull()
    expect(parseMusicFragment('#music=lastfm:%E0%A4%A')).toBeNull()
    expect(parseMusicFragment(`#music=lastfm:${'a'.repeat(101)}`)).toBeNull()
  })
})
