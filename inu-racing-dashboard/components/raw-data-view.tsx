'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface RawSample {
  time: number
  deviceKey: string
  sessionId: string | null
  steeringAngle: number
  brakeFront: number
  brakeRear: number
  speed: number
  batteryTemp: number
  batteryVoltage: number
  batteryCurrent: number
  rtd: boolean
  precharge: boolean
}

const PAGE_SIZE = 100

const COLUMNS: { key: keyof RawSample; label: string }[] = [
  { key: 'time', label: 'Time' },
  { key: 'deviceKey', label: 'Device' },
  { key: 'steeringAngle', label: 'Steer °' },
  { key: 'brakeFront', label: 'Brake F %' },
  { key: 'brakeRear', label: 'Brake R %' },
  { key: 'speed', label: 'Speed km/h' },
  { key: 'batteryTemp', label: 'Batt °C' },
  { key: 'batteryVoltage', label: 'Batt V' },
  { key: 'batteryCurrent', label: 'Batt A' },
  { key: 'rtd', label: 'RTD' },
  { key: 'precharge', label: 'PreChg' },
]

// Shows telemetry_samples rows exactly as stored in Postgres — no aggregation, no downsampling.
export function RawDataView() {
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<RawSample[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/telemetry/raw?page=${page}&pageSize=${PAGE_SIZE}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { rows: RawSample[]; total: number } | null) => {
        if (cancelled || !data) return
        setRows(data.rows)
        setTotal(data.total)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-px overflow-hidden rounded border border-border bg-border">
      <div className="flex items-center justify-between bg-card px-4 py-3">
        <span className="font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground">
          {total.toLocaleString()} rows total — exactly as stored, newest first
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex size-7 items-center justify-center rounded border border-border text-muted-foreground disabled:opacity-30"
            aria-label="Previous page"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="flex size-7 items-center justify-center rounded border border-border text-muted-foreground disabled:opacity-30"
            aria-label="Next page"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto bg-card">
        <table className="w-full min-w-[900px] border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-border">
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className="whitespace-nowrap px-3 py-2 text-left uppercase tracking-wider text-muted-foreground"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-muted-foreground/50">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-muted-foreground/50">
                  No data
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.time + r.deviceKey} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-foreground">
                    {new Date(r.time).toLocaleString('en-US', { hour12: false })}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-foreground">{r.deviceKey}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-foreground">
                    {r.steeringAngle.toFixed(1)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-foreground">
                    {r.brakeFront.toFixed(1)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-foreground">
                    {r.brakeRear.toFixed(1)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-foreground">
                    {r.speed.toFixed(1)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-foreground">
                    {r.batteryTemp.toFixed(1)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-foreground">
                    {r.batteryVoltage.toFixed(1)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-foreground">
                    {r.batteryCurrent.toFixed(1)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-foreground">{r.rtd ? 'Y' : 'N'}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-foreground">
                    {r.precharge ? 'Y' : 'N'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
