'use client'

import { useEffect, useRef, useState } from 'react'
import type { Bookmark, TelemetryPoint, TelemetrySnapshot } from '@/lib/types'

const MAX_HISTORY = 60 // keep last 60 samples for the graphs
// Caps UI updates to 10/s regardless of how fast samples arrive. The gauge components'
// CSS transition durations (circular-gauge.tsx, steering-gauge.tsx, brake-bars.tsx — currently
// 90ms) are deliberately shorter than this, so each transition finishes before the next
// snapshot lands instead of getting interrupted mid-flight. Keep them in that relationship if
// either one changes.
const RENDER_INTERVAL_MS = 100

interface LiveTelemetryMessage {
  type: 'telemetry'
  time: number
  steeringAngle: number
  brakeFront: number
  brakeRear: number
  speed: number
  batteryTemp: number
  batteryVoltage: number
  batteryCurrent: number
  rtd: boolean
  preCharge: boolean
}

interface DeviceStatusMessage {
  type: 'device_status'
  deviceKey: string
  online: boolean
  lastSeenAt: number | null
  connectedAt: number | null
}

export interface ActiveLab {
  sessionId: string
  name: string
  startedAt: number
}

/**
 * Connects to inu-telemetry-server's /live endpoint (short-lived ticket minted by
 * /api/ws-ticket, so the browser never holds a long-lived secret) and streams real telemetry
 * from the car. Reconnects with exponential backoff on drop.
 *
 * `online` reflects two things combined, not just this browser's own connection: whether this
 * tab's /live WebSocket is up (linkUp) AND whether the car itself is currently connected on
 * /device, as reported by the server (deviceOnline) — a viewer with a perfectly fine connection
 * to the server should still see "No Link" if the car dropped off. `lastUpdateAt` is exposed so
 * the UI can show how stale the last known values are instead of just a flat offline flag.
 * `deviceConnectedAt` is when the *current* device connection was authenticated (null while
 * offline) — separate from `lastUpdateAt`, which tracks the newest telemetry frame, not when the
 * connection itself started; it's what lets the UI show "connected for Xh Ym".
 *
 * Incoming samples can arrive much faster than the graphs/gauges can usefully redraw — every
 * setState here would otherwise re-render six recharts panels per message, which is what made
 * the live view visibly stutter. Samples are buffered in refs and flushed to React state at a
 * fixed 10Hz instead, so render rate stays smooth no matter how fast the source sends. No
 * samples are dropped — they're batched into `history`, not skipped.
 *
 * `activeLab`/`activeBookmarks` are server-authoritative, not local UI state: every connected
 * viewer gets the same lab_started/lab_stopped/lab_mark broadcasts (see
 * inu-telemetry-server/src/server.ts's applyBroadcastEvent + PROTOCOL.md), and a fresh/reconnected
 * viewer is resynced immediately via `lab_state` on welcome — that's what keeps Start/Stop/Lab-Time
 * identical across every screen watching the car instead of each browser tracking it independently.
 * `labEventTick` bumps on every lab_started/lab_stopped/lab_deleted so callers know when to refetch
 * the Lab Log list from the REST API.
 */
export function useTelemetry() {
  const [linkUp, setLinkUp] = useState(false)
  const [deviceOnline, setDeviceOnline] = useState(false)
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null)
  const [deviceConnectedAt, setDeviceConnectedAt] = useState<number | null>(null)
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot>(() => ({
    timestamp: Date.now(),
    steeringAngle: 0,
    brakeFront: 0,
    brakeRear: 0,
    speed: 0,
    batteryTemp: 0,
    batteryVoltage: 0,
    batteryCurrent: 0,
    rtd: false,
    preCharge: false,
  }))
  const [history, setHistory] = useState<TelemetryPoint[]>([])
  const [activeLab, setActiveLab] = useState<ActiveLab | null>(null)
  const [activeBookmarks, setActiveBookmarks] = useState<Bookmark[]>([])
  const [labEventTick, setLabEventTick] = useState(0)

  const startRef = useRef(Date.now())
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectDelayRef = useRef(1000)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelledRef = useRef(false)

  // Buffered since the last flush — written on every WS message, read only by the flush timer.
  const pendingSnapshotRef = useRef<TelemetrySnapshot | null>(null)
  const pendingPointsRef = useRef<TelemetryPoint[]>([])
  const pendingDeviceOnlineRef = useRef<boolean | null>(null)
  const pendingLastUpdateAtRef = useRef<number | null>(null)
  // undefined = no pending change; null is itself a valid pending value (device went offline),
  // so it can't double as the "nothing to flush" sentinel the way the other pending refs use it.
  const pendingConnectedAtRef = useRef<number | null | undefined>(undefined)

  function clearHistory() {
    pendingPointsRef.current = []
    setHistory([])
  }

  useEffect(() => {
    cancelledRef.current = false

    const flushTimer = setInterval(() => {
      if (pendingDeviceOnlineRef.current !== null) {
        setDeviceOnline(pendingDeviceOnlineRef.current)
        pendingDeviceOnlineRef.current = null
      }
      if (pendingLastUpdateAtRef.current !== null) {
        setLastUpdateAt(pendingLastUpdateAtRef.current)
        pendingLastUpdateAtRef.current = null
      }
      if (pendingConnectedAtRef.current !== undefined) {
        setDeviceConnectedAt(pendingConnectedAtRef.current)
        pendingConnectedAtRef.current = undefined
      }
      if (pendingSnapshotRef.current) {
        setSnapshot(pendingSnapshotRef.current)
        pendingSnapshotRef.current = null
      }
      if (pendingPointsRef.current.length > 0) {
        const newPoints = pendingPointsRef.current
        pendingPointsRef.current = []
        setHistory((prev) => {
          const nextHistory = [...prev, ...newPoints]
          return nextHistory.length > MAX_HISTORY
            ? nextHistory.slice(nextHistory.length - MAX_HISTORY)
            : nextHistory
        })
      }
    }, RENDER_INTERVAL_MS)

    async function connect() {
      if (cancelledRef.current) return
      try {
        const res = await fetch('/api/ws-ticket')
        if (!res.ok) throw new Error(`ws-ticket failed: ${res.status}`)
        const { ticket } = (await res.json()) as { ticket: string }
        if (cancelledRef.current) return

        const base = process.env.NEXT_PUBLIC_TELEMETRY_WS_URL ?? ''
        const ws = new WebSocket(`${base}/live`)
        wsRef.current = ws

        ws.addEventListener('open', () => {
          ws.send(JSON.stringify({ type: 'auth', ticket }))
        })

        ws.addEventListener('message', (event) => {
          const msg = JSON.parse(event.data)
          if (msg.type === 'welcome') {
            setLinkUp(true)
            reconnectDelayRef.current = 1000
          } else if (msg.type === 'auth_error') {
            setLinkUp(false)
            ws.close()
          } else if (msg.type === 'device_status') {
            const d = msg as DeviceStatusMessage
            pendingDeviceOnlineRef.current = d.online
            if (d.lastSeenAt) pendingLastUpdateAtRef.current = d.lastSeenAt
            pendingConnectedAtRef.current = d.connectedAt
          } else if (msg.type === 'telemetry') {
            const t = msg as LiveTelemetryMessage
            pendingDeviceOnlineRef.current = true
            pendingLastUpdateAtRef.current = t.time

            pendingSnapshotRef.current = {
              timestamp: t.time,
              steeringAngle: t.steeringAngle,
              brakeFront: t.brakeFront,
              brakeRear: t.brakeRear,
              speed: t.speed,
              batteryTemp: t.batteryTemp,
              batteryVoltage: t.batteryVoltage,
              batteryCurrent: t.batteryCurrent,
              rtd: t.rtd,
              preCharge: t.preCharge,
            }

            const elapsed = (t.time - startRef.current) / 1000
            const d = new Date(t.time)
            pendingPointsRef.current.push({
              t: elapsed,
              // Millisecond precision matters here — at real sample rates several points can
              // land in the same second, and HH:MM:SS alone would make them indistinguishable
              // on the tooltip/axis.
              time: `${d.toLocaleTimeString('en-US', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`,
              steeringAngle: Math.round(t.steeringAngle),
              brakeFront: Math.round(t.brakeFront),
              brakeRear: Math.round(t.brakeRear),
              speed: Math.round(t.speed),
              batteryTemp: Math.round(t.batteryTemp * 10) / 10,
              batteryVoltage: Math.round(t.batteryVoltage * 10) / 10,
              batteryCurrent: Math.round(t.batteryCurrent),
              kw: Math.round(((t.batteryVoltage * t.batteryCurrent) / 1000) * 10) / 10,
            })
            // A burst between two flushes shouldn't grow past what the graph will ever show.
            if (pendingPointsRef.current.length > MAX_HISTORY) {
              pendingPointsRef.current = pendingPointsRef.current.slice(-MAX_HISTORY)
            }
          } else if (msg.type === 'lab_state') {
            setActiveLab(msg.active)
            setActiveBookmarks(msg.bookmarks)
          } else if (msg.type === 'lab_started') {
            setActiveLab({ sessionId: msg.sessionId, name: msg.name, startedAt: msg.startedAt })
            setActiveBookmarks([])
            setLabEventTick((n) => n + 1)
          } else if (msg.type === 'lab_stopped') {
            setActiveLab(null)
            setActiveBookmarks([])
            setLabEventTick((n) => n + 1)
          } else if (msg.type === 'lab_mark') {
            setActiveBookmarks((prev) => [...prev, msg.bookmark])
          } else if (msg.type === 'lab_deleted') {
            setLabEventTick((n) => n + 1)
          } else if (msg.type === 'lab_renamed') {
            setActiveLab((prev) => (prev && prev.sessionId === msg.sessionId ? { ...prev, name: msg.name } : prev))
            setLabEventTick((n) => n + 1)
          } else if (msg.type === 'graph_reset') {
            clearHistory()
          }
        })

        ws.addEventListener('close', () => {
          setLinkUp(false)
          if (cancelledRef.current) return
          reconnectTimerRef.current = setTimeout(connect, reconnectDelayRef.current)
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 10_000)
        })

        ws.addEventListener('error', () => ws.close())
      } catch {
        setLinkUp(false)
        if (cancelledRef.current) return
        reconnectTimerRef.current = setTimeout(connect, reconnectDelayRef.current)
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 10_000)
      }
    }

    void connect()

    return () => {
      cancelledRef.current = true
      clearInterval(flushTimer)
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [])

  // Broadcasts a graph_reset over /live (see /api/graph-reset) so every viewer resets together,
  // rather than clearing only this browser's own window.
  async function resetHistory() {
    await fetch('/api/graph-reset', { method: 'POST' })
  }

  return {
    online: linkUp && deviceOnline,
    snapshot,
    history,
    lastUpdateAt,
    deviceConnectedAt,
    resetHistory,
    activeLab,
    activeBookmarks,
    labEventTick,
  }
}
