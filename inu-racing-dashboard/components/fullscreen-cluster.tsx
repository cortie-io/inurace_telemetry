'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { BatteryThresholds, TelemetrySnapshot } from '@/lib/types'

interface FullscreenClusterProps {
  data: TelemetrySnapshot
  thresholds: BatteryThresholds
  onExit: () => void
}

const SPEED_MAX = 150
const TEMP_MAX = 80
// Theoretical ceiling from the voltage/current gauge scales this replaced (100V * 400A / 1000),
// not a separately-configured setting — matches the KW channel's domain in lib/metrics.ts.
const KW_MAX = 40

// Dark cluster palette (kept local so the dash reads like an in-car display).
const INK = '#0a0e1a'
const PANEL = '#121828'
const PANEL_HI = '#1a2236'
const LINE = 'rgba(255,255,255,0.08)'
const DIM = 'rgba(255,255,255,0.5)'
const BLUE = 'var(--racing-blue)'
const GOLD = 'var(--racing-gold)'
const RED = 'var(--racing-red)'
const GREEN = 'var(--racing-green)'

function segColor(i: number, total: number) {
  const r = i / total
  if (r < 0.5) return BLUE
  if (r < 0.75) return GOLD
  return RED
}

// 270-degree arc geometry (from 135deg to 405deg), number sits in the center.
const ARC_R = 42
const ARC_CX = 50
const ARC_CY = 50
const START_ANGLE = 135 // degrees
const SWEEP = 270 // degrees
function polar(pctAngleDeg: number) {
  const a = (pctAngleDeg * Math.PI) / 180
  return { x: ARC_CX + ARC_R * Math.cos(a), y: ARC_CY + ARC_R * Math.sin(a) }
}
function arcPath(fromPct: number, toPct: number) {
  const a0 = START_ANGLE + (fromPct / 100) * SWEEP
  const a1 = START_ANGLE + (toPct / 100) * SWEEP
  const p0 = polar(a0)
  const p1 = polar(a1)
  const large = a1 - a0 > 180 ? 1 : 0
  return `M ${p0.x} ${p0.y} A ${ARC_R} ${ARC_R} 0 ${large} 1 ${p1.x} ${p1.y}`
}

export function FullscreenCluster({
  data,
  thresholds,
  onExit,
}: FullscreenClusterProps) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onExit])

  const SEGMENTS = 14
  const kw = (data.batteryVoltage * data.batteryCurrent) / 1000
  const kwPct = Math.min(100, (kw / KW_MAX) * 100)
  // Top shift-light strip reads power draw (kW), not speed — the hero arc/number below it still
  // represents speed on its own.
  const litSegments = Math.round((kwPct / 100) * SEGMENTS)
  const speedPct = Math.min(100, (data.speed / SPEED_MAX) * 100)
  const tempPct = Math.min(100, (data.batteryTemp / TEMP_MAX) * 100)
  const tempDanger = data.batteryTemp >= thresholds.batteryTempMax
  const currentDanger = data.batteryCurrent >= thresholds.batteryCurrentMax
  const voltageDanger = data.batteryVoltage >= thresholds.batteryVoltageMax
  // Voltage/Current no longer have their own cards, but a Power reading over either limit is
  // still worth flagging red — that's the physical condition those two cards used to surface.
  const kwDanger = currentDanger || voltageDanger
  const fast = data.speed >= 130
  const arcColor = fast ? RED : GOLD

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col gap-1.5 p-2.5 font-mono [@media(min-height:640px)]:gap-3 [@media(min-height:640px)]:p-4"
      style={{ background: INK, color: '#fff' }}
    >
      {/* Exit — discreet, top-right */}
      <button
        type="button"
        onClick={onExit}
        aria-label="Exit fullscreen dashboard"
        className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full transition-colors hover:bg-white/10"
        style={{ border: `1px solid ${LINE}`, color: DIM }}
      >
        <X className="size-4" aria-hidden="true" />
      </button>

      {/* Shift-light strip — px-12 keeps segments clear of the absolutely-positioned exit
          button's footprint (size-9 + right-3/top-3 ≈ 48px) so it doesn't sit on top of them.
          Sized by viewport HEIGHT (not width like the rest of the app) below, alongside every
          other compacting rule in this component — see the note on the Metric/StateField cards
          for why. */}
      <div className="flex items-center justify-center gap-1.5 px-12 [@media(min-height:640px)]:gap-2">
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const lit = i < litSegments
          const color = segColor(i, SEGMENTS)
          return (
            <span
              key={i}
              className="h-2.5 flex-1 rounded-full [@media(min-height:640px)]:h-3.5"
              style={{
                maxWidth: '5%',
                background: lit ? color : 'rgba(255,255,255,0.07)',
                boxShadow: lit ? `0 0 12px ${color}` : 'none',
                transition: 'background 0.1s, box-shadow 0.1s',
              }}
            />
          )
        })}
      </div>

      {/* HERO: circular arc gauge with the speed centered inside */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl"
        style={{
          background: `radial-gradient(circle at 50% 45%, ${PANEL_HI}, ${PANEL})`,
          border: `1px solid ${LINE}`,
        }}
      >
        {/* Always rendered — shrinks with the hero's own flex-1/min-h-0 sizing rather than
            being hard-hidden below a height threshold, since the "6 values" rows below have
            their own mobile-compact sizing now and shouldn't be squeezing this out entirely. */}
        <div className="relative aspect-square h-full max-h-full">
          <svg viewBox="0 0 100 100" className="size-full" fill="none">
            {/* tick marks */}
            {Array.from({ length: 16 }).map((_, i) => {
              const pct = (i / 15) * 100
              const a = ((START_ANGLE + (pct / 100) * SWEEP) * Math.PI) / 180
              const outer = {
                x: ARC_CX + (ARC_R + 5) * Math.cos(a),
                y: ARC_CY + (ARC_R + 5) * Math.sin(a),
              }
              const inner = {
                x: ARC_CX + (ARC_R + 1.5) * Math.cos(a),
                y: ARC_CY + (ARC_R + 1.5) * Math.sin(a),
              }
              return (
                <line
                  key={i}
                  x1={outer.x}
                  y1={outer.y}
                  x2={inner.x}
                  y2={inner.y}
                  stroke={i >= 12 ? RED : 'rgba(255,255,255,0.25)'}
                  strokeWidth="0.8"
                />
              )
            })}
            {/* track */}
            <path
              d={arcPath(0, 100)}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="6"
              strokeLinecap="round"
            />
            {/* value */}
            {speedPct > 0 && (
              <path
                d={arcPath(0, speedPct)}
                stroke={arcColor}
                strokeWidth="6"
                strokeLinecap="round"
                style={{
                  transition: 'stroke 0.2s',
                  filter: `drop-shadow(0 0 4px ${arcColor})`,
                }}
              />
            )}
          </svg>
        </div>

        {/* Speed value — centered, sized to stay inside the arc opening. The font-size is
            capped by min(vh, vw) rather than vh alone: on a narrow-but-tall phone, sizing purely
            off viewport height can make 3 digits wider than the screen, which the hero card's
            overflow-hidden would then clip — the vw term caps that case while leaving wide/
            landscape screens (where vh is still the binding constraint) unaffected. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-black leading-[0.8] tabular-nums text-[clamp(2rem,min(26vh,22vw),16rem)] [@media(max-height:520px)]:text-[clamp(1.5rem,min(11vh,13vw),3.5rem)]"
            style={{
              color: fast ? RED : '#fff',
              transition: 'color 0.2s',
              textShadow: fast ? `0 0 24px ${RED}` : 'none',
            }}
          >
            {Math.round(data.speed)}
          </span>
          <span
            className="text-xs font-bold uppercase tracking-[0.5em] sm:text-base"
            style={{ color: GOLD }}
          >
            km / h
          </span>
        </div>
      </div>

      {/* Key metrics — Voltage/Current cards were replaced by Power (kW = V*A), the two raw
          numbers they showed combined into the one that actually matters at a glance. */}
      <div className="grid grid-cols-2 gap-1.5 [@media(min-height:640px)]:gap-3">
        <Metric
          label="Batt Temp"
          value={data.batteryTemp.toFixed(0)}
          unit="°C"
          danger={tempDanger}
          barPct={tempPct}
          accent={RED}
        />
        <Metric
          label="Power"
          value={kw.toFixed(1)}
          unit="kW"
          danger={kwDanger}
          barPct={kwPct}
          accent={BLUE}
        />
      </div>

      {/* Status row — Link dropped: this screen only opens once /live is already up, and the
          main dashboard's header/footer already surface connection state continuously. */}
      <div className="grid grid-cols-2 gap-1.5 [@media(min-height:640px)]:gap-3">
        <StateField label="Drive" on={data.rtd} onText="READY" offText="OFF" />
        <StateField
          label="Pre-Charge"
          on={data.preCharge}
          onText="ON"
          offText="OFF"
        />
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  unit,
  danger,
  barPct,
  accent = GOLD,
}: {
  label: string
  value: string
  unit: string
  danger?: boolean
  barPct?: number
  accent?: string
}) {
  const c = danger ? RED : accent
  return (
    <div
      className="relative flex flex-col justify-between overflow-hidden rounded-xl px-2 py-1.5 [@media(min-height:640px)]:px-5 [@media(min-height:640px)]:py-4"
      style={{
        background: danger
          ? `linear-gradient(160deg, rgba(220,50,50,0.16), ${PANEL})`
          : `linear-gradient(160deg, ${PANEL_HI}, ${PANEL})`,
        border: `1px solid ${danger ? RED : LINE}`,
        transition: 'background 0.2s, border-color 0.2s',
      }}
    >
      {/* header row: label + accent dot */}
      <div className="flex items-center justify-between">
        <span
          className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] [@media(min-height:640px)]:text-xs [@media(min-height:640px)]:tracking-[0.25em]"
          style={{ color: DIM }}
        >
          {label}
        </span>
        <span
          className="size-1.5 rounded-full"
          style={{ background: c, boxShadow: `0 0 8px ${c}` }}
        />
      </div>

      {/* value — the vh term is deliberately smaller than the hero number's (5vh vs 26vh) so
          these three cards don't eat the height budget the hero arc needs on mobile; the vw term
          is unchanged since that's a width-clipping safeguard, not a height one. Padding/gaps
          here key off viewport HEIGHT (min-height media query), not Tailwind's width-based `sm:`
          — a landscape phone (wide, short) previously slipped past `sm:` and got full-size cards
          that squeezed the hero arc down to nothing; height is the actual resource being
          negotiated, so that's what gates the compact vs. comfortable sizing. */}
      <div className="flex items-baseline gap-1.5 py-0 [@media(min-height:640px)]:py-1">
        <span
          className="font-black leading-none tabular-nums"
          style={{
            fontSize: 'clamp(1.1rem, min(5vh, 8vw), 5rem)',
            color: danger ? RED : '#fff',
            textShadow: danger ? `0 0 20px ${RED}` : 'none',
            transition: 'color 0.2s',
          }}
        >
          {value}
        </span>
        <span
          className="text-xs font-semibold [@media(min-height:640px)]:text-base"
          style={{ color: c }}
        >
          {unit}
        </span>
      </div>

      {/* bar */}
      {barPct != null && (
        <div
          className="h-1 w-full overflow-hidden rounded-full [@media(min-height:640px)]:h-1.5"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${barPct}%`,
              background: `linear-gradient(90deg, ${c}, ${c})`,
              boxShadow: `0 0 8px ${c}`,
              transition: 'width 0.2s ease-out',
            }}
          />
        </div>
      )}
    </div>
  )
}

function StateField({
  label,
  on,
  onText,
  offText,
}: {
  label: string
  on: boolean
  onText: string
  offText: string
}) {
  const color = on ? GREEN : RED
  return (
    <div
      className="relative flex flex-col justify-between overflow-hidden rounded-xl px-2 py-1.5 [@media(min-height:640px)]:px-5 [@media(min-height:640px)]:py-4"
      style={{
        border: `1px solid ${on ? 'rgba(50,200,120,0.5)' : 'rgba(220,50,50,0.5)'}`,
        background: on
          ? `linear-gradient(160deg, rgba(50,200,120,0.16), ${PANEL})`
          : `linear-gradient(160deg, rgba(220,50,50,0.16), ${PANEL})`,
        transition: 'background 0.2s, border-color 0.2s',
      }}
    >
      {/* header row: label + status dot */}
      <div className="flex items-center justify-between">
        <span
          className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] [@media(min-height:640px)]:text-xs [@media(min-height:640px)]:tracking-[0.25em]"
          style={{ color: DIM }}
        >
          {label}
        </span>
        <span
          className="size-2 rounded-full"
          style={{
            background: color,
            boxShadow: `0 0 10px ${color}`,
            animation: on ? 'pulse 1.6s ease-in-out infinite' : 'none',
          }}
        />
      </div>

      {/* status value — "READY" is the widest word this ever renders. Same smaller-vh reasoning
          as Metric's value: kept short on the height axis so this row doesn't crowd out the hero
          arc on mobile, while the vw term still guards against clipping in the narrow 3-col grid. */}
      <div className="flex items-baseline gap-2 py-0 [@media(min-height:640px)]:py-1">
        <span
          className="font-black leading-none tabular-nums"
          style={{
            fontSize: 'clamp(0.9rem, min(4vh, 5.5vw), 3.5rem)',
            color,
            textShadow: `0 0 18px ${color}`,
            transition: 'color 0.2s',
          }}
        >
          {on ? onText : offText}
        </span>
      </div>

      {/* baseline rule to match metric cards' bar height */}
      <div
        className="h-1 w-full rounded-full [@media(min-height:640px)]:h-1.5"
        style={{ background: color, boxShadow: `0 0 8px ${color}`, opacity: on ? 1 : 0.5 }}
      />
    </div>
  )
}
