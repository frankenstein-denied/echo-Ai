import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('@/lib/firestore', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/firestore')>()), addPageMessage: vi.fn(async () => 'm1') }))

import { addPageMessage } from '@/lib/firestore'
import { saveReply } from './client'

describe('saveReply sources', () => {
  beforeEach(() => vi.mocked(addPageMessage).mockClear())

  it('forwards safe sources and drops unsafe ones', async () => {
    await saveReply('u', 'p', 'hi', 'general', [
      { title: 'Good', url: 'https://example.com/a' },
      { title: 'Bad', url: 'javascript:alert(1)' },
    ])
    expect(addPageMessage).toHaveBeenCalledWith('u', 'p', 'assistant', 'hi', 'general', [{ title: 'Good', url: 'https://example.com/a' }])
  })
  it('passes undefined when there are no sources', async () => {
    await saveReply('u', 'p', 'hi', 'general')
    expect(addPageMessage).toHaveBeenCalledWith('u', 'p', 'assistant', 'hi', 'general', undefined)
  })
})
