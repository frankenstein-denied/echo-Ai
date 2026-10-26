import { describe, expect, it } from 'vitest'
import { tavilySearch, TavilyError } from './tavily'

type Seen = { method: string; headers: Headers; body: { method: string; id?: number; params?: unknown } }

const sse = (msg: unknown) =>
  new Response(`event: message\ndata: ${JSON.stringify(msg)}\n\n`, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
const toolResult = (payload: unknown, isError = false) => ({
  jsonrpc: '2.0',
  id: 2,
  result: { content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) }], ...(isError ? { isError: true } : {}) },
})

/** Fake MCP server: answers initialize, accepts the notification, and replies to tools/call with `call()`. */
function fakeMcp(call: () => Response | Promise<Response>, init?: () => Response) {
  const seen: Seen[] = []
  const f = (async (_url: string, req: RequestInit) => {
    const body = JSON.parse(String(req.body))
    seen.push({ method: body.method, headers: new Headers(req.headers), body })
    if (body.method === 'initialize') {
      if (init) return init()
      const res = sse({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'tavily-mcp', version: '4.1.0' } } })
      res.headers.set('mcp-session-id', 'sess-1')
      return res
    }
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 })
    return call()
  }) as unknown as typeof fetch
  return { f, seen }
}

describe('tavilySearch', () => {
  it('speaks MCP (initialize, initialized, tools/call tavily_search) and maps results', async () => {
    const long = 'x'.repeat(2000)
    const { f, seen } = fakeMcp(() =>
      sse(
        toolResult({
          query: 'q',
          answer: null,
          results: [
            { url: 'https://a.example/1', title: ' A ', content: ' first ', score: 0.9 },
            { url: 'javascript:alert(1)', title: 'bad', content: 'bad', score: 0.8 },
            { url: 'ftp://files.example', title: 'ftp', content: 'ftp', score: 0.7 },
            { url: 'http://b.example/2', title: 'B', content: long, score: 0.6 },
          ],
        }),
      ),
    )
    const out = await tavilySearch('acc-token', 'what is new', { fetch: f })
    expect(out).toEqual([
      { title: 'A', url: 'https://a.example/1', content: 'first' },
      { title: 'B', url: 'http://b.example/2', content: 'x'.repeat(800) },
    ])
    expect(seen.map((s) => s.method)).toEqual(['initialize', 'notifications/initialized', 'tools/call'])
    expect(seen[0].body.params).toEqual({ protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'echo', version: '1' } })
    expect(seen[1].body.id).toBeUndefined()
    expect(seen[2].body.params).toEqual({ name: 'tavily_search', arguments: { query: 'what is new', max_results: 5, search_depth: 'basic', topic: 'general' } })
    for (const s of seen) {
      expect(s.headers.get('authorization')).toBe('Bearer acc-token')
      expect(s.headers.get('accept')).toBe('application/json, text/event-stream')
      expect(s.headers.get('content-type')).toBe('application/json')
      expect(s.headers.get('mcp-protocol-version')).toBe('2025-06-18')
    }
    expect(seen[0].headers.get('mcp-session-id')).toBeNull()
    expect(seen[1].headers.get('mcp-session-id')).toBe('sess-1')
    expect(seen[2].headers.get('mcp-session-id')).toBe('sess-1')
  })

  it('accepts plain JSON responses', async () => {
    const { f } = fakeMcp(() => Response.json(toolResult({ results: [{ url: 'https://c.example', title: 'C', content: 'c' }] })))
    await expect(tavilySearch('t', 'q', { fetch: f })).resolves.toEqual([{ title: 'C', url: 'https://c.example', content: 'c' }])
  })

  it('maps HTTP 401 to auth', async () => {
    const { f } = fakeMcp(
      () => sse({}),
      () => new Response('unauthorized', { status: 401 }),
    )
    const err = await tavilySearch('t', 'q', { fetch: f }).catch((e) => e)
    expect(err).toBeInstanceOf(TavilyError)
    expect(err.kind).toBe('auth')
  })

  it('maps a quota tool error to quota and other tool errors to failed', async () => {
    const quota = fakeMcp(() => sse(toolResult('Tavily API error: This request exceeds your plan\'s set usage limit. Please upgrade your plan', true)))
    await expect(tavilySearch('t', 'q', { fetch: quota.f })).rejects.toMatchObject({ kind: 'quota' })
    const other = fakeMcp(() => sse(toolResult('Something broke', true)))
    await expect(tavilySearch('t', 'q', { fetch: other.f })).rejects.toMatchObject({ kind: 'failed' })
  })

  it('maps garbage and JSON-RPC errors to failed', async () => {
    const garbage = fakeMcp(() => new Response('data: not json\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    await expect(tavilySearch('t', 'q', { fetch: garbage.f })).rejects.toMatchObject({ kind: 'failed' })
    const rpc = fakeMcp(() => sse({ jsonrpc: '2.0', id: 2, error: { code: -32602, message: 'bad' } }))
    await expect(tavilySearch('t', 'q', { fetch: rpc.f })).rejects.toMatchObject({ kind: 'failed' })
  })

  it('times out as failed', async () => {
    const hang = (async (_url: string, req: RequestInit) =>
      new Promise<Response>((_, reject) => {
        req.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })) as unknown as typeof fetch
    await expect(tavilySearch('t', 'q', { fetch: hang, timeoutMs: 20 })).rejects.toMatchObject({ kind: 'failed' })
  })
})
