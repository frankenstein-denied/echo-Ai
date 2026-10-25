import { describe, expect, it, vi } from 'vitest'
import { CONFIRM_WITHIN_MS, executeToolCalls, LIVE_TOOL_DECLARATIONS, LIVE_TOOL_NAMES, mapToolCall, type ToolContext } from './live-tools'

const ctx = (): ToolContext => ({ clientTime: '2026-10-25T14:00:00+08:00', checkInTime: '09:00', memoryLabels: [{ label: 'Mama', type: 'person' }] })

describe('LIVE_TOOL_DECLARATIONS', () => {
  it('declares the write and read tools and no connector tool', () => {
    expect(LIVE_TOOL_DECLARATIONS.map((d) => d.name)).toEqual([...LIVE_TOOL_NAMES])
    expect(LIVE_TOOL_DECLARATIONS.some((d) => /connector/i.test(d.name ?? ''))).toBe(false)
    const reminder = LIVE_TOOL_DECLARATIONS.find((d) => d.name === 'add_reminder')
    expect(reminder?.parameters?.required).toEqual(['title', 'dueAt'])
  })
})

describe('mapToolCall', () => {
  it('maps add_reminder through the router sanitizer (time with offset, past -> tomorrow)', () => {
    const r = mapToolCall('add_reminder', { title: ' Call Mama ', dueAt: '2026-10-25T20:30:00+08:00' }, ctx())
    expect(r).toEqual({ ok: true, response: { reply: '', actions: [{ type: 'reminder', title: 'Call Mama', dueAt: '2026-10-25T20:30:00+08:00' }], memories: [], trace: [] } })
    const past = mapToolCall('add_reminder', { title: 'Stretch', dueAt: '2026-10-25T08:00:00+08:00' }, ctx())
    expect(past.ok && past.response.actions[0]).toMatchObject({ dueAt: '2026-10-26T08:00:00+08:00' })
    const fuzzy = mapToolCall('add_reminder', { title: 'Walk', dueAt: '2026-10-26', fuzzyTime: 'evening' }, ctx())
    expect(fuzzy.ok && fuzzy.response.actions[0]).toMatchObject({ dueAt: '2026-10-26T20:00:00+08:00' })
  })
  it('rejects reminders without a usable time and unknown tools', () => {
    expect(mapToolCall('add_reminder', { title: 'Call' }, ctx())).toEqual({ ok: false, error: 'could not tell when to remind' })
    expect(mapToolCall('connect_calendar', {}, ctx()).ok).toBe(false)
    expect(mapToolCall(undefined, null, ctx()).ok).toBe(false)
  })
  it('maps note, goal and health with the router caps and defaults', () => {
    const note = mapToolCall('save_note', { title: 'Rough day', body: 'Felt ignored', tags: ['Work', 'work'] }, ctx())
    expect(note.ok && note.response.actions[0]).toEqual({ type: 'note', title: 'Rough day', body: 'Felt ignored', category: 'Diary', tags: ['work'] })
    const goal = mapToolCall('add_goal', { title: 'Half marathon', category: 'Health', targetDate: '2027-02-30' }, ctx())
    expect(goal.ok && goal.response.actions[0]).toEqual({ type: 'goal', title: 'Half marathon', category: 'Health' })
    const health = mapToolCall('log_health', { sleepMinutes: 360, mood: 14, energy: 'low' }, ctx())
    expect(health.ok && health.response.actions[0]).toEqual({ type: 'health', date: '2026-10-25', sleepMinutes: 360, mood: 10, energy: 'low' })
    expect(mapToolCall('log_health', { date: '2026-10-25' }, ctx())).toEqual({ ok: false, error: 'no valid measurement' })
    expect(mapToolCall('save_note', { title: 'x' }, ctx())).toEqual({ ok: false, error: 'missing required fields' })
  })
  it('maps save_memories and resolves links against known labels', () => {
    const r = mapToolCall('save_memories', { memories: [{ label: 'Running', type: 'interest', links: [{ label: 'Mama', type: 'person' }, { label: 'Ghost', type: 'topic' }] }] }, ctx())
    expect(r.ok && r.response.memories).toEqual([{ label: 'Running', type: 'interest', linkIds: ['person-mama'] }])
    expect(mapToolCall('save_memories', { memories: [{ label: '', type: 'bogus' }] }, ctx()).ok).toBe(false)
  })
})

describe('executeToolCalls', () => {
  it('answers every call in order with ok/error and collects saved items', async () => {
    const apply = vi.fn(async (res: { actions: { type: string; title?: string }[] }) => {
      const a = res.actions[0]
      if (a?.title === 'Boom') return { saved: [], failed: ['goal: Boom'] }
      return a ? { saved: [{ type: a.type as 'reminder', label: a.title ?? '' }], failed: [] } : { saved: [{ type: 'memory' as const, label: '2nd Brain memories' }], failed: [] }
    })
    const c = ctx()
    const out = await executeToolCalls(
      [
        { id: '1', name: 'add_reminder', args: { title: 'Call Mama', dueAt: '2026-10-25T20:30:00+08:00' } },
        { id: '2', name: 'add_goal', args: { title: 'Boom', category: 'x' } },
        { id: '3', name: 'add_reminder', args: { title: 'No time' } },
        { id: '4', name: 'save_memories', args: { memories: [{ label: 'Swimming', type: 'interest' }] } },
      ],
      c,
      apply as never,
    )
    expect(out.responses.map((r) => r.id)).toEqual(['1', '2', '3', '4'])
    expect(out.responses[0].response.output).toMatchObject({ ok: true, saved: 'reminder', title: 'Call Mama', dueAt: '2026-10-25T20:30:00+08:00' })
    expect(out.responses[1].response).toEqual({ error: 'could not save' })
    expect(out.responses[2].response).toEqual({ error: 'could not tell when to remind' })
    expect(out.responses[3].response.output).toMatchObject({ ok: true, saved: 'memories', labels: ['Swimming'] })
    // Actions are confirmed before answering; memories answer 'saving' at once and report through late.
    expect(out.responses[3].response.output).toMatchObject({ status: 'saving' })
    expect(out.saved).toEqual([{ type: 'reminder', label: 'Call Mama', callId: '1' }])
    expect(out.failed).toEqual(['goal: Boom'])
    expect(await out.late).toEqual({ saved: [{ type: 'memory', label: '2nd Brain memories', callId: '4' }], failed: [] })
    expect(c.memoryLabels).toContainEqual({ label: 'Swimming', type: 'interest' })
  })
  it('answers a write not acknowledged in the window as saving (memories too) and reports the outcome through late', async () => {
    const finishers: ((v: { saved: { type: 'reminder'; label: string }[]; failed: string[] }) => void)[] = []
    const slow = () => new Promise<{ saved: { type: 'reminder'; label: string }[]; failed: string[] }>((res) => finishers.push(res))
    const out = await executeToolCalls(
      [
        { id: 's', name: 'add_reminder', args: { title: 'Call', dueAt: '2026-10-25T20:30:00+08:00' } },
        { id: 'm', name: 'save_memories', args: { memories: [{ label: 'Swimming', type: 'interest' }] } },
      ],
      ctx(),
      slow as never,
      { confirmWithinMs: 10 },
    )
    expect(out.responses[0].response.output).toMatchObject({ ok: true, status: 'saving', saved: 'reminder' })
    expect(out.responses[1].response.output).toMatchObject({ ok: true, status: 'saving', saved: 'memories' })
    expect(out.saved).toEqual([])
    finishers[0]({ saved: [], failed: ['reminder: Call'] })
    finishers[1]({ saved: [{ type: 'reminder', label: 'x' }], failed: [] })
    expect(await out.late).toEqual({ saved: [{ type: 'reminder', label: 'x', callId: 'm' }], failed: ['reminder: Call'] })
  })
  it('never waits for a memory write and starts it after the action writes', async () => {
    const order: string[] = []
    const apply = async (res: { actions: { type: string }[] }) => {
      const kind = res.actions[0]?.type ?? 'memory'
      order.push(`start ${kind}`)
      await new Promise((r) => setTimeout(r, kind === 'memory' ? 50 : 5))
      order.push(`end ${kind}`)
      return kind === 'memory' ? { saved: [], failed: ['2nd Brain memories'] } : { saved: [{ type: 'reminder' as const, label: 'x' }], failed: [] }
    }
    const out = await executeToolCalls(
      [
        { id: 'm', name: 'save_memories', args: { memories: [{ label: 'Swimming', type: 'interest' }] } },
        { id: 'r', name: 'add_reminder', args: { title: 'Call', dueAt: '2026-10-25T20:30:00+08:00' } },
      ],
      ctx(),
      apply as never,
    )
    expect(order).toEqual(['start reminder', 'end reminder', 'start memory'])
    expect(out.responses[0].response.output).toMatchObject({ ok: true, status: 'saving', saved: 'memories' })
    expect(await out.late).toEqual({ saved: [], failed: ['2nd Brain memories'] })
  })
  it('defaults to a 2.5 s confirmation window', () => {
    expect(CONFIRM_WITHIN_MS).toBe(2500)
  })
  it('dispatches read tools to the reader with ok/error responses and no writes', async () => {
    const apply = vi.fn()
    const read = vi.fn(async (name: string) => {
      if (name === 'get_health') throw new Error('offline')
      return [{ title: 'Run' }]
    })
    const out = await executeToolCalls(
      [
        { id: 'r1', name: 'get_goals', args: {} },
        { id: 'r2', name: 'get_reminders', args: { range: 'today' } },
        { id: 'r3', name: 'get_health', args: { days: 3 } },
      ],
      ctx(),
      apply as never,
      { read: read as never },
    )
    expect(apply).not.toHaveBeenCalled()
    expect(read).toHaveBeenCalledWith('get_reminders', { range: 'today' })
    expect(out.responses[0].response).toEqual({ output: { count: 1, results: [{ title: 'Run' }] } })
    expect(out.responses[2].response).toEqual({ error: 'could not read that right now' })
    expect(out.saved).toEqual([])
    const noReader = await executeToolCalls([{ id: 'x', name: 'search_notes', args: {} }], ctx(), apply as never)
    expect(noReader.responses[0].response).toEqual({ error: 'reading is not available' })
  })
  it('turns a throwing write into an error response, never a rejection', async () => {
    const out = await executeToolCalls([{ id: 'x', name: 'save_note', args: { title: 't', body: 'b' } }], ctx(), async () => {
      throw new Error('offline')
    })
    expect(out.responses[0].response).toEqual({ error: 'could not save' })
    expect(out.failed).toEqual(['save_note'])
  })
})
