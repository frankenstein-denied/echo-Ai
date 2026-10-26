// Web search through Tavily's remote MCP server with the user's own OAuth access token. Speaks MCP JSON-RPC over
// Streamable HTTP with plain fetch (initialize -> notifications/initialized -> tools/call tavily_search); only the
// search tool is ever called. Never log the token or the query.
const MCP_URL = 'https://mcp.tavily.com/mcp'
const PROTOCOL_VERSION = '2025-06-18'
const MAX_RESULTS = 5
const MAX_CONTENT = 800
const DEFAULT_TIMEOUT_MS = 8000

export type WebResult = { title: string; url: string; content: string }

export class TavilyError extends Error {
  constructor(public kind: 'auth' | 'quota' | 'failed') {
    super(`Tavily search ${kind}`)
    this.name = 'TavilyError'
  }
}

const QUOTA_RE = /quota|usage limit|rate limit|credits?|exceed|upgrade your plan|too many requests/i

type RpcMessage = { id?: unknown; result?: { content?: { type?: string; text?: unknown }[]; isError?: boolean }; error?: { message?: unknown } }

/** First JSON-RPC response in a plain JSON or SSE body (data: lines of one event joined). */
async function readMessage(res: Response): Promise<RpcMessage> {
  const text = await res.text()
  if (!(res.headers.get('content-type') ?? '').includes('text/event-stream')) return JSON.parse(text) as RpcMessage
  for (const event of text.replace(/\r\n?/g, '\n').split('\n\n')) {
    const data = event
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).replace(/^ /, ''))
      .join('\n')
    if (!data) continue
    const msg = JSON.parse(data) as RpcMessage
    if (msg && ('result' in msg || 'error' in msg)) return msg
  }
  throw new Error('no response message')
}

function cleanUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' || u.protocol === 'http:' ? raw.trim() : null
  } catch {
    return null
  }
}

const clip = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '')

function mapResults(payload: unknown): WebResult[] {
  const results = payload && typeof payload === 'object' ? (payload as { results?: unknown }).results : null
  if (!Array.isArray(results)) throw new TavilyError('failed')
  const out: WebResult[] = []
  for (const r of results) {
    const url = cleanUrl((r as { url?: unknown })?.url)
    if (!url) continue
    out.push({ title: clip((r as { title?: unknown }).title, 200) || url, url, content: clip((r as { content?: unknown }).content, MAX_CONTENT) })
    if (out.length === MAX_RESULTS) break
  }
  return out
}

export async function tavilySearch(accessToken: string, query: string, opts: { timeoutMs?: number; fetch?: typeof fetch } = {}): Promise<WebResult[]> {
  const f = opts.fetch ?? fetch
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  let sessionId: string | null = null

  const post = async (body: object): Promise<Response> => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'mcp-protocol-version': PROTOCOL_VERSION,
    }
    if (sessionId) headers['mcp-session-id'] = sessionId
    const res = await f(MCP_URL, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal })
    if (res.status === 401 || res.status === 403) throw new TavilyError('auth')
    if (res.status === 429) throw new TavilyError('quota')
    if (!res.ok) throw new TavilyError('failed')
    return res
  }

  try {
    const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'echo', version: '1' } } })
    sessionId = init.headers.get('mcp-session-id')
    const initMsg = await readMessage(init)
    if (initMsg.error) throw new TavilyError('failed')
    await (await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).body?.cancel()

    const call = await post({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'tavily_search', arguments: { query, max_results: MAX_RESULTS, search_depth: 'basic', topic: 'general' } },
    })
    const msg = await readMessage(call)
    if (msg.error) throw new TavilyError(QUOTA_RE.test(String(msg.error.message ?? '')) ? 'quota' : 'failed')
    const text = msg.result?.content?.find((c) => c?.type === 'text')?.text
    if (msg.result?.isError) throw new TavilyError(QUOTA_RE.test(String(text ?? '')) ? 'quota' : 'failed')
    if (typeof text !== 'string') throw new TavilyError('failed')
    return mapResults(JSON.parse(text))
  } catch (err) {
    if (err instanceof TavilyError) throw err
    throw new TavilyError('failed')
  } finally {
    clearTimeout(timer)
  }
}
