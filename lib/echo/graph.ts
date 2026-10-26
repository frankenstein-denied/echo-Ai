// Pure graph helpers for the 2nd Brain view (no Firebase / DOM imports so they are unit-testable).

export const NODE_TYPES = ['person', 'topic', 'interest', 'goal', 'health', 'task', 'diary', 'connector'] as const
export type GraphNodeType = (typeof NODE_TYPES)[number]

export type MemoryDoc = {
  id: string
  label?: string
  type?: string
  links?: string[]
  mentions?: number
  createdMs?: number
  lastSeenMs?: number
  pages?: string[]
}

export type GraphNode = { id: string; label: string; type: GraphNodeType; mentions: number; lastSeenMs: number; radius: number }
export type GraphEdge = { source: string; target: string }
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] }

export const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export function nodeRadius(mentions: number): number {
  const m = Number.isFinite(mentions) ? Math.max(1, mentions) : 1
  return Math.min(22, Math.max(6, 6 + 3 * Math.sqrt(m)))
}

const isType = (t: unknown): t is GraphNodeType => NODE_TYPES.includes(t as GraphNodeType)

export type PageDoc = { id: string; title: string; lastMessageMs?: number }

export const PAGE_PREFIX = 'page-'
export const isPageNodeId = (id: string) => id.startsWith(PAGE_PREFIX)

export function buildGraph(docs: MemoryDoc[], pages: PageDoc[] = []): Graph {
  const nodes: GraphNode[] = []
  const ids = new Set<string>()
  for (const d of docs) {
    if (ids.has(d.id)) continue
    ids.add(d.id)
    const mentions = typeof d.mentions === 'number' && d.mentions >= 1 ? d.mentions : 1
    const created = d.createdMs ?? 0
    nodes.push({
      id: d.id,
      label: d.label?.trim() || d.id,
      type: isType(d.type) ? d.type : 'topic',
      mentions,
      lastSeenMs: d.lastSeenMs ?? created,
      radius: nodeRadius(mentions),
    })
  }
  const seen = new Set<string>()
  const edges: GraphEdge[] = []
  for (const d of docs) {
    for (const l of d.links ?? []) {
      if (l === d.id || !ids.has(l) || !ids.has(d.id)) continue
      const k = edgeKey(d.id, l)
      if (seen.has(k)) continue
      seen.add(k)
      edges.push({ source: d.id, target: l })
    }
  }
  const pageById = new Map(pages.map((p) => [p.id, p]))
  const linked = new Map<string, string[]>()
  for (const d of docs) {
    if (!ids.has(d.id)) continue
    for (const pid of new Set(d.pages ?? [])) {
      if (!pageById.has(pid)) continue
      linked.set(pid, [...(linked.get(pid) ?? []), d.id])
    }
  }
  for (const [pid, memIds] of linked) {
    const p = pageById.get(pid)!
    const id = PAGE_PREFIX + pid
    if (ids.has(id)) continue
    ids.add(id)
    nodes.push({ id, label: p.title?.trim() || 'Untitled page', type: 'diary', mentions: memIds.length, lastSeenMs: p.lastMessageMs ?? 0, radius: nodeRadius(memIds.length) })
    for (const m of memIds) edges.push({ source: id, target: m })
  }
  return { nodes, edges }
}

export function neighbours(graph: Graph, id: string): string[] {
  const out = new Set<string>()
  for (const e of graph.edges) {
    if (e.source === id) out.add(e.target)
    else if (e.target === id) out.add(e.source)
  }
  return [...out]
}

export function typeCounts(graph: Graph): Partial<Record<GraphNodeType, number>> {
  const c: Partial<Record<GraphNodeType, number>> = {}
  for (const n of graph.nodes) c[n.type] = (c[n.type] ?? 0) + 1
  return c
}

/** 'all' shows everything; a type shows that type's nodes plus their direct neighbours. Highlighted edges join two visible nodes. */
export function filterGraph(graph: Graph, filter: 'all' | GraphNodeType): { visible: Set<string>; edges: Set<string> } {
  if (filter === 'all') return { visible: new Set(graph.nodes.map((n) => n.id)), edges: new Set(graph.edges.map((e) => edgeKey(e.source, e.target))) }
  const visible = new Set<string>()
  for (const n of graph.nodes) if (n.type === filter) visible.add(n.id)
  const core = new Set(visible)
  for (const e of graph.edges) {
    if (core.has(e.source)) visible.add(e.target)
    if (core.has(e.target)) visible.add(e.source)
  }
  const edges = new Set<string>()
  for (const e of graph.edges) if (visible.has(e.source) && visible.has(e.target)) edges.add(edgeKey(e.source, e.target))
  return { visible, edges }
}

export function searchNodes(nodes: GraphNode[], q: string): GraphNode[] {
  const s = q.trim().toLowerCase()
  if (!s) return []
  const hits = nodes.filter((n) => n.label.toLowerCase().includes(s))
  return hits.sort((a, b) => Number(b.label.toLowerCase().startsWith(s)) - Number(a.label.toLowerCase().startsWith(s)) || b.mentions - a.mentions)
}

export function relativeTime(ms: number, now: number = Date.now()): string {
  if (!ms) return 'unknown'
  const diff = Math.max(0, now - ms)
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} d ago`
  const mo = Math.floor(d / 30)
  return mo < 12 ? `${mo} mo ago` : `${Math.floor(d / 365)} y ago`
}
