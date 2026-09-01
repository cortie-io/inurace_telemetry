'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bookmark as BookmarkIcon, ChevronDown, PlaySquare } from 'lucide-react'
import type { Session } from '@/lib/types'
import { RenameButton } from '@/components/rename-button'

function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000)
  const h = String(Math.floor(total / 3600)).padStart(2, '0')
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

interface LabLogListProps {
  sessions: Session[]
  onDeleteSession: (id: string) => void
  onRenameSession: (id: string, name: string) => void
  onOpenLabView: (from: number, to: number, title: string) => void
}

// The full Lab Log browser — every recorded session, expandable to its Lab Time marks. Used to
// live inside the History tab's date-range picker; moved here so Lab View is the one place to
// both browse and play back recordings, and History stays a pure Archive (range + chart).
export function LabLogList({ sessions, onDeleteSession, onRenameSession, onOpenLabView }: LabLogListProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const sorted = useMemo(() => [...sessions].sort((a, b) => b.startedAt - a.startedAt), [sessions])

  return (
    <div className="flex flex-col gap-px overflow-hidden rounded border border-border bg-border">
      <div className="flex items-center justify-between bg-card px-4 py-2.5">
        <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-foreground">
          Lab Log
        </h3>
        <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
          {String(sorted.length).padStart(2, '0')} TOTAL
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className="bg-card py-10 text-center font-mono text-xs uppercase tracking-wider text-muted-foreground/50">
          No Labs recorded yet
        </p>
      ) : (
        <div className="divide-y divide-border bg-card">
          {sorted.map((s) => {
            const open = openId === s.id
            return (
              <div key={s.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenId(open ? null : s.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setOpenId(open ? null : s.id)
                    }
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50"
                  aria-expanded={open}
                >
                  <ChevronDown
                    className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-xs font-semibold uppercase text-foreground">
                        {s.name}
                      </span>
                      <RenameButton currentName={s.name} onRename={(name) => onRenameSession(s.id, name)} />
                    </span>
                    <span className="font-mono text-[0.7rem] uppercase text-muted-foreground">
                      {new Date(s.startedAt).toLocaleString('en-US', {
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}
                    </span>
                  </div>
                  <div className="hidden items-center gap-4 font-mono text-[0.7rem] uppercase text-muted-foreground sm:flex">
                    <span>
                      Max <span className="text-racing-blue">{Math.round(s.maxSpeed)}</span> km/h
                    </span>
                    <span>
                      Peak <span className="text-racing-red">{s.maxBatteryTemp.toFixed(0)}°</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <BookmarkIcon className="size-3" aria-hidden="true" />
                      {s.bookmarks.length}
                    </span>
                  </div>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">
                    {formatElapsed(s.durationMs)}
                  </span>
                </div>

                {open && (
                  <div className="border-t border-border bg-background px-4 py-3">
                    <div className="mb-2 grid grid-cols-3 gap-px overflow-hidden rounded border border-border bg-border sm:hidden">
                      <MiniStat label="Max" value={`${Math.round(s.maxSpeed)}`} />
                      <MiniStat label="Peak°" value={`${s.maxBatteryTemp.toFixed(0)}`} />
                      <MiniStat label="Marks" value={`${s.bookmarks.length}`} />
                    </div>

                    {/* The whole recorded Lab, start to end — opens the same-tab playback view
                        below it (same layout as live monitoring) rather than an inline chart. */}
                    <button
                      onClick={() => onOpenLabView(s.startedAt, s.endedAt, s.name)}
                      className="mb-3 flex w-full items-center justify-center gap-1.5 rounded bg-primary py-2 font-mono text-[0.7rem] font-bold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/85"
                    >
                      <PlaySquare className="size-3.5" aria-hidden="true" />
                      View Full Lab Recording
                    </button>

                    <div className="mb-2 flex items-center justify-between">
                      <p className="font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                        Lab Times — click to open
                      </p>
                      <DeleteRecordButton onConfirm={() => onDeleteSession(s.id)} />
                    </div>
                    {s.bookmarks.length === 0 ? (
                      <p className="font-mono text-[0.7rem] uppercase text-muted-foreground/50">
                        No lab times marked
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {s.bookmarks.map((b) => (
                          <button
                            key={b.id}
                            onClick={() => onOpenLabView(b.startTimestamp, b.endTimestamp, b.label)}
                            className="flex w-full items-center justify-between border-l-2 border-racing-gold bg-secondary/40 px-2.5 py-1.5 text-left transition-colors hover:bg-secondary/70"
                          >
                            <span className="truncate font-mono text-[0.7rem] uppercase text-foreground">
                              {b.label}
                            </span>
                            <span className="ml-2 shrink-0 font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                              {formatElapsed(b.startElapsed)} – {formatElapsed(b.endElapsed)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-2 py-1.5 text-center">
      <p className="font-mono text-[0.6rem] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function DeleteRecordButton({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        if (!armed) {
          setArmed(true)
          return
        }
        onConfirm()
      }}
      className={`rounded px-2 py-1 font-mono text-[0.65rem] uppercase tracking-wider transition-colors ${
        armed ? 'bg-racing-red text-white' : 'border border-border text-muted-foreground hover:text-racing-red'
      }`}
    >
      {armed ? 'Confirm Delete?' : 'Delete Record'}
    </button>
  )
}
