'use client'

// Shared by history-view.tsx and lab-playback-view.tsx so both stats bars look identical.
export function StatTile({
  label,
  value,
  unit,
  accent,
}: {
  label: string
  value: string
  unit?: string
  accent?: string
}) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums" style={{ color: accent ?? 'var(--foreground)' }}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </p>
    </div>
  )
}
