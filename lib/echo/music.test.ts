import { describe, expect, it, vi } from 'vitest'
import { fetchVideoInfo, parseYoutubeLink, youtubeEmbedUrl, youtubeMusicUrl } from './music'

const res = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response

describe('urls', () => {
  it('builds embed and music urls', () => {
    expect(youtubeEmbedUrl('abc', true)).toBe('https://www.youtube-nocookie.com/embed/abc?autoplay=1')
    expect(youtubeEmbedUrl('abc', false)).toBe('https://www.youtube-nocookie.com/embed/abc?autoplay=0')
    expect(youtubeMusicUrl('abc')).toBe('https://music.youtube.com/watch?v=abc')
    // With the page origin the embed reports its state (used to play the next song when one ends).
    expect(youtubeEmbedUrl('abc', true, 'https://echo.app')).toBe('https://www.youtube-nocookie.com/embed/abc?autoplay=1&enablejsapi=1&origin=https%3A%2F%2Fecho.app')
  })
})

describe('parseYoutubeLink', () => {
  const ID = 'dQw4w9WgXcQ'
  it('accepts every YouTube and YouTube Music URL shape', () => {
    for (const url of [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}`,
      `http://m.youtube.com/watch?v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}&si=abc123`,
      `https://www.youtube.com/watch?feature=share&v=${ID}&t=42s`,
      `https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?si=xyz&t=10`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://m.youtube.com/shorts/${ID}?feature=share`,
      `https://www.youtube.com/embed/${ID}`,
      `https://youtube.com/embed/${ID}?autoplay=1`,
      `youtu.be/${ID}`,
      `music.youtube.com/watch?v=${ID}`,
    ]) {
      expect(parseYoutubeLink(url), url).toBe(ID)
    }
  })
  it('finds a link inside a message, with punctuation around it', () => {
    expect(parseYoutubeLink(`play this https://youtu.be/${ID} please`)).toBe(ID)
    expect(parseYoutubeLink(`Play (https://music.youtube.com/watch?v=${ID}).`)).toBe(ID)
    expect(parseYoutubeLink(`<https://www.youtube.com/watch?v=${ID}>`)).toBe(ID)
  })
  it('rejects junk and wrong-length IDs', () => {
    for (const t of ['', 'play lofi beats', 'https://', 'youtube', `https://www.youtube.com/watch?v=${ID}x`, 'https://www.youtube.com/watch?v=short', 'https://youtu.be/abc', `https://youtu.be/${ID}extra`, 'https://www.youtube.com/watch', `https://www.youtube.com/channel/${ID}`, `https://youtu.be/${ID.slice(0, 10)}!`, 'https://www.youtube.com/watch?v=dQw4w9WgXc$']) {
      expect(parseYoutubeLink(t), t).toBeNull()
    }
  })
  it('rejects non-YouTube hosts and look-alikes', () => {
    for (const t of [
      `https://vimeo.com/watch?v=${ID}`,
      `https://notyoutube.com/watch?v=${ID}`,
      `notyoutube.com/watch?v=${ID}`,
      `https://youtube.com.evil.example/watch?v=${ID}`,
      `https://youtube.com@evil.example/watch?v=${ID}`,
      `https://evil.example/?u=https://youtu.be`,
      `ftp://youtube.com/watch?v=${ID}`,
      `javascript:alert(1)//youtu.be/${ID}`,
    ]) {
      expect(parseYoutubeLink(t), t).toBeNull()
    }
  })
  it('ignores non-strings', () => {
    expect(parseYoutubeLink(undefined as unknown as string)).toBeNull()
  })
})

describe('fetchVideoInfo', () => {
  it('reads title and channel from YouTube oEmbed', async () => {
    const f = vi.fn(async () => res({ title: ' Never Gonna Give You Up ', author_name: 'Rick Astley' }))
    expect(await fetchVideoInfo('dQw4w9WgXcQ', f as never)).toEqual({ videoId: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', channel: 'Rick Astley' })
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&format=json')
  })
  it('falls back to a plain title when the lookup fails', async () => {
    expect(await fetchVideoInfo('dQw4w9WgXcQ', vi.fn(async () => res({}, 404)) as never)).toEqual({ videoId: 'dQw4w9WgXcQ', title: 'YouTube video' })
    expect(await fetchVideoInfo('dQw4w9WgXcQ', vi.fn(async () => Promise.reject(new Error('x'))) as never)).toEqual({ videoId: 'dQw4w9WgXcQ', title: 'YouTube video' })
  })
})
