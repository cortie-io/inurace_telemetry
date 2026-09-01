'use client'

import { useEffect, useState } from 'react'
import { formatAgo } from '@/lib/utils'

interface NetworkStatusBarProps {
  online: boolean
  lastUpdateAt: number | null
}

// Small always-visible footer so the connection state doesn't require scrolling back up to the
// header to check — same online/lastUpdateAt the header already uses, just pinned to the bottom.
export function NetworkStatusBar({ online, lastUpdateAt }: NetworkStatusBarProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <footer className="sticky bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-4 py-1.5">
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: online ? 'var(--racing-green)' : 'var(--racing-red)' }}
        />
        <span
          className="font-mono text-[0.65rem] uppercase tracking-widest"
          style={{ color: online ? 'var(--racing-green)' : 'var(--racing-red)' }}
        >
          {online ? 'Network OK' : 'Network Down'}
        </span>
        <span className="font-mono text-[0.65rem] text-muted-foreground">
          {lastUpdateAt ? `· last data ${formatAgo(lastUpdateAt, now)}` : ''}
        </span>
      </div>
    </footer>
  )
}
