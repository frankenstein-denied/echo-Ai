import { describe, expect, it } from 'vitest'
import { embedCallStep, parseEmbedMode } from './embed'

describe('parseEmbedMode', () => {
  it('accepts chat and call', () => {
    expect(parseEmbedMode('?embed=chat')).toBe('chat')
    expect(parseEmbedMode('?embed=call&x=1')).toBe('call')
  })
  it('rejects anything else', () => {
    expect(parseEmbedMode('?embed=evil')).toBeNull()
    expect(parseEmbedMode('?view=Diary')).toBeNull()
    expect(parseEmbedMode('')).toBeNull()
  })
})

describe('embedCallStep', () => {
  const ready = { voiceEnabled: true, disabled: false, messagesLoaded: true, memoriesLoaded: true }
  it('waits for the voice prefs', () => {
    expect(embedCallStep({ ...ready, voiceEnabled: null })).toBe('wait')
  })
  it('waits for the page, the messages and the memories', () => {
    expect(embedCallStep({ ...ready, disabled: true })).toBe('wait')
    expect(embedCallStep({ ...ready, messagesLoaded: false })).toBe('wait')
    expect(embedCallStep({ ...ready, memoriesLoaded: false })).toBe('wait')
  })
  it('starts once everything is in', () => {
    expect(embedCallStep(ready)).toBe('start')
  })
  it('reports voice_off without waiting for anything else', () => {
    expect(embedCallStep({ voiceEnabled: false, disabled: true, messagesLoaded: false, memoriesLoaded: false })).toBe('voice_off')
  })
})
