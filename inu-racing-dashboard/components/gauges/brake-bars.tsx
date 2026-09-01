'use client'

interface BrakeBarsProps {
  front: number // 0-100
  rear: number // 0-100
}

function Bar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  const high = pct > 75
  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <span className="font-mono text-2xl font-bold text-foreground tabular-nums">
        {Math.round(pct)}
        <span className="ml-0.5 text-xs text-muted-foreground">%</span>
      </span>
      <div className="relative h-40 w-9 overflow-hidden border border-border bg-secondary">
        {/* threshold marks */}
        {[25, 50, 75].map((m) => (
          <span
            key={m}
            className="absolute left-0 w-full border-t border-dashed border-muted-foreground/25"
            style={{ bottom: `${m}%` }}
          />
        ))}
        <div
          className="absolute bottom-0 left-0 w-full"
          style={{
            height: `${pct}%`,
            background: high ? 'var(--racing-red)' : 'var(--racing-gold)',
            transition: 'height 0.09s linear',
          }}
        />
      </div>
      <span className="font-mono text-[0.7rem] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

export function BrakeBars({ front, rear }: BrakeBarsProps) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex w-full max-w-[180px] items-end justify-center gap-6">
        <Bar label="Front" value={front} />
        <Bar label="Rear" value={rear} />
      </div>
      <span className="mt-3 font-mono text-xs font-semibold uppercase tracking-widest text-foreground">
        Brake Signal
      </span>
    </div>
  )
}
