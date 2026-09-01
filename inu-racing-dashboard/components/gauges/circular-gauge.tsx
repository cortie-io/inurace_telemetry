'use client'

const START_ANGLE = 135 // degrees
const SWEEP = 270 // degrees
const R = 80
const CX = 100
const CY = 100

function polar(angleDeg: number, radius = R) {
  const a = (angleDeg * Math.PI) / 180
  return { x: CX + radius * Math.cos(a), y: CY + radius * Math.sin(a) }
}

function arcPath(fromAngle: number, toAngle: number, radius = R) {
  const start = polar(fromAngle, radius)
  const end = polar(toAngle, radius)
  const large = Math.abs(toAngle - fromAngle) > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}`
}

interface CircularGaugeProps {
  value: number
  min: number
  max: number
  unit: string
  label: string
  /** Accent color CSS value for the value arc + needle */
  color: string
  /** Optional: value at which the reading is considered critical */
  danger?: number
  decimals?: number
}

export function CircularGauge({
  value,
  min,
  max,
  unit,
  label,
  color,
  danger,
  decimals = 0,
}: CircularGaugeProps) {
  const clamped = Math.min(max, Math.max(min, value))
  const ratio = (clamped - min) / (max - min)
  const valueAngle = START_ANGLE + ratio * SWEEP
  const isDanger = danger !== undefined && value >= danger
  const needle = polar(valueAngle, R - 14)
  const activeColor = isDanger ? 'var(--racing-red)' : color

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 200 200"
        className="w-full max-w-[200px]"
        role="img"
        aria-label={`${label}: ${value.toFixed(decimals)} ${unit}`}
      >
        {/* Track */}
        <path
          d={arcPath(START_ANGLE, START_ANGLE + SWEEP)}
          fill="none"
          stroke="var(--secondary)"
          strokeWidth={12}
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d={arcPath(START_ANGLE, valueAngle)}
          fill="none"
          stroke={activeColor}
          strokeWidth={12}
          strokeLinecap="round"
          style={{ transition: 'all 0.09s linear' }}
        />
        {/* Tick marks */}
        {Array.from({ length: 9 }).map((_, i) => {
          const a = START_ANGLE + (i / 8) * SWEEP
          const outer = polar(a, R + 10)
          const inner = polar(a, R + 4)
          return (
            <line
              key={i}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--muted-foreground)"
              strokeWidth={2}
              opacity={0.5}
            />
          )
        })}
        {/* Needle */}
        <line
          x1={CX}
          y1={CY}
          x2={needle.x}
          y2={needle.y}
          stroke={activeColor}
          strokeWidth={3}
          strokeLinecap="round"
          style={{ transition: 'all 0.09s linear' }}
        />
        <circle cx={CX} cy={CY} r={7} fill={activeColor} />
        <circle cx={CX} cy={CY} r={3} fill="var(--card)" />

        {/* Value readout */}
        <text
          x={CX}
          y={CY + 45}
          textAnchor="middle"
          className="font-mono"
          style={{ fontSize: 30, fontWeight: 700, fill: 'var(--foreground)' }}
        >
          {value.toFixed(decimals)}
        </text>
        <text
          x={CX}
          y={CY + 62}
          textAnchor="middle"
          style={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
        >
          {unit}
        </text>
      </svg>
      <div className="mt-1 flex items-center gap-2">
        {isDanger && (
          <span className="h-2 w-2 animate-pulse rounded-full bg-racing-red" />
        )}
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-foreground">
          {label}
        </span>
      </div>
    </div>
  )
}
