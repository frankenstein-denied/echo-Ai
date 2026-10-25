'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { forceX, forceY, forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { Brain, Maximize2, Minus, Pin, PinOff, Plus, SlidersHorizontal, X } from 'lucide-react'
import { memoriesCol } from '@/lib/firestore'
import {
  buildGraph,
  edgeKey,
  filterGraph,
  neighbours,
  NODE_TYPES,
  relativeTime,
  searchNodes,
  typeCounts,
  type GraphNode,
  type GraphNodeType,
  type MemoryDoc,
} from '@/lib/echo/graph'
import { Badge, Button, Card, EmptyState, IconButton, Input, PageHeader, RadioGroup, Skeleton } from './ui'
import { Sheet } from './sheet'
import { useIsMobile } from './use-mobile'

type SimNode = GraphNode & SimulationNodeDatum
type Transform = { x: number; y: number; k: number }
type Sim = Simulation<SimNode, SimulationLinkDatum<SimNode>>

const TYPE_LABEL: Record<GraphNodeType, string> = {
  person: 'People',
  topic: 'Topics',
  interest: 'Interests',
  goal: 'Goals',
  health: 'Health',
  task: 'Tasks',
  diary: 'Diary',
  connector: 'Connectors',
}
const typeColor = (t: GraphNodeType) => `var(--color-node-${t})`
const MAX_TICKS = 400
const MIN_K = 0.2
const MAX_K = 4

export function BrainView({ uid }: { uid: string }) {
  const [docs, setDocs] = useState<MemoryDoc[] | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | GraphNodeType>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [filterSheet, setFilterSheet] = useState(false)
  const mobile = useIsMobile()
  const [tf, setTf] = useState<Transform>({ x: 0, y: 0, k: 1 })
  const [, setFrame] = useState(0)

  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const sizeRef = useRef({ w: 800, h: 560 })
  const tfRef = useRef(tf)
  tfRef.current = tf
  const simRef = useRef<Sim | null>(null)
  const wakeRef = useRef<() => void>(() => {})
  const nodesRef = useRef<Map<string, SimNode>>(new Map())
  const rafRef = useRef(0)
  const loopRef = useRef(0)
  const fittedRef = useRef(false)
  const userMovedRef = useRef(false)
  const lastTapRef = useRef<{ id: string; t: number } | null>(null)
  const dragRef = useRef<{ id: string; pointerId: number; moved: number; ox: number; oy: number; pinned: boolean } | null>(null)
  const panRef = useRef<{ x: number; y: number; moved: number } | null>(null)
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchRef = useRef<{ dist: number; k: number } | null>(null)

  useEffect(() => {
    return onSnapshot(
      memoriesCol(uid),
      (snap) => {
        setDocs(
          snap.docs.map((s) => {
            const d = s.data({ serverTimestamps: 'estimate' })
            return { id: s.id, label: d.label, type: d.type, links: d.links, mentions: d.mentions, createdMs: d.createdAt?.toMillis?.(), lastSeenMs: d.lastSeenAt?.toMillis?.() }
          }),
        )
        setError('')
      },
      () => setError('Could not load your memories.'),
    )
  }, [uid])

  const graph = useMemo(() => buildGraph(docs ?? []), [docs])
  const counts = useMemo(() => typeCounts(graph), [graph])
  const { visible, edges: litEdges } = useMemo(() => filterGraph(graph, filter), [graph, filter])
  const matches = useMemo(() => new Set(searchNodes(graph.nodes, search).map((n) => n.id)), [graph, search])
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph])

  const requestFrame = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      setFrame((f) => f + 1)
    })
  }, [])

  const fit = useCallback(() => {
    const ns = [...nodesRef.current.values()].filter((n) => n.x != null && n.y != null)
    const { w, h } = sizeRef.current
    if (!ns.length) return setTf({ x: w / 2, y: h / 2, k: 1 })
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const n of ns) {
      x0 = Math.min(x0, n.x! - n.radius)
      x1 = Math.max(x1, n.x! + n.radius)
      y0 = Math.min(y0, n.y! - n.radius)
      y1 = Math.max(y1, n.y! + n.radius)
    }
    const pad = 48
    const k = Math.min(MAX_K, Math.max(MIN_K, Math.min((w - pad * 2) / Math.max(1, x1 - x0), (h - pad * 2) / Math.max(1, y1 - y0), 1.5)))
    setTf({ k, x: w / 2 - ((x0 + x1) / 2) * k, y: h / 2 - ((y0 + y1) / 2) * k })
  }, [])

  // Size tracking (wrapRef only exists once the graph is shown)
  const hasGraph = graph.nodes.length > 0
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      sizeRef.current = { w: r.width, h: r.height }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasGraph])

  // Simulation: rebuilt only when the graph data changes; previous positions and pins are kept (reheat).
  useEffect(() => {
    const prev = nodesRef.current
    const next = new Map<string, SimNode>()
    graph.nodes.forEach((n, i) => {
      const old = prev.get(n.id)
      const angle = i * 2.4
      next.set(n.id, { ...n, x: old?.x ?? Math.cos(angle) * (30 + i * 4), y: old?.y ?? Math.sin(angle) * (30 + i * 4), vx: 0, vy: 0, fx: old?.fx ?? null, fy: old?.fy ?? null })
    })
    nodesRef.current = next
    const nodes = [...next.values()]
    if (!nodes.length) {
      fittedRef.current = false
      return
    }
    if (prev.size === 0 || nodes.length > prev.size * 2 + 5) fittedRef.current = false
    const links = graph.edges.map((e) => ({ source: e.source, target: e.target }))
    const sim: Sim = forceSimulation<SimNode>(nodes)
      .force('link', forceLink<SimNode, SimulationLinkDatum<SimNode>>(links).id((d) => d.id).distance(70).strength(0.6))
      .force('charge', forceManyBody<SimNode>().strength(-160))
      .force('collide', forceCollide<SimNode>().radius((d) => d.radius + 4))
      .force('center', forceCenter(0, 0))
      .force('x', forceX<SimNode>(0).strength(0.05))
      .force('y', forceY<SimNode>(0).strength(0.05))
      .alpha(prev.size ? 0.5 : 1)
      .stop()
    simRef.current = sim
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let budget = reduce ? 0 : MAX_TICKS
    const warm = reduce ? MAX_TICKS : 120
    for (let i = 0; i < warm && sim.alpha() > sim.alphaMin(); i++) {
      sim.tick()
      budget--
    }
    const needFit = !fittedRef.current
    if (needFit) fit()
    requestFrame()
    wakeRef.current = () => {}
    let stopped = false
    if (!reduce) {
      const loop = () => {
        if (stopped) return
        const dragging = !!dragRef.current
        if (budget <= 0 || (sim.alpha() <= sim.alphaMin() && !dragging)) {
          if (!fittedRef.current) {
            fittedRef.current = true
            if (!userMovedRef.current) fit()
          }
          requestFrame()
          return
        }
        sim.tick()
        budget--
        requestFrame()
        loopRef.current = requestAnimationFrame(loop)
      }
      loopRef.current = requestAnimationFrame(loop)
      wakeRef.current = () => {
        budget = Math.max(budget, 150)
        cancelAnimationFrame(loopRef.current)
        loopRef.current = requestAnimationFrame(loop)
      }
    } else {
      fittedRef.current = true
    }
    return () => {
      stopped = true
      sim.stop()
      cancelAnimationFrame(loopRef.current)
    }
  }, [graph, fit, requestFrame])

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    },
    [],
  )

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    userMovedRef.current = true
    const { w, h } = sizeRef.current
    const px = cx ?? w / 2
    const py = cy ?? h / 2
    setTf((t) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, t.k * factor))
      const f = k / t.k
      return { k, x: px - (px - t.x) * f, y: py - (py - t.y) * f }
    })
  }, [])

  // Wheel zoom must be a non-passive native listener so the page does not scroll.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(Math.exp(-(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1)) * 0.0015), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt, hasGraph])

  const centreOn = useCallback((id: string) => {
    const n = nodesRef.current.get(id)
    if (!n || n.x == null || n.y == null) return
    const { w, h } = sizeRef.current
    setTf((t) => ({ ...t, x: w / 2 - n.x! * t.k, y: h / 2 - n.y! * t.k }))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onBgDown = (e: React.PointerEvent) => {
    svgRef.current?.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, toLocal(e))
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: tfRef.current.k }
      panRef.current = null
    } else if (!dragRef.current) {
      panRef.current = { x: e.clientX, y: e.clientY, moved: 0 }
    }
  }
  const onNodeDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, toLocal(e))
    if (pointers.current.size > 1) return
    const n = nodesRef.current.get(id)
    dragRef.current = { id, pointerId: e.pointerId, moved: 0, ox: e.clientX, oy: e.clientY, pinned: !!n && n.fx != null }
    if (n) {
      n.fx = n.x
      n.fy = n.y
    }
  }
  const onMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, toLocal(e))
    if (pinchRef.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const pinch = pinchRef.current
      userMovedRef.current = true
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      setTf((t) => {
        const k = Math.min(MAX_K, Math.max(MIN_K, pinch.k * (d / Math.max(1, pinch.dist))))
        const f = k / t.k
        return { k, x: cx - (cx - t.x) * f, y: cy - (cy - t.y) * f }
      })
      return
    }
    const drag = dragRef.current
    if (drag) {
      if (e.pointerId !== drag.pointerId) return
      const n = nodesRef.current.get(drag.id)
      if (!n) return
      drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.ox, e.clientY - drag.oy))
      if (drag.moved < 3) return
      const p = toLocal(e)
      const t = tfRef.current
      n.x = n.fx = (p.x - t.x) / t.k
      n.y = n.fy = (p.y - t.y) / t.k
      if (simRef.current) simRef.current.alpha(Math.max(simRef.current.alpha(), 0.3))
      wakeRef.current()
      requestFrame()
      return
    }
    const pan = panRef.current
    if (pan) {
      const dx = e.clientX - pan.x
      const dy = e.clientY - pan.y
      pan.x = e.clientX
      pan.y = e.clientY
      pan.moved += Math.abs(dx) + Math.abs(dy)
      userMovedRef.current = true
      setTf((t) => ({ ...t, x: t.x + dx, y: t.y + dy }))
    }
  }
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchRef.current = null
    const drag = dragRef.current
    if (drag) {
      if (e.pointerId !== drag.pointerId) return
      const n = nodesRef.current.get(drag.id)
      if (drag.moved < 3) {
        // a click, not a drag: restore previous pin state
        if (n && !drag.pinned) {
          n.fx = null
          n.fy = null
        }
        if (e.type === 'pointerup') {
          const last = lastTapRef.current
          const now = Date.now()
          if (last && last.id === drag.id && now - last.t < 300) {
            releaseNode(drag.id)
            lastTapRef.current = null
          } else lastTapRef.current = { id: drag.id, t: now }
          setSelectedId(drag.id)
        }
      }
      dragRef.current = null
      wakeRef.current()
      requestFrame()
      return
    }
    const pan = panRef.current
    panRef.current = null
    if (pan && pan.moved < 4 && e.type === 'pointerup') setSelectedId(null)
  }
  const releaseNode = (id: string) => {
    const n = nodesRef.current.get(id)
    if (!n) return
    n.fx = null
    n.fy = null
    if (simRef.current) simRef.current.alpha(Math.max(simRef.current.alpha(), 0.3))
    wakeRef.current()
    requestFrame()
  }

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return
    const first = searchNodes(graph.nodes, search)[0]
    if (first) {
      setFilter('all')
      setSelectedId(first.id)
      centreOn(first.id)
    }
  }

  const options = useMemo(
    () => [
      { value: 'all', label: `All (${graph.nodes.length})` },
      ...NODE_TYPES.filter((t) => (counts[t] ?? 0) > 0).map((t) => ({ value: t, label: `${TYPE_LABEL[t]} (${counts[t]})`, swatch: typeColor(t) })),
    ],
    [graph, counts],
  )

  useEffect(() => {
    if (filter !== 'all' && !counts[filter]) setFilter('all')
  }, [counts, filter])

  const selected = selectedId ? byId.get(selectedId) ?? null : null
  const connected = selected ? neighbours(graph, selected.id).map((id) => byId.get(id)).filter((n): n is GraphNode => !!n) : []
  const selNeighbours = new Set(connected.map((c) => c.id))
  const searching = search.trim().length > 0

  const header = <PageHeader title="2nd Brain" description="Everything Echo remembers about you, and how it connects." />

  if (docs === null && !error) {
    return (
      <div>
        {header}
        <Skeleton className="h-[560px] w-full" />
      </div>
    )
  }
  if (error) {
    return (
      <div>
        {header}
        <p role="alert" className="text-sm text-danger">{error}</p>
      </div>
    )
  }
  if (!hasGraph) {
    return (
      <div>
        {header}
        <EmptyState icon={Brain} title="Nothing here yet" description="Chat with Echo and the people, goals and topics you mention will appear as a connected map." />
      </div>
    )
  }

  const present = NODE_TYPES.filter((t) => (counts[t] ?? 0) > 0)

  const filterControl = <RadioGroup label="Show" name="brain-filter" value={filter} onChange={(v) => setFilter(v as 'all' | GraphNodeType)} options={options} />
  const legend = (
    <>
      <h2 className="mb-2 text-sm font-medium text-foreground">Legend</h2>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {present.map((t) => (
          <li key={t} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2.5 rounded-full" style={{ background: typeColor(t) }} aria-hidden="true" />
            {TYPE_LABEL[t]}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">Bigger dots are mentioned more often.</p>
    </>
  )
  const details = selected ? (
    <>
      {nodesRef.current.get(selected.id)?.fx != null && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-2"><Pin size={16} aria-hidden="true" />Pinned in place</span>
          <Button variant="secondary" size="sm" icon={PinOff} onClick={() => releaseNode(selected.id)}>Release position</Button>
        </div>
      )}
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Mentions</dt>
          <dd className="text-foreground">{selected.mentions}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Last seen</dt>
          <dd className="text-foreground">{relativeTime(selected.lastSeenMs)}</dd>
        </div>
      </dl>
      <div>
        <h3 className="mb-1 text-sm font-medium text-foreground">Connected ({connected.length})</h3>
        {connected.length ? (
          <ul className="grid max-h-56 gap-1 overflow-y-auto">
            {connected.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setFilter('all')
                    setSelectedId(c.id)
                    centreOn(c.id)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-lg:min-h-11"
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: typeColor(c.type) }} aria-hidden="true" />
                  <span className="truncate">{c.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{c.type}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No connections yet.</p>
        )}
      </div>
    </>
  ) : null
  const filterLabel = filter === 'all' ? 'All' : TYPE_LABEL[filter]

  return (
    <div>
      {header}
      <div className="mb-4 max-w-sm max-lg:max-w-none">
        <Input
          label="Find a memory"
          type="search"
          placeholder="Search by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={onSearchKey}
          hint={searching ? `${matches.size} match${matches.size === 1 ? '' : 'es'}. Press Enter to jump to the first.` : undefined}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div ref={wrapRef} className="relative h-[560px] overflow-hidden rounded-xl border border-border bg-surface max-lg:h-[max(320px,calc(100dvh-var(--topbar-h)-var(--tabbar-h)-12.5rem))]">
          <svg
            ref={svgRef}
            className="size-full cursor-grab touch-none select-none"
            role="group"
            aria-label="Memory graph. Use Tab to move between memories and Enter to select."
            onPointerDown={onBgDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <g transform={`translate(${tf.x} ${tf.y}) scale(${tf.k})`}>
              {graph.edges.map((e) => {
                const a = nodesRef.current.get(e.source)
                const b = nodesRef.current.get(e.target)
                if (!a || !b) return null
                const lit = litEdges.has(edgeKey(e.source, e.target))
                const onSel = !!selected && (e.source === selected.id || e.target === selected.id)
                const stroke = onSel ? 'var(--color-primary)' : lit && filter !== 'all' ? 'var(--color-muted-foreground)' : 'var(--color-border-strong)'
                return <line key={`${e.source}|${e.target}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={(onSel ? 2 : 1) / tf.k} style={{ stroke }} opacity={lit ? 1 : 0.15} />
              })}
              {graph.nodes.map((gn) => {
                const n = nodesRef.current.get(gn.id)
                if (!n) return null
                const isVisible = visible.has(gn.id)
                const isSel = gn.id === selectedId
                const isHover = gn.id === hoverId
                const isMatch = searching && matches.has(gn.id)
                const showLabel = isVisible && (graph.nodes.length <= 40 || gn.radius >= 12 || isSel || isHover || isMatch || selNeighbours.has(gn.id) || tf.k >= 1.6)
                return (
                  <g
                    key={gn.id}
                    transform={`translate(${n.x ?? 0} ${n.y ?? 0})`}
                    opacity={isVisible ? (searching && !isMatch ? 0.45 : 1) : 0.15}
                    style={{ pointerEvents: isVisible ? 'auto' : 'none', cursor: dragRef.current?.id === gn.id ? 'grabbing' : 'grab', outline: 'none' }}
                    aria-hidden={isVisible ? undefined : true}
                    role="button"
                    tabIndex={isVisible ? 0 : -1}
                    aria-label={`${gn.label}, ${gn.type}, mentioned ${gn.mentions} time${gn.mentions === 1 ? '' : 's'}`}
                    aria-pressed={isSel}
                    onPointerDown={(e) => onNodeDown(e, gn.id)}
                    onPointerEnter={() => setHoverId(gn.id)}
                    onPointerLeave={() => setHoverId(null)}
                    onFocus={() => setHoverId(gn.id)}
                    onBlur={() => setHoverId(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedId(gn.id)
                      }
                    }}
                  >
                    {nodesRef.current.get(gn.id)?.fx != null && <circle r={gn.radius + 7} fill="none" strokeWidth={1.5} strokeDasharray="3 3" style={{ stroke: 'var(--color-muted-foreground)' }} />}
                    {(isSel || isMatch || isHover) && <circle r={gn.radius + 4} fill="none" strokeWidth={2} style={{ stroke: isSel ? 'var(--color-foreground)' : 'var(--color-primary)' }} />}
                    {/* Touch: invisible 44 px hit area around small dots. */}
                    {mobile && <circle r={Math.max(gn.radius, 22 / tf.k)} fill="transparent" />}
                    <circle r={gn.radius} strokeWidth={1.5} style={{ fill: typeColor(gn.type), stroke: 'var(--color-surface)' }} />
                    {showLabel && (
                      <text x={gn.radius + 6 / tf.k} y={4 / tf.k} fontSize={12 / tf.k} paintOrder="stroke" strokeWidth={3 / tf.k} style={{ fill: 'var(--color-foreground)', stroke: 'var(--color-surface)' }}>
                        {gn.label}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          </svg>
          <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-lg border border-border bg-surface-2 p-1">
            <IconButton icon={Plus} label="Zoom in" size="sm" onClick={() => zoomAt(1.3)} />
            <IconButton icon={Minus} label="Zoom out" size="sm" onClick={() => zoomAt(1 / 1.3)} />
            <IconButton icon={Maximize2} label="Fit to view" size="sm" onClick={fit} />
          </div>
          <Button variant="secondary" icon={SlidersHorizontal} className="absolute left-3 top-3 bg-surface-2 lg:hidden" aria-label="Filter and legend" aria-haspopup="dialog" aria-expanded={filterSheet} onClick={() => setFilterSheet(true)}>
            {filterLabel}
          </Button>
          <p className="pointer-events-none absolute bottom-3 left-3 text-xs text-muted-foreground max-lg:hidden">Drag nodes to arrange · double-tap or use Release position to unpin · drag the background to pan · scroll to zoom</p>
          <p className="pointer-events-none absolute inset-x-3 bottom-3 text-xs text-muted-foreground lg:hidden">Tap a dot for details · pinch to zoom · drag to pan</p>
        </div>
        <div className="grid content-start gap-4 max-lg:hidden">
          <Card as="div">{filterControl}</Card>
          {selected ? (
            <Card as="div" className="grid gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="break-words text-base font-semibold text-foreground">{selected.label}</h2>
                  <div className="mt-1">
                    <Badge type={selected.type}>{selected.type}</Badge>
                  </div>
                </div>
                <IconButton icon={X} label="Close details" size="sm" onClick={() => setSelectedId(null)} />
              </div>
              {details}
            </Card>
          ) : (
            <Card as="div">
              <p className="text-sm text-muted-foreground">Select a memory to see its details and connections.</p>
            </Card>
          )}
          <Card as="div">{legend}</Card>
        </div>
      </div>
      <Sheet open={mobile && filterSheet} onClose={() => setFilterSheet(false)} title="Filter and legend">
        <div className="grid gap-5 px-2 pb-2">
          {filterControl}
          <div>{legend}</div>
        </div>
      </Sheet>
      <Sheet open={mobile && !filterSheet && !!selected} onClose={() => setSelectedId(null)} title={selected?.label ?? 'Memory'} description={selected ? `${selected.type.charAt(0).toUpperCase()}${selected.type.slice(1)}` : undefined}>
        <div className="grid gap-4 px-2 pb-2">{details}</div>
      </Sheet>
    </div>
  )
}
