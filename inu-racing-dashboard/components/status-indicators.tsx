'use client'

interface StatusLightProps {
  label: string
  sublabel: string
  active: boolean
  activeColor: string
}

function StatusLight({ label, sublabel, active, activeColor }: StatusLightProps) {
  return (
    <div className="flex items-center gap-3 rounded border border-border bg-card px-3 py-3">
      <span
        className="relative flex size-3.5 shrink-0"
        style={{
          background: active ? activeColor : 'var(--secondary)',
          transition: 'all 0.2s ease-out',
        }}
      >
        {active && (
          <span
            className="absolute inline-flex h-full w-full animate-ping opacity-60"
            style={{ background: activeColor }}
          />
        )}
      </span>
      <div className="flex flex-col leading-tight">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-foreground">
          {label}
        </span>
        <span
          className="font-mono text-[0.6rem] uppercase tracking-widest"
          style={{
            color: active ? activeColor : 'var(--muted-foreground)',
          }}
        >
          {active ? sublabel : 'Inactive'}
        </span>
      </div>
    </div>
  )
}

interface StatusIndicatorsProps {
  rtd: boolean
  preCharge: boolean
}

export function StatusIndicators({ rtd, preCharge }: StatusIndicatorsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatusLight
        label="RTD"
        sublabel="Ready"
        active={rtd}
        activeColor="var(--racing-green)"
      />
      <StatusLight
        label="Pre-Chg"
        sublabel="Charging"
        active={preCharge}
        activeColor="var(--primary)"
      />
    </div>
  )
}
