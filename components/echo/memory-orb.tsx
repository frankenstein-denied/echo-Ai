'use client'

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { orbBlobs, orbShares, ORB_COLOR, PEARL, type Orb, type OrbKind } from '@/lib/echo/orbs'

// Shared ids for the one-per-svg <OrbDefs/>. Every filter uses
// primitiveUnits="objectBoundingBox" so a single definition suits any orb size.
const BLOB_BLUR = 'echo-orb-blob-blur'
const GLOW_BLUR = 'echo-orb-glow-blur'
const SHINE = 'echo-orb-shine'
const SHADE = 'echo-orb-shade'

const BLOB_OPACITY = 0.85
const RIM = 'rgba(255,255,255,0.28)'

/** Place once inside the graph <svg>. */
export function OrbDefs() {
  return (
    <defs>
      {/* Soft blur that melts the color blobs into each other. */}
      <filter id={BLOB_BLUR} primitiveUnits="objectBoundingBox" x="-0.3" y="-0.3" width="1.6" height="1.6" colorInterpolationFilters="sRGB">
        <feGaussianBlur stdDeviation="0.1" />
      </filter>
      {/* Wide blur for the outer halo. */}
      <filter id={GLOW_BLUR} primitiveUnits="objectBoundingBox" x="-0.6" y="-0.6" width="2.2" height="2.2" colorInterpolationFilters="sRGB">
        <feGaussianBlur stdDeviation="0.16" />
      </filter>
      {/* Specular highlight, up and to the left. */}
      <radialGradient id={SHINE} cx="0.34" cy="0.28" r="0.52" fx="0.3" fy="0.22">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.72" />
        <stop offset="0.22" stopColor="#ffffff" stopOpacity="0.32" />
        <stop offset="0.6" stopColor="#ffffff" stopOpacity="0.06" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      {/* A faint inner light, then transparent to a dark rim, so the orb reads as a sphere. */}
      <radialGradient id={SHADE} cx="0.5" cy="0.5" r="0.5" fx="0.42" fy="0.38">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.14" />
        <stop offset="0.4" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="0.62" stopColor="#020617" stopOpacity="0.04" />
        <stop offset="0.88" stopColor="#020617" stopOpacity="0.28" />
        <stop offset="1" stopColor="#020617" stopOpacity="0.5" />
      </radialGradient>
    </defs>
  )
}

function seedOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function dominantColor(counts: Record<OrbKind, number>): string {
  const top = orbShares(counts)[0]
  return top ? ORB_COLOR[top.kind] : PEARL
}

export type MemoryOrbProps = {
  orb: Orb
  selected?: boolean
  highlighted?: boolean
  dimmed?: boolean
  reducedMotion?: boolean
  /**
   * Many orbs on screen: the orb is drawn once into a bitmap and shown as an <image>, so pan,
   * zoom and simulation frames skip its two blur filters. Selected or highlighted orbs, and orbs
   * still baking, use the live markup. The brain view sets this above its swirl limit.
   */
  lite?: boolean
}

// --- Lite mode: bake each orb once into a bitmap ---

/** How far the blurred halo reaches, as a multiple of the radius (blur stdDeviation ≈ 0.4 r). */
const BAKE_REACH = 2.1
const BAKE_MAX_PX = 320

/** Bitmap box for a baked orb: half-extent in user units and the pixel scale. */
export function orbBakeBox(radius: number, dpr: number): { half: number; scale: number } {
  const half = Math.ceil(radius * BAKE_REACH)
  const scale = Math.max(1, Math.min(3, dpr * 1.5, BAKE_MAX_PX / (half * 2)))
  return { half, scale }
}

/** Cache key: everything that changes the baked picture. */
export function orbBakeKey(orb: Pick<Orb, 'id' | 'radius' | 'counts'>, scale: number): string {
  const counts = Object.entries(orb.counts).filter(([, n]) => n > 0).map(([k, n]) => `${k}${n}`).join(',')
  return `${orb.id}|${orb.radius.toFixed(2)}|${counts}|${scale.toFixed(2)}`
}

const BAKE_CACHE_MAX = 600
const baked = new Map<string, string>()
let bakeQueue: Promise<unknown> = Promise.resolve()

function remember(key: string, url: string) {
  baked.set(key, url)
  while (baked.size > BAKE_CACHE_MAX) {
    const oldest = baked.keys().next().value as string
    URL.revokeObjectURL(baked.get(oldest)!)
    baked.delete(oldest)
  }
}

/** Rasterises the live orb art (serialized with the shared defs) to a blob URL. One at a time. */
function bake(key: string, art: SVGGElement, half: number, scale: number): Promise<string | null> {
  const hit = baked.get(key)
  if (hit) return Promise.resolve(hit)
  const defs = art.ownerSVGElement?.querySelector(`#${BLOB_BLUR}`)?.parentElement
  if (!defs) return Promise.resolve(null)
  const ser = new XMLSerializer()
  const size = half * 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-half} ${-half} ${size} ${size}">${ser.serializeToString(defs)}${ser.serializeToString(art)}</svg>`
  const job = bakeQueue.then(async () => {
    const img = new Image()
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    await img.decode()
    const px = Math.ceil(size * scale)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = px
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, px, px)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res))
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    remember(key, url)
    return url
  })
  bakeQueue = job.catch(() => null)
  return job.catch(() => null)
}

/** One orb, centred at 0,0. The caller translates it into place. */
export function MemoryOrb({ orb, selected = false, highlighted = false, dimmed = false, reducedMotion = false, lite = false }: MemoryOrbProps) {
  const clipId = `echo-orb-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const artRef = useRef<SVGGElement>(null)
  // Lite is only ever set on the client (the brain view's orbs come from live listeners).
  const box = lite && typeof window !== 'undefined' ? orbBakeBox(orb.radius, window.devicePixelRatio || 1) : null
  const key = lite && box ? orbBakeKey(orb, box.scale) : null
  const [image, setImage] = useState<{ key: string; url: string } | null>(null)
  const r = orb.radius
  const blobs = orbBlobs(orb.id, orb.counts)
  const base = blobs[0]?.color ?? PEARL
  const seed = seedOf(orb.id)
  // One full turn every 30–60 s, direction and phase varying per orb.
  const turnSeconds = 30 + (seed % 3001) / 100
  const clockwise = ((seed >>> 8) & 1) === 0
  const phase = -((seed >>> 4) % 1000) / 1000 * turnSeconds
  const lit = selected || highlighted
  const url = key ? (image?.key === key ? image.url : baked.get(key)) : undefined
  const showImage = !!url && !lit

  const half = box?.half ?? 0
  const scale = box?.scale ?? 1
  useEffect(() => {
    // Bake the resting look only: a lit orb has a brighter halo.
    if (!key || lit || baked.has(key) || !artRef.current) return
    let live = true
    bake(key, artRef.current, half, scale).then((u) => {
      if (live && u) setImage({ key, url: u })
    })
    return () => {
      live = false
    }
  }, [key, lit, half, scale])

  return (
    <g opacity={dimmed ? 0.25 : 1} style={{ transition: 'opacity 200ms ease' }}>
      {showImage && box ? (
        <image href={url} x={-box.half} y={-box.half} width={box.half * 2} height={box.half * 2} pointerEvents="none" />
      ) : (
        <g ref={artRef}>
          {/* 1. Outer glow halo in the dominant color. */}
          <circle r={r * 1.25} fill={base} opacity={lit ? 0.62 : 0.32} filter={`url(#${GLOW_BLUR})`} style={{ transition: 'opacity 200ms ease', pointerEvents: 'none' }} />

          {/* 2. Clipped body: dominant base plus blurred, slowly turning color blobs. */}
          <clipPath id={clipId}>
            <circle r={r} />
          </clipPath>
          <g clipPath={`url(#${clipId})`}>
            <circle r={r} fill={base} />
            {blobs.length > 0 && (
              <g filter={`url(#${BLOB_BLUR})`}>
                <g>
                  {blobs.map((b) => (
                    <circle key={b.kind} cx={b.cx * r} cy={b.cy * r} r={b.r * r} fill={b.color} opacity={BLOB_OPACITY} />
                  ))}
                  {!reducedMotion && (
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from={clockwise ? '0' : '360'}
                      to={clockwise ? '360' : '0'}
                      dur={`${turnSeconds.toFixed(2)}s`}
                      begin={`${phase.toFixed(2)}s`}
                      repeatCount="indefinite"
                    />
                  )}
                </g>
              </g>
            )}
            {/* 3. Shade and shine overlays. */}
            <circle r={r} fill={`url(#${SHADE})`} />
            <circle r={r} fill={`url(#${SHINE})`} />
          </g>
          <circle r={r - 0.5} fill="none" stroke={RIM} strokeWidth={1} pointerEvents="none" />
        </g>
      )}

      {/* 4. Crisp selection ring outside the orb. */}
      {selected && <circle r={r + 4} fill="none" stroke="#f8fafc" strokeOpacity={0.9} strokeWidth={2} pointerEvents="none" />}
    </g>
  )
}

// Fixed blob placements for HTML swatches (percent of the swatch box), by share rank.
const SWATCH_SPOTS: [number, number][] = [
  [48, 52],
  [26, 70],
  [74, 34],
  [70, 76],
]

/** Layered radial gradients that read as a tiny orb in HTML (detail panel, key, chips). */
export function orbSwatchStyle(counts: Record<OrbKind, number>): CSSProperties {
  const shares = orbShares(counts)
  const base = shares[0] ? ORB_COLOR[shares[0].kind] : PEARL
  const shine = 'radial-gradient(circle at 32% 26%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.25) 18%, rgba(255,255,255,0) 46%)'
  const shade = 'radial-gradient(circle at 46% 42%, rgba(2,6,23,0) 52%, rgba(2,6,23,0.45) 100%)'
  // Larger shares paint bigger soft spots; the dominant color is also the base.
  const spots = shares
    .slice(1)
    .map(({ kind, share }, i) => {
      const [x, y] = SWATCH_SPOTS[i + 1]
      const c = ORB_COLOR[kind]
      const reach = Math.round(38 + 40 * share)
      return `radial-gradient(circle at ${x}% ${y}%, ${c}d9 0%, ${c}99 ${Math.round(reach * 0.4)}%, ${c}00 ${reach}%)`
    })
    .reverse()
  return {
    display: 'inline-block',
    borderRadius: '50%',
    backgroundColor: base,
    backgroundImage: [shine, shade, ...spots].join(', '),
    boxShadow: `0 0 6px 1px ${base}80, inset 0 0 0 1px rgba(255,255,255,0.22)`,
  }
}

export function OrbSwatch({ counts, size = 16 }: { counts: Record<OrbKind, number>; size?: number }) {
  return <span aria-hidden style={{ ...orbSwatchStyle(counts), width: size, height: size, flexShrink: 0 }} />
}
