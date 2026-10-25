import { describe, expect, it } from 'vitest'
import { buildGraph, filterGraph, neighbours, nodeRadius, relativeTime, searchNodes, typeCounts } from './graph'

const docs = [
  { id: 'person-mama', label: 'Mama', type: 'person', links: ['topic-thesis', 'ghost'], mentions: 4, createdMs: 100, lastSeenMs: 500 },
  { id: 'topic-thesis', label: 'Thesis', type: 'topic', links: ['person-mama'], mentions: 9 },
  { id: 'goal-run', label: 'Run', type: 'goal', links: [], createdMs: 50 },
  { id: 'diary-x', label: 'Diary', type: 'diary', links: ['goal-run'] },
]

describe('graph', () => {
  it('buildGraph dedupes undirected edges, drops missing targets, defaults mentions/lastSeen', () => {
    const g = buildGraph(docs)
    expect(g.nodes).toHaveLength(4)
    expect(g.edges).toHaveLength(2)
    const run = g.nodes.find((n) => n.id === 'goal-run')!
    expect(run.mentions).toBe(1)
    expect(run.lastSeenMs).toBe(50)
  })
  it('nodeRadius clamps', () => {
    expect(nodeRadius(1)).toBe(9)
    expect(nodeRadius(0)).toBe(9)
    expect(nodeRadius(10000)).toBe(22)
  })
  it('filterGraph type + direct neighbours', () => {
    const g = buildGraph(docs)
    const f = filterGraph(g, 'person')
    expect([...f.visible].sort()).toEqual(['person-mama', 'topic-thesis'])
    expect(f.edges.size).toBe(1)
    expect(filterGraph(g, 'all').visible.size).toBe(4)
    expect(neighbours(g, 'diary-x')).toEqual(['goal-run'])
    expect(typeCounts(g).person).toBe(1)
  })
  it('searchNodes matches case-insensitively, prefix first', () => {
    const g = buildGraph([...docs, { id: 'topic-a', label: 'The Thesis', type: 'topic' }])
    expect(searchNodes(g.nodes, 'thes').map((n) => n.id)).toEqual(['topic-thesis', 'topic-a'])
    expect(searchNodes(g.nodes, ' ')).toEqual([])
  })
  it('relativeTime', () => {
    expect(relativeTime(0)).toBe('unknown')
    expect(relativeTime(1000, 1000 + 3 * 3600000)).toBe('3 h ago')
  })
})
