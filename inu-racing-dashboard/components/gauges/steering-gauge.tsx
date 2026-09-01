'use client'

interface SteeringGaugeProps {
  angle: number // -180 to 180
}

export function SteeringGauge({ angle }: SteeringGaugeProps) {
  const clamped = Math.min(180, Math.max(-180, angle))
  // Top semicircle: -180 -> left (180deg pointing left), 0 -> up, +180 -> right
  // Map angle to needle rotation directly.
  const CX = 100
  const CY = 105
  const R = 78
  const needleAngleDeg = -90 + clamped // 0 => straight up
  const rad = (needleAngleDeg * Math.PI) / 180
  const tip = { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) }

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 200 140"
        className="w-full max-w-[200px]"
        role="img"
        aria-label={`Steering angle: ${Math.round(angle)} degrees`}
      >
        {/* Semicircle track */}
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke="var(--secondary)"
          strokeWidth={12}
          strokeLinecap="round"
        />
        {/* Center reference line (0 deg) */}
        <line
          x1={CX}
          y1={CY}
          x2={CX}
          y2={CY - R - 6}
          stroke="var(--muted-foreground)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
          opacity={0.6}
        />
        {/* Fill from center to current angle */}
        <path
          d={describeArc(CX, CY, R, -90, needleAngleDeg)}
          fill="none"
          stroke="var(--racing-gold)"
          strokeWidth={12}
          strokeLinecap="round"
          style={{ transition: 'all 0.09s linear' }}
        />
        {/* Tick labels */}
        <text x={CX - R} y={CY + 18} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--muted-foreground)' }}>
          -180°
        </text>
        <text x={CX} y={16} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--muted-foreground)' }}>
          0°
        </text>
        <text x={CX + R} y={CY + 18} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--muted-foreground)' }}>
          +180°
        </text>
        {/* Needle */}
        <line
          x1={CX}
          y1={CY}
          x2={tip.x}
          y2={tip.y}
          stroke="var(--racing-gold)"
          strokeWidth={3}
          strokeLinecap="round"
          style={{ transition: 'all 0.09s linear' }}
        />
        <circle cx={CX} cy={CY} r={6} fill="var(--racing-gold)" />
        <text
          x={CX}
          y={CY - 26}
          textAnchor="middle"
          className="font-mono"
          style={{ fontSize: 26, fontWeight: 700, fill: 'var(--foreground)' }}
        >
          {Math.round(angle)}°
        </text>
      </svg>
      <span className="mt-1 font-mono text-xs font-semibold uppercase tracking-widest text-foreground">
        Steering Angle
      </span>
    </div>
  )
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
) {
  const from = Math.min(startDeg, endDeg)
  const to = Math.max(startDeg, endDeg)
  const start = {
    x: cx + r * Math.cos((from * Math.PI) / 180),
    y: cy + r * Math.sin((from * Math.PI) / 180),
  }
  const end = {
    x: cx + r * Math.cos((to * Math.PI) / 180),
    y: cy + r * Math.sin((to * Math.PI) / 180),
  }
  const large = to - from > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`
}
