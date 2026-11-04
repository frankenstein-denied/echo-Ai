'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { limitToLast, onSnapshot, orderBy, query } from 'firebase/firestore'
import { forceX, forceY, forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { BookOpen, Brain, Maximize2, Minus, Pin, PinOff, Plus, SlidersHorizontal, X } from 'lucide-react'
import { diaryPagesCol, memoriesCol, pageMessagesCol, type Message } from '@/lib/firestore'
import {
  buildOrbs,
  buildThreads,
  filterOrbs,
  orbAriaLabel,
  orbSummary,
  searchOrbs,
  ORB_COLOR,
  ORB_KINDS,
  ORB_MEANING,
  ORB_NOUN,
  type Orb,
  type OrbKind,
  type OrbMemory,
  type OrbPage,
  type Thread,
} from '@/lib/echo/orbs'
import { PERIOD_OPTIONS, type Period } from '@/lib/echo/period'
import { MemoryOrb, OrbDefs, OrbSwatch } from './memory-orb'
import { Button, Card, EmptyState, IconButton, Input, PageHeader, Segmented, Skeleton } from './ui'
import { Sheet } from './sheet'
import { useIsMobile } from './use-mobile'

type SimNode = { id: string; radius: number } & SimulationNodeDatum
type Transform = { x: number; y: number; k: number }
type Sim = Simulation<SimNode, SimulationLinkDatum<SimNode>>

const MAX_TICKS = 400
const MIN_K = 0.2
const MAX_K = 4
/** Above this many orbs on screen the color swirl stops, so drag, pan and zoom stay smooth. */
const SWIRL_LIMIT = 40
const LABEL_MAX = 28

// Orb props stay stable between simulation frames (only the parent <g> moves), so memo skips their re-render.
const StableOrb = memo(MemoryOrb)

const SINGLE = Object.fromEntries(
  ORB_KINDS.map((k) => [k, Object.fromEntries(ORB_KINDS.map((x) => [x, x === k ? 1 : 0]))]),
) as Record<OrbKind, Record<OrbKind, number>>

const DATE_FMT = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const formatDate = (ms: number) => (ms ? DATE_FMT.format(ms) : 'No date')
const shortLabel = (s: string) => (s.length > LABEL_MAX ? `${s.slice(0, LABEL_MAX - 1).trimEnd()}…` : s)

function noPagesText(period: Period): string {
  switch (period) {
    case 'today': return 'No pages today.'
    case 'week': return 'No pages this week.'
    case 'month': return 'No pages this month.'
    case 'all': return 'No pages yet.'
  }
}

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)'
function subscribeReduce(cb: () => void) {
  const mq = window.matchMedia(REDUCE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduce, () => window.matchMedia(REDUCE_QUERY).matches, () => false)
}

/** Read-only transcript (last 50 messages) of one diary page. */
function PageTranscript({ uid, pageId }: { uid: string; pageId: string }) {
  const [msgs, setMsgs] = useState<(Message & { id: string })[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setMsgs(null)
    setFailed(false)
    const q = query(pageMessagesCol(uid, pageId), orderBy('createdAt'), limitToLast(50))
    return onSnapshot(
      q,
      (snap) => setMsgs(snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }))),
      () => setFailed(true),
    )
  }, [uid, pageId])
  return (
    <div>
      <h3 className="mb-1 text-sm font-medium text-foreground">Conversation</h3>
      {failed ? (
        <p className="text-sm text-danger">Could not load this conversation.</p>
      ) : msgs === null ? (
        <Skeleton className="h-24 w-full" />
      ) : msgs.length ? (
        <ol aria-label="Conversation (read only)" className="grid max-h-72 gap-2 overflow-y-auto rounded-lg border border-border bg-surface-2 p-2">
          {msgs.map((m) => (
            <li key={m.id} className="min-w-0 text-sm">
              <span className="text-xs font-medium text-muted-foreground">{m.role === 'user' ? 'You' : 'Echo'}</span>
              <p className="whitespace-pre-wrap break-words text-foreground">{m.text}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No messages on this page.</p>
      )}
    </div>
  )
}

export function BrainView({ uid, onOpenPage }: { uid: string; onOpenPage?: (pageId: string) => void }) {
  const [memories, setMemories] = useState<OrbMemory[] | null>(null)
  const [pages, setPages] = useState<OrbPage[]>([])
  const [error, setError] = useState('')
  const [period, setPeriod] = useState<Period>('week')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [filterSheet, setFilterSheet] = useState(false)
  const mobile = useIsMobile()
  const prefersReduced = usePrefersReducedMotion()
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
  const pendingCentreRef = useRef<string | null>(null)
  const lastTapRef = useRef<{ id: string; t: number } | null>(null)
  const dragRef = useRef<{ id: string; pointerId: number; moved: number; ox: number; oy: number; pinned: boolean } | null>(null)
  const panRef = useRef<{ x: number; y: number; moved: number } | null>(null)
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchRef = useRef<{ dist: number; k: number } | null>(null)
  const wheelIdleRef = useRef(0)

  useEffect(() => {
    return onSnapshot(
      memoriesCol(uid),
      (snap) => {
        setMemories(
          snap.docs.map((s) => {
            const d = s.data({ serverTimestamps: 'estimate' })
            return { id: s.id, label: d.label, type: d.type, mentions: d.mentions, pages: Array.isArray(d.pages) ? d.pages : undefined }
          }),
        )
        setError('')
      },
      () => setError('Could not load your memories.'),
    )
  }, [uid])

  useEffect(() => {
    return onSnapshot(
      diaryPagesCol(uid),
      (snap) =>
        setPages(
          snap.docs.map((s) => {
            const d = s.data({ serverTimestamps: 'estimate' })
            return { id: s.id, title: d.title, lastMessageMs: d.lastMessageAt?.toMillis?.(), messageCount: typeof d.messageCount === 'number' ? d.messageCount : undefined, mix: d.mix }
          }),
        ),
      () => setPages([]),
    )
  }, [uid])

  const orbs = useMemo(() => buildOrbs(memories ?? [], pages), [memories, pages])
  const shown = useMemo(() => filterOrbs(orbs, period), [orbs, period])
  const threads = useMemo(() => buildThreads(shown), [shown])
  const byId = useMemo(() => new Map(shown.map((o) => [o.id, o])), [shown])
  const matches = useMemo(() => searchOrbs(shown, search), [shown, search])
  const allMatches = useMemo(() => searchOrbs(orbs, search), [orbs, search])

  const requestFrame = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      setFrame((f) => f + 1)
    })
  }, [])

  // The color swirl is paused (not reset) while the user drags, pans, pinches or zooms,
  // so the blurred color layers are not redrawn for the swirl on top of the movement.
  const setInteracting = useCallback((on: boolean) => {
    const svg = svgRef.current
    if (!svg) return
    if (on) svg.pauseAnimations?.()
    else svg.unpauseAnimations?.()
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
      // room for the halo around each orb and the label under it
      x0 = Math.min(x0, n.x! - n.radius * 1.3)
      x1 = Math.max(x1, n.x! + n.radius * 1.3)
      y0 = Math.min(y0, n.y! - n.radius * 1.3)
      y1 = Math.max(y1, n.y! + n.radius + 28)
    }
    const pad = 48
    const k = Math.min(MAX_K, Math.max(MIN_K, Math.min((w - pad * 2) / Math.max(1, x1 - x0), (h - pad * 2) / Math.max(1, y1 - y0), 1.5)))
    setTf({ k, x: w / 2 - ((x0 + x1) / 2) * k, y: h / 2 - ((y0 + y1) / 2) * k })
  }, [])

  const centreOn = useCallback((id: string) => {
    const n = nodesRef.current.get(id)
    if (!n || n.x == null || n.y == null) return
    userMovedRef.current = true
    const { w, h } = sizeRef.current
    setTf((t) => ({ ...t, x: w / 2 - n.x! * t.k, y: h / 2 - n.y! * t.k }))
  }, [])

  // Size tracking (wrapRef only exists once there are orbs)
  const hasOrbs = orbs.length > 0
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      const changed = Math.abs(r.width - sizeRef.current.w) > 1 || Math.abs(r.height - sizeRef.current.h) > 1
      sizeRef.current = { w: r.width, h: r.height }
      // keep the orbs in view when the box is resized, unless the user has panned or zoomed
      if (changed && fittedRef.current && !userMovedRef.current) fit()
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasOrbs, fit])

  // A new period gets a fresh fit once its layout settles. Declared before the simulation effect so it runs first.
  useEffect(() => {
    fittedRef.current = false
    userMovedRef.current = false
  }, [period])

  // Simulation: rebuilt when the shown orbs or threads change; previous positions and pins are kept (reheat).
  useEffect(() => {
    const prev = nodesRef.current
    const next = new Map<string, SimNode>()
    shown.forEach((o, i) => {
      const old = prev.get(o.id)
      const angle = i * 2.4
      const spread = 40 + i * 12
      next.set(o.id, { id: o.id, radius: o.radius, x: old?.x ?? Math.cos(angle) * spread, y: old?.y ?? Math.sin(angle) * spread, vx: 0, vy: 0, fx: old?.fx ?? null, fy: old?.fy ?? null })
    })
    nodesRef.current = next
    const nodes = [...next.values()]
    if (!nodes.length) {
      fittedRef.current = false
      requestFrame()
      return
    }
    if (prev.size === 0 || nodes.length > prev.size * 2 + 5) fittedRef.current = false
    const links = threads.map((t) => ({ source: t.source, target: t.target }))
    const sim: Sim = forceSimulation<SimNode>(nodes)
      .force(
        'link',
        forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
          .id((d) => d.id)
          .distance((l) => (l.source as SimNode).radius + (l.target as SimNode).radius + 50)
          .strength(0.6),
      )
      .force('charge', forceManyBody<SimNode>().strength(-160))
      .force('collide', forceCollide<SimNode>().radius((d) => d.radius + 10))
      .force('center', forceCenter(0, 0))
      .force('x', forceX<SimNode>(0).strength(0.05))
      .force('y', forceY<SimNode>(0).strength(0.05))
      .alpha(prev.size ? 0.5 : 1)
      .stop()
    simRef.current = sim
    const reduce = window.matchMedia(REDUCE_QUERY).matches
    let budget = reduce ? 0 : MAX_TICKS
    const warm = reduce ? MAX_TICKS : 120
    for (let i = 0; i < warm && sim.alpha() > sim.alphaMin(); i++) {
      sim.tick()
      budget--
    }
    const pending = pendingCentreRef.current
    if (pending && next.has(pending)) {
      pendingCentreRef.current = null
      fittedRef.current = true
      centreOn(pending)
    } else if (!fittedRef.current) fit()
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
  }, [shown, threads, fit, centreOn, requestFrame])

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      window.clearTimeout(wheelIdleRef.current)
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
      setInteracting(true)
      window.clearTimeout(wheelIdleRef.current)
      wheelIdleRef.current = window.setTimeout(() => {
        if (!pointers.current.size) setInteracting(false)
      }, 200)
      const r = el.getBoundingClientRect()
      zoomAt(Math.exp(-(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1)) * 0.0015), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt, setInteracting, hasOrbs])

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
    setInteracting(true)
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
    setInteracting(true)
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
    if (pointers.current.size === 0) setInteracting(false)
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

  const selectAndCentre = (id: string) => {
    setSelectedId(id)
    centreOn(id)
  }

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return
    const here = shown.find((o) => matches.has(o.id))
    if (here) return selectAndCentre(here.id)
    const elsewhere = orbs.find((o) => allMatches.has(o.id))
    if (elsewhere) {
      // Found outside this period: show all pages and centre on it once it is laid out.
      pendingCentreRef.current = elsewhere.id
      setPeriod('all')
      setSelectedId(elsewhere.id)
    }
  }

  const selected = selectedId ? byId.get(selectedId) ?? null : null
  const linked = useMemo(() => {
    if (!selected) return []
    const out: { thread: Thread; orb: Orb }[] = []
    for (const t of threads) {
      if (t.source !== selected.id && t.target !== selected.id) continue
      const orb = byId.get(t.source === selected.id ? t.target : t.source)
      if (orb) out.push({ thread: t, orb })
    }
    return out
  }, [selected, threads, byId])
  const linkedIds = new Set(linked.map((l) => l.orb.id))
  const searching = search.trim().length > 0
  const swirl = !prefersReduced && shown.length <= SWIRL_LIMIT

  const header = <PageHeader title="2nd Brain" description="Each diary page is a memory orb. Its colors show what's inside." />

  if (memories === null && !error) {
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
  if (!hasOrbs) {
    return (
      <div>
        {header}
        <EmptyState icon={Brain} title="Nothing here yet" description="Chat with Echo and each diary page will appear here as a glowing memory orb." />
      </div>
    )
  }

  // Tighter segments so the four periods fit on one line in the side panel; full width in the mobile sheet.
  const periodControl = (
    <div className="[&_button]:whitespace-nowrap [&_button]:px-2">
      <Segmented ariaLabel="Time period" value={period} onChange={(v) => setPeriod(v as Period)} options={PERIOD_OPTIONS} fullWidth={mobile} />
    </div>
  )
  const legend = (
    <>
      <h2 className="mb-2 text-sm font-medium text-foreground">What the colors mean</h2>
      <ul className="grid gap-2">
        {ORB_KINDS.map((kind) => (
          <li key={kind} className="flex items-center gap-2.5 text-sm">
            <OrbSwatch counts={SINGLE[kind]} size={16} />
            <span className="min-w-0 text-foreground">{ORB_MEANING[kind]}</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">{ORB_NOUN[kind][1]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">Bigger orbs: more happened on that page. Threads: pages that share a person, interest or goal.</p>
    </>
  )

  const summary = selected ? orbSummary(selected.counts) : []
  const people = selected ? selected.members.filter((m) => m.kind === 'person' || m.kind === 'interest') : []
  const details = selected ? (
    <>
      {nodesRef.current.get(selected.id)?.fx != null && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-2"><Pin size={16} aria-hidden="true" />Pinned in place</span>
          <Button variant="secondary" size="sm" icon={PinOff} onClick={() => releaseNode(selected.id)}>Release position</Button>
        </div>
      )}
      <div>
        <h3 className="mb-1.5 text-sm font-medium text-foreground">What&apos;s inside</h3>
        {summary.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {summary.map((s) => (
              <li key={s.kind} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-foreground">
                <span className="size-2 rounded-full" style={{ background: ORB_COLOR[s.kind], boxShadow: `0 0 4px ${ORB_COLOR[s.kind]}` }} aria-hidden="true" />
                {s.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Just conversation so far.</p>
        )}
      </div>
      {people.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-medium text-foreground">People &amp; interests</h3>
          <ul className="grid max-h-40 gap-1 overflow-y-auto">
            {people.map((m) => (
              <li key={m.id} className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: ORB_COLOR[m.kind] }} aria-hidden="true" />
                <span className="truncate">{m.label}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{ORB_NOUN[m.kind][0]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h3 className="mb-1 text-sm font-medium text-foreground">Linked pages ({linked.length})</h3>
        {linked.length ? (
          <ul className="grid max-h-56 gap-1 overflow-y-auto">
            {linked.map(({ thread, orb }) => (
              <li key={orb.id}>
                <button
                  type="button"
                  onClick={() => selectAndCentre(orb.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-foreground hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-lg:min-h-11"
                >
                  <OrbSwatch counts={orb.counts} size={14} />
                  <span className="min-w-0">
                    <span className="block truncate">{orb.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">via {thread.via.join(', ')}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No linked pages{period === 'all' ? '' : ' in this period'}.</p>
        )}
      </div>
      <PageTranscript uid={uid} pageId={selected.pageId} />
      {onOpenPage && (
        <Button icon={BookOpen} onClick={() => onOpenPage(selected.pageId)}>
          Open in Diary
        </Button>
      )}
    </>
  ) : null
  const periodLabel = PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? 'All'
  const k = tf.k

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
          hint={
            searching
              ? matches.size || !allMatches.size
                ? `${matches.size} match${matches.size === 1 ? '' : 'es'}. Press Enter to jump to the first.`
                : `No matches in this period, ${allMatches.size} in All. Press Enter to jump to the first.`
              : undefined
          }
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div ref={wrapRef} className="relative h-[560px] overflow-hidden rounded-xl border border-border bg-surface max-lg:h-[max(320px,calc(100dvh-var(--topbar-h)-var(--tabbar-h)-12.5rem))]">
          <svg
            ref={svgRef}
            className="size-full cursor-grab touch-none select-none"
            role="group"
            aria-label="Memory orbs. Use Tab to move between diary pages and Enter to select."
            onPointerDown={onBgDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <OrbDefs />
            <g transform={`translate(${tf.x} ${tf.y}) scale(${k})`}>
              <g pointerEvents="none" strokeLinecap="round">
                {threads.map((t) => {
                  const a = nodesRef.current.get(t.source)
                  const b = nodesRef.current.get(t.target)
                  if (!a || !b) return null
                  const onSel = !!selected && (t.source === selected.id || t.target === selected.id)
                  const faded = searching && !matches.has(t.source) && !matches.has(t.target)
                  const color = ORB_COLOR[t.kind]
                  return (
                    <g key={`${t.source}|${t.target}`} opacity={faded ? 0.3 : 1}>
                      {/* soft glow under the thread (a wide faint stroke, no filter, so it stays cheap) */}
                      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={(onSel ? 10 : 7) / k} opacity={onSel ? 0.22 : 0.08} />
                      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={(onSel ? 3.5 : 2.5) / k} opacity={onSel ? 0.9 : 0.35} />
                    </g>
                  )
                })}
              </g>
              {shown.map((orb) => {
                const n = nodesRef.current.get(orb.id)
                if (!n) return null
                const isSel = orb.id === selectedId
                const isHover = orb.id === hoverId
                const isMatch = searching && matches.has(orb.id)
                const dimmed = searching && !isMatch
                const showLabel = shown.length <= SWIRL_LIMIT || orb.radius >= 30 || isSel || isHover || isMatch || linkedIds.has(orb.id) || k >= 1.6
                return (
                  <g
                    key={orb.id}
                    transform={`translate(${n.x ?? 0} ${n.y ?? 0})`}
                    style={{ cursor: dragRef.current?.id === orb.id ? 'grabbing' : 'grab', outline: 'none' }}
                    role="button"
                    tabIndex={0}
                    aria-label={orbAriaLabel(orb)}
                    aria-pressed={isSel}
                    onPointerDown={(e) => onNodeDown(e, orb.id)}
                    onPointerEnter={() => setHoverId(orb.id)}
                    onPointerLeave={() => setHoverId(null)}
                    onFocus={() => setHoverId(orb.id)}
                    onBlur={() => setHoverId(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedId(orb.id)
                      }
                    }}
                  >
                    {/* Touch: invisible 44 px hit area around small orbs. */}
                    {mobile && <circle r={Math.max(orb.radius, 22 / k)} fill="transparent" />}
                    {/* Opaque backing so threads never show through a dimmed (see-through) orb. */}
                    <circle r={orb.radius} style={{ fill: 'var(--color-surface)' }} />
                    <StableOrb orb={orb} selected={isSel} highlighted={isMatch || isHover} dimmed={dimmed} reducedMotion={!swirl} />
                    {n.fx != null && <circle r={orb.radius + 8} fill="none" strokeWidth={1.5} strokeDasharray="3 3" pointerEvents="none" style={{ stroke: 'var(--color-muted-foreground)' }} />}
                    {showLabel && (
                      <text
                        y={orb.radius + 14 / k}
                        textAnchor="middle"
                        dominantBaseline="hanging"
                        fontSize={12 / k}
                        paintOrder="stroke"
                        strokeWidth={3 / k}
                        strokeLinejoin="round"
                        opacity={dimmed ? 0.45 : 1}
                        style={{ fill: 'var(--color-foreground)', stroke: 'var(--color-surface)', fontWeight: isSel ? 600 : 400 }}
                      >
                        {shortLabel(orb.label)}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          </svg>
          {shown.length === 0 && (
            <div className="absolute inset-0 grid place-items-center p-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <p className="text-sm text-muted-foreground">{noPagesText(period)}</p>
                <Button variant="secondary" onClick={() => setPeriod('all')}>Show all</Button>
              </div>
            </div>
          )}
          <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-lg border border-border bg-surface-2 p-1">
            <IconButton icon={Plus} label="Zoom in" size="sm" onClick={() => zoomAt(1.3)} />
            <IconButton icon={Minus} label="Zoom out" size="sm" onClick={() => zoomAt(1 / 1.3)} />
            <IconButton icon={Maximize2} label="Fit to view" size="sm" onClick={fit} />
          </div>
          <Button variant="secondary" icon={SlidersHorizontal} className="absolute left-3 top-3 bg-surface-2 lg:hidden" aria-label={`Period: ${periodLabel}. Filter and color key`} aria-haspopup="dialog" aria-expanded={filterSheet} onClick={() => setFilterSheet(true)}>
            {periodLabel}
          </Button>
          <p className="pointer-events-none absolute bottom-3 left-3 text-xs text-muted-foreground max-lg:hidden">Drag orbs to arrange · double-tap to unpin · drag the background to pan · scroll to zoom</p>
          <p className="pointer-events-none absolute inset-x-3 bottom-3 text-xs text-muted-foreground lg:hidden">Tap an orb for details · pinch to zoom · drag to pan</p>
        </div>
        <div className="grid content-start gap-4 max-lg:hidden">
          <Card as="div">
            <h2 className="mb-2 text-sm font-medium text-foreground">Show pages from</h2>
            {periodControl}
          </Card>
          {selected ? (
            <Card as="div" className="grid gap-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-0.5 flex"><OrbSwatch counts={selected.counts} size={22} /></span>
                  <div className="min-w-0">
                    <h2 className="break-words text-base font-semibold text-foreground">{selected.label}</h2>
                    <p className="text-xs text-muted-foreground">{formatDate(selected.ms)}</p>
                  </div>
                </div>
                <IconButton icon={X} label="Close details" size="sm" onClick={() => setSelectedId(null)} />
              </div>
              {details}
            </Card>
          ) : (
            <Card as="div">
              <p className="text-sm text-muted-foreground">Tap an orb to see what&apos;s inside.</p>
            </Card>
          )}
          <Card as="div">{legend}</Card>
        </div>
      </div>
      <Sheet open={mobile && filterSheet} onClose={() => setFilterSheet(false)} title="Filter and color key">
        <div className="grid gap-5 px-2 pb-2">
          {periodControl}
          <div>{legend}</div>
        </div>
      </Sheet>
      <Sheet open={mobile && !filterSheet && !!selected} onClose={() => setSelectedId(null)} title={selected?.label ?? 'Diary page'} description={selected ? formatDate(selected.ms) : undefined}>
        <div className="grid gap-4 px-2 pb-2">{details}</div>
      </Sheet>
    </div>
  )
}
