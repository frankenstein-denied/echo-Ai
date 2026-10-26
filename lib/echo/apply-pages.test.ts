import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('@/lib/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/firestore')>()),
  upsertMemories: vi.fn(async () => undefined),
  addPageMessage: vi.fn(async () => 'm1'),
}))

import { upsertMemories } from '@/lib/firestore'
import { applyActions, applyEchoResponse } from './client'

const memories = [{ label: 'Alex', type: 'person' as const, linkIds: [] }]

describe('memories record their diary page', () => {
  beforeEach(() => vi.mocked(upsertMemories).mockClear())

  it('applyEchoResponse passes the page id to upsertMemories', async () => {
    await applyEchoResponse('u', 'page-1', { reply: 'ok', actions: [], memories, trace: [] })
    expect(upsertMemories).toHaveBeenCalledWith('u', memories, 'page-1')
  })
  it('applyActions passes opts.pageId (calls)', async () => {
    await applyActions('u', { actions: [], memories }, { pageId: 'page-2', source: 'call' })
    expect(upsertMemories).toHaveBeenCalledWith('u', memories, 'page-2')
  })
  it('applyActions resolves opts.getPageId lazily, only when there are memories', async () => {
    const getPageId = vi.fn(async () => 'page-3')
    await applyActions('u', { actions: [], memories: [] }, { getPageId })
    expect(getPageId).not.toHaveBeenCalled()
    await applyActions('u', { actions: [], memories }, { getPageId })
    expect(upsertMemories).toHaveBeenCalledWith('u', memories, 'page-3')
  })
})
