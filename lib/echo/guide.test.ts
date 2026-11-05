import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ANDROID_LINK, GUIDE_SLIDES, INSTALL_NOTE, INSTALL_OPTIONS, INSTALL_SLIDE, MAX_GUIDE_SLIDES, WEB_LINK } from './guide'

describe('guide slides', () => {
  it('stays within the slide limit', () => {
    expect(GUIDE_SLIDES.length).toBeLessThanOrEqual(MAX_GUIDE_SLIDES)
  })

  it('explains the purpose straight after the welcome', () => {
    expect(GUIDE_SLIDES[0].id).toBe('welcome')
    expect(GUIDE_SLIDES[1].id).toBe('purpose')
    expect(GUIDE_SLIDES[1].avoid?.length).toBeGreaterThan(0)
  })

  it('points every image at a real file', () => {
    for (const s of GUIDE_SLIDES) {
      if (!s.image) continue
      expect(existsSync(join(process.cwd(), 'public', s.image))).toBe(true)
      expect(s.alt).toBeTruthy()
    }
  })

  it('ends on installing, with a link for every option', () => {
    expect(GUIDE_SLIDES[INSTALL_SLIDE].id).toBe('install')
    expect(INSTALL_SLIDE).toBe(GUIDE_SLIDES.length - 1)
    expect(WEB_LINK).toBe('https://echo-ai-blue.vercel.app')
    expect(ANDROID_LINK).toBe('https://github.com/frankenstein-denied/echo-Ai/releases/latest')
    expect(INSTALL_OPTIONS.map((o) => o.link)).toEqual([WEB_LINK, ANDROID_LINK])
    for (const browser of ['Chrome', 'Brave', 'Safari', 'Edge']) expect(INSTALL_NOTE).toContain(browser)
  })
})
