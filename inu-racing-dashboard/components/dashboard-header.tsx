'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { Gauge, LogOut, Maximize2 } from 'lucide-react'
import { formatAgo, formatDuration } from '@/lib/utils'

interface DashboardHeaderProps {
  online: boolean
  lastUpdateAt: number | null
  deviceConnectedAt: number | null
  username: string
  onLogout: () => void
  onLaunchGauges: () => void
}

export function DashboardHeader({
  online,
  lastUpdateAt,
  deviceConnectedAt,
  username,
  onLogout,
  onLaunchGauges,
}: DashboardHeaderProps) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-[1600px] items-stretch justify-between">
        <div className="flex items-center">
          <div className="relative h-14 w-20 shrink-0 overflow-hidden border-r border-border px-2 sm:w-32 sm:px-4">
            <Image
              src="/inu-racing-logo.png"
              alt="INU Racing Team"
              fill
              priority
              className="object-cover object-center"
            />
          </div>
          <div className="hidden items-center px-4 sm:flex">
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.35em] text-foreground">
              Telemetry/Data Logger
            </span>
          </div>
        </div>

        <div className="flex items-stretch">
          {/* Connection status — the text column (which can run as wide as "Car Disconnected")
              is hidden below sm: to keep this row from overflowing on narrow phones; the
              animated dot alone still conveys online/offline at a glance, and the bottom
              NetworkStatusBar footer repeats the same state in full text regardless of width. */}
          <div
            className="flex items-center gap-2.5 border-l border-border px-2.5 sm:px-4"
            role="status"
            aria-live="polite"
          >
            <span
              className="relative flex size-2.5 shrink-0"
              style={{
                background: online ? 'var(--racing-green)' : 'var(--racing-red)',
              }}
            >
              {online && (
                <span className="absolute inline-flex h-full w-full animate-ping bg-racing-green opacity-60" />
              )}
            </span>
            <div className="hidden flex-col leading-tight sm:flex">
              <span
                className="font-mono text-xs font-bold uppercase tracking-widest"
                style={{
                  color: online ? 'var(--racing-green)' : 'var(--racing-red)',
                }}
              >
                {online ? 'Car Connected' : 'Car Disconnected'}
              </span>
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
                {!now
                  ? 'Signal'
                  : online
                    ? deviceConnectedAt
                      ? `Connected ${formatDuration(deviceConnectedAt, now.getTime())}`
                      : 'Signal'
                    : lastUpdateAt
                      ? formatAgo(lastUpdateAt, now.getTime())
                      : 'Signal'}
              </span>
            </div>
          </div>

          {/* Clock */}
          <div className="hidden flex-col justify-center border-l border-border px-4 md:flex">
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {now
                ? now.toLocaleTimeString('en-US', { hour12: false })
                : '--:--:--'}
            </span>
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
              {now
                ? now.toLocaleDateString('en-US', {
                    month: 'short',
                    day: '2-digit',
                  })
                : '—'}
            </span>
          </div>

          {/* User */}
          <div className="hidden items-center gap-2.5 border-l border-border px-4 lg:flex">
            <span className="flex size-7 items-center justify-center bg-primary text-xs font-bold text-primary-foreground">
              {username.charAt(0).toUpperCase()}
            </span>
            <div className="flex flex-col leading-tight">
              <span className="font-mono text-xs font-medium text-foreground">
                {username}
              </span>
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
                Crew
              </span>
            </div>
          </div>

          {/* Launch fullscreen instrument cluster */}
          <button
            onClick={onLaunchGauges}
            className="flex items-center gap-2 border-l border-border px-2.5 font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground sm:px-4"
            aria-label="Open fullscreen gauges"
          >
            <Gauge className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Gauges</span>
            <Maximize2 className="size-3 opacity-70" aria-hidden="true" />
          </button>

          <button
            onClick={onLogout}
            className="flex items-center gap-2 border-l border-border px-2.5 font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:bg-racing-red hover:text-white sm:px-4"
            aria-label="Log out"
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </div>
      {/* Brand accent rule */}
      <div className="flex h-0.5 w-full">
        <div className="w-32 bg-racing-gold" />
        <div className="flex-1 bg-primary" />
      </div>
    </header>
  )
}
