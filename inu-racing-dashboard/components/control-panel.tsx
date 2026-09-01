'use client'

import { useEffect, useRef, useState } from 'react'
import { Bookmark as BookmarkIcon, Play, Square, Trash2 } from 'lucide-react'
import type { Bookmark, Session } from '@/lib/types'
import { RenameButton } from '@/components/rename-button'

interface ControlPanelProps {
  measuring: boolean
  sessionStart: number | null
  bookmarks: Bookmark[]
  sessions: Session[]
  onToggleMeasurement: () => void
  /** Lab Time mark: label + the real start/end instants of the window being marked. */
  onAddBookmark: (label: string, startTs: number, endTs: number) => void
  onDeleteSession: (id: string) => void
  onRenameSession: (id: string, name: string) => void
  /** Clicking a Lab Log row jumps straight to Lab View for that recording. */
  onOpenLabView: (from: number, to: number, title: string) => void
}

/** Click once to arm, click again within 4s to actually delete — no browser confirm() dialog. */
function DeleteSessionButton({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (!armed) {
      setArmed(true)
      resetTimer.current = setTimeout(() => setArmed(false), 4000)
      return
    }
    if (resetTimer.current) clearTimeout(resetTimer.current)
    onConfirm()
  }

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current)
  }, [])

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider transition-colors ${
        armed
          ? 'bg-racing-red text-white'
          : 'text-muted-foreground hover:text-racing-red'
      }`}
      aria-label={armed ? 'Confirm delete' : 'Delete record'}
    >
      <Trash2 className="size-3" aria-hidden="true" />
      {armed ? 'Confirm?' : ''}
    </button>
  )
}

function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000)
  const h = String(Math.floor(total / 3600)).padStart(2, '0')
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function SectionHeader({
  label,
  right,
}: {
  label: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-3 py-2">
      <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-foreground">
        {label}
      </h2>
      {right}
    </div>
  )
}

export function ControlPanel({
  measuring,
  sessionStart,
  bookmarks,
  sessions,
  onToggleMeasurement,
  onAddBookmark,
  onDeleteSession,
  onRenameSession,
  onOpenLabView,
}: ControlPanelProps) {
  const [label, setLabel] = useState('')
  const [elapsed, setElapsed] = useState('00:00:00')

  // Lab Time marking: null while not marking. Set to the real start instant when "Start Mark"
  // is pressed; "End Mark" closes it out and submits the whole window as one bookmark.
  const [markStart, setMarkStart] = useState<number | null>(null)
  const [markElapsed, setMarkElapsed] = useState('00:00:00')

  useEffect(() => {
    if (!measuring || !sessionStart) {
      setElapsed('00:00:00')
      return
    }
    const id = setInterval(() => {
      setElapsed(formatElapsed(Date.now() - sessionStart))
    }, 1000)
    return () => clearInterval(id)
  }, [measuring, sessionStart])

  useEffect(() => {
    if (markStart === null) {
      setMarkElapsed('00:00:00')
      return
    }
    const id = setInterval(() => setMarkElapsed(formatElapsed(Date.now() - markStart)), 1000)
    return () => clearInterval(id)
  }, [markStart])

  function startMark() {
    if (!label.trim()) return
    setMarkStart(Date.now())
  }

  function endMark() {
    if (markStart === null) return
    onAddBookmark(label.trim(), markStart, Date.now())
    setMarkStart(null)
    setLabel('')
  }

  // Pressing Stop while a mark is still open used to just discard it — a real data-loss trap,
  // since the natural workflow is "Start Mark, do the lap, Stop" without necessarily remembering
  // a separate End Mark step first. Close the mark out here, BEFORE the Lab itself stops: doing
  // it reactively after (watching `measuring` flip false) raced against the session state that
  // backs onAddBookmark going stale/null at the same moment, since both come from the same
  // activeLab transition — closing it proactively, while the session is still known-valid,
  // sidesteps that entirely.
  function handleToggle() {
    if (measuring && markStart !== null) {
      onAddBookmark(label.trim(), markStart, Date.now())
      setMarkStart(null)
      setLabel('')
    }
    onToggleMeasurement()
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Measurement control */}
      <section className="rounded border border-border bg-card">
        <SectionHeader
          label="Lab Control"
          right={
            <span className="font-mono text-sm font-bold tabular-nums text-foreground">
              {elapsed}
            </span>
          }
        />
        <div className="p-3">
          <button
            onClick={handleToggle}
            className="flex h-11 w-full items-center justify-center gap-2 rounded font-mono text-xs font-bold uppercase tracking-widest text-white transition-transform active:translate-y-px"
            style={{
              background: measuring ? 'var(--racing-red)' : 'var(--racing-green)',
            }}
          >
            {measuring ? (
              <>
                <Square className="size-4 fill-current" aria-hidden="true" />
                Stop
              </>
            ) : (
              <>
                <Play className="size-4 fill-current" aria-hidden="true" />
                Start
              </>
            )}
          </button>

          {/* Lab Time marking: label a start->end window, not a single instant */}
          <div className="mt-3">
            <div className="flex gap-2">
              <input
                id="bookmark"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    if (markStart === null) startMark()
                  }
                }}
                disabled={!measuring || markStart !== null}
                placeholder="LAP 3 · TURN 1"
                className="h-9 w-full rounded border border-input bg-background px-3 font-mono text-xs uppercase text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-racing-gold disabled:opacity-40"
              />
              {markStart === null ? (
                <button
                  onClick={startMark}
                  disabled={!measuring || !label.trim()}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded bg-primary px-3 font-mono text-[0.7rem] font-bold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-30"
                >
                  <BookmarkIcon className="size-3.5" aria-hidden="true" />
                  Start Mark
                </button>
              ) : (
                <button
                  onClick={endMark}
                  className="flex h-9 shrink-0 animate-pulse items-center gap-1.5 rounded bg-racing-red px-3 font-mono text-[0.7rem] font-bold uppercase tracking-wider text-white transition-colors hover:bg-racing-red/85"
                >
                  <Square className="size-3.5 fill-current" aria-hidden="true" />
                  End Mark · {markElapsed}
                </button>
              )}
            </div>

            {/* Current session's lab times */}
            <div className="mt-2.5 max-h-32 space-y-px overflow-y-auto">
              {bookmarks.length === 0 ? (
                <p className="py-2 text-center font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground/50">
                  {measuring ? 'No lab times yet' : 'Start to mark'}
                </p>
              ) : (
                bookmarks
                  .slice()
                  .reverse()
                  .map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between border-l-2 border-racing-gold bg-secondary/50 px-2.5 py-1.5"
                    >
                      <span className="truncate font-mono text-[0.7rem] uppercase text-foreground">
                        {b.label}
                      </span>
                      <span className="ml-2 shrink-0 font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                        {formatElapsed(b.startElapsed)}–{formatElapsed(b.endElapsed)}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Session history */}
      <section className="rounded border border-border bg-card">
        <SectionHeader
          label="Lab Log"
          right={
            <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
              {String(sessions.length).padStart(2, '0')}
            </span>
          }
        />
        <div className="max-h-64 space-y-px overflow-y-auto p-2">
          {sessions.length === 0 ? (
            <p className="py-6 text-center font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground/50">
              No records
            </p>
          ) : (
            sessions
              .slice()
              .reverse()
              .map((s) => (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenLabView(s.startedAt, s.endedAt, s.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onOpenLabView(s.startedAt, s.endedAt, s.name)
                    }
                  }}
                  className="cursor-pointer border border-border bg-background p-2.5 transition-colors hover:bg-secondary/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-mono text-xs font-semibold uppercase text-foreground">
                        {s.name}
                      </span>
                      <RenameButton currentName={s.name} onRename={(name) => onRenameSession(s.id, name)} />
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                        {formatElapsed(s.durationMs)}
                      </span>
                      <DeleteSessionButton onConfirm={() => onDeleteSession(s.id)} />
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 font-mono text-[0.65rem] uppercase text-muted-foreground">
                    <span>
                      Max <span className="text-primary">{Math.round(s.maxSpeed)}</span>
                    </span>
                    <span>
                      Peak{' '}
                      <span className="text-racing-red">
                        {s.maxBatteryTemp.toFixed(0)}°
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <BookmarkIcon className="size-3" aria-hidden="true" />
                      {s.bookmarks.length}
                    </span>
                  </div>
                </div>
              ))
          )}
        </div>
      </section>
    </div>
  )
}
