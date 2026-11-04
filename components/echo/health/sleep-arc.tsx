const COLOR = '#818cf8'

// Crescent-style gauge: a 270 degree arc that fills toward the sleep target.
export function SleepArc({ minutes, target = 480 }: { minutes: number; target?: number }) {
  const frac = target > 0 ? Math.min(1, Math.max(0, minutes / target)) : 0
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  const th = target / 60
  const r = 44
  const sweep = 270
  const pt = (deg: number) => {
    const a = ((deg + 135) * Math.PI) / 180
    return `${(60 + r * Math.cos(a)).toFixed(2)} ${(60 + r * Math.sin(a)).toFixed(2)}`
  }
  const arc = (deg: number) => `M ${pt(0)} A ${r} ${r} 0 ${deg > 180 ? 1 : 0} 1 ${pt(deg)}`
  const label = `Slept ${h} hours ${m} minutes of ${th} hours`
  return (
    <div role="img" aria-label={label} className="relative mx-auto mb-3 h-32 w-32">
      <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true">
        <path d={arc(sweep)} fill="none" stroke={COLOR} strokeOpacity="0.18" strokeWidth="10" strokeLinecap="round" />
        {frac > 0 && (
          <path d={arc(Math.max(0.5, sweep * frac))} fill="none" stroke={COLOR} strokeWidth="10" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${COLOR})` }} />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pb-1 text-center" aria-hidden="true">
        <span className="text-lg font-semibold leading-tight text-foreground">{h}h {m}m</span>
        <span className="text-xs text-muted-foreground">of {th}h</span>
      </div>
    </div>
  )
}
