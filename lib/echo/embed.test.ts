import { describe, expect, it } from 'vitest'
import { parseEmbedMode } from './embed'

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
