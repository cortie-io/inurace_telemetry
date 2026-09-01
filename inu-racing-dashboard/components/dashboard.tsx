'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, ChevronLeft, History, PlaySquare, RotateCcw, Table2, Upload } from 'lucide-react'
import { useTelemetry } from '@/hooks/use-telemetry'
import type { BatteryThresholds, Session } from '@/lib/types'
import { DashboardHeader } from '@/components/dashboard-header'
import { LiveTicker } from '@/components/live-ticker'
import { ControlPanel } from '@/components/control-panel'
import { StatusIndicators } from '@/components/status-indicators'
import { ThresholdSettings } from '@/components/threshold-settings'
import { NetworkStatusBar } from '@/components/network-status-bar'
import { GraphView } from '@/components/graph-view'
import { HistoryView } from '@/components/history-view'
import { RawDataView } from '@/components/raw-data-view'
import { LabLogList } from '@/components/lab-log-list'
import { LabPlaybackView } from '@/components/lab-playback-view'
import { CsvViewer } from '@/components/csv-viewer'
import { FullscreenCluster } from '@/components/fullscreen-cluster'

type ViewMode = 'graph' | 'history' | 'raw' | 'lab' | 'viewer'

interface LabViewTarget {
  from: number
  to: number
  title: string
}

const DEFAULT_THRESHOLDS: BatteryThresholds = {
  batteryTempMax: 65,
  batteryVoltageMax: 100,
  batteryCurrentMax: 340,
}

interface DashboardProps {
  username: string
  onLogout: () => void
}

export function Dashboard({ username, onLogout }: DashboardProps) {
  const {
    online,
    snapshot,
    history,
    lastUpdateAt,
    deviceConnectedAt,
    resetHistory,
    activeLab,
    activeBookmarks,
    labEventTick,
  } = useTelemetry()
  const [view, setView] = useState<ViewMode>('graph')
  const [fullscreen, setFullscreen] = useState(false)
  const [thresholds, setThresholds] = useState<BatteryThresholds>(DEFAULT_THRESHOLDS)
  const [labView, setLabView] = useState<LabViewTarget | null>(null)

  const openLabView = useCallback((from: number, to: number, title: string) => {
    setLabView({ from, to, title })
    setView('lab')
  }, [])

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: BatteryThresholds | null) => {
        if (data) setThresholds(data)
      })
  }, [])

  const saveThresholds = useCallback(async (next: BatteryThresholds) => {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    })
    if (res.ok) setThresholds(await res.json())
  }, [])

  const enterFullscreen = useCallback(() => {
    // Try native browser fullscreen; the overlay renders regardless if it's unsupported/denied.
    const el = document.documentElement
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {})
    }
    setFullscreen(true)
  }, [])

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {})
    }
    setFullscreen(false)
  }, [])

  // Recording state is server-authoritative (see hooks/use-telemetry.ts) — derived from
  // activeLab/activeBookmarks, which every connected viewer receives identically over /live, not
  // tracked locally. That's what keeps Start/Stop/Lab-Time/elapsed-timer in sync across screens.
  const measuring = activeLab !== null
  const sessionStart = activeLab?.startedAt ?? null
  const currentSessionId = activeLab?.sessionId ?? null
  const bookmarks = activeBookmarks

  const [sessions, setSessions] = useState<Session[]>([])
  const busyRef = useRef(false) // guards against a double-click firing two start/stop requests

  const refreshSessions = useCallback(async () => {
    const res = await fetch('/api/sessions')
    if (!res.ok) return
    setSessions(await res.json())
  }, [])

  // Refetch the Lab Log whenever a Lab starts/stops/gets deleted anywhere — including from
  // another device, since labEventTick bumps on the broadcast, not just this browser's own action.
  useEffect(() => {
    void refreshSessions()
  }, [refreshSessions, labEventTick])

  const toggleMeasurement = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    try {
      if (currentSessionId) {
        await fetch(`/api/sessions/${currentSessionId}`, { method: 'PATCH' })
      } else {
        await fetch('/api/sessions', { method: 'POST' })
      }
      // No local state mutation here on purpose — the UI updates when the resulting
      // lab_started/lab_stopped broadcast comes back over /live, the same path every other
      // connected viewer uses, so there's only one source of truth instead of an optimistic
      // local update that could disagree with what other screens end up seeing.
    } finally {
      busyRef.current = false
    }
  }, [currentSessionId])

  const addBookmark = useCallback(
    async (label: string, startTs: number, endTs: number) => {
      if (!sessionStart || !currentSessionId) return
      await fetch(`/api/sessions/${currentSessionId}/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          startTs,
          endTs,
          startElapsedMs: startTs - sessionStart,
          endElapsedMs: endTs - sessionStart,
        }),
      })
    },
    [sessionStart, currentSessionId],
  )

  const deleteSession = useCallback(async (id: string) => {
    const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
    if (res.ok) setSessions((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const renameSession = useCallback(async (id: string, name: string) => {
    await fetch(`/api/sessions/${id}/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    // No local mutation — the lab_renamed broadcast bumps labEventTick, which refetches the
    // Lab Log from the REST API, the same one path every other Lab mutation already goes through.
  }, [])

  return (
    <div className="flex min-h-svh flex-col overflow-x-hidden bg-background">
      {/* Header + ticker share one sticky wrapper so they stack correctly without either
          needing to know the other's exact height. */}
      <div className="sticky top-0 z-20">
        <DashboardHeader
          online={online}
          lastUpdateAt={lastUpdateAt}
          deviceConnectedAt={deviceConnectedAt}
          username={username}
          onLogout={onLogout}
          onLaunchGauges={enterFullscreen}
        />
        <LiveTicker data={snapshot} thresholds={thresholds} />
      </div>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr]">
          {/* Left column: controls + status */}
          <div className="flex flex-col gap-5">
            <ControlPanel
              measuring={measuring}
              sessionStart={sessionStart}
              bookmarks={bookmarks}
              sessions={sessions}
              onToggleMeasurement={toggleMeasurement}
              onAddBookmark={addBookmark}
              onDeleteSession={deleteSession}
              onRenameSession={renameSession}
              onOpenLabView={openLabView}
            />
            <StatusIndicators rtd={snapshot.rtd} preCharge={snapshot.preCharge} />
            <ThresholdSettings thresholds={thresholds} onSave={saveThresholds} />
          </div>

          {/* Right column: data display */}
          {/* min-w-0: this is a CSS Grid item (the "1fr" column above), whose default
              min-width:auto lets a deeply-nested wide element (the zoomable telemetry charts)
              push the whole column — and with it the page — wider than intended instead of being
              contained by its own overflow-x-auto scroll wrapper. Without this, the chart's
              excess width doesn't scroll; it just gets silently clipped by the root's
              overflow-x-hidden safety net, which reads as the chart being cut off with no way to
              reach the rest of it. */}
          <section className="flex min-w-0 flex-col">
            <div className="flex items-end justify-between border-b border-border">
              <div className="flex">
                <ViewTab
                  active={view === 'graph'}
                  onClick={() => setView('graph')}
                  icon={<Activity className="size-4" aria-hidden="true" />}
                  label="Graphs"
                />
                <ViewTab
                  active={view === 'history'}
                  onClick={() => setView('history')}
                  icon={<History className="size-4" aria-hidden="true" />}
                  label="History"
                />
                <ViewTab
                  active={view === 'raw'}
                  onClick={() => setView('raw')}
                  icon={<Table2 className="size-4" aria-hidden="true" />}
                  label="Raw Data"
                />
                <ViewTab
                  active={view === 'lab'}
                  onClick={() => setView('lab')}
                  icon={<PlaySquare className="size-4" aria-hidden="true" />}
                  label="Lab View"
                />
                <ViewTab
                  active={view === 'viewer'}
                  onClick={() => setView('viewer')}
                  icon={<Upload className="size-4" aria-hidden="true" />}
                  label="Viewer"
                />
              </div>
              {view === 'graph' && (
                <div className="flex items-center gap-3 pb-2">
                  <button
                    onClick={resetHistory}
                    className="flex items-center gap-1.5 px-2 font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Reset graph on all connected screens"
                  >
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Reset</span>
                  </button>
                  <span
                    className="flex items-center gap-2 px-2 font-mono text-xs uppercase tracking-widest"
                    style={{
                      color: measuring
                        ? 'var(--racing-red)'
                        : 'var(--muted-foreground)',
                    }}
                  >
                    <span
                      className="size-2"
                      style={{
                        background: measuring
                          ? 'var(--racing-red)'
                          : 'var(--muted-foreground)',
                        animation: measuring ? 'pulse 1s infinite' : 'none',
                      }}
                    />
                    {measuring ? 'Recording' : 'Standby'}
                  </span>
                </div>
              )}
            </div>

            <div className="pt-5">
              {view === 'graph' && <GraphView data={history} thresholds={thresholds} />}
              {view === 'history' && (
                <HistoryView liveSessions={sessions} thresholds={thresholds} />
              )}
              {view === 'raw' && <RawDataView />}
              {view === 'lab' &&
                (labView ? (
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => setLabView(null)}
                      className="flex items-center gap-1.5 self-start font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ChevronLeft className="size-3.5" aria-hidden="true" />
                      Back to Lab Log
                    </button>
                    <LabPlaybackView
                      from={labView.from}
                      to={labView.to}
                      title={labView.title}
                      thresholds={thresholds}
                    />
                  </div>
                ) : (
                  <LabLogList
                    sessions={sessions}
                    onDeleteSession={deleteSession}
                    onRenameSession={renameSession}
                    onOpenLabView={openLabView}
                  />
                ))}
              {view === 'viewer' && <CsvViewer thresholds={thresholds} />}
            </div>
          </section>
        </div>
      </main>

      <NetworkStatusBar online={online} lastUpdateAt={lastUpdateAt} />

      {fullscreen && (
        <FullscreenCluster
          data={snapshot}
          thresholds={thresholds}
          onExit={exitFullscreen}
        />
      )}
    </div>
  )
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px flex items-center gap-2 border-b-2 px-2.5 py-3 font-mono text-xs font-semibold uppercase tracking-widest transition-colors sm:px-5 ${
        active
          ? 'border-racing-gold text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
      aria-pressed={active}
      aria-label={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
