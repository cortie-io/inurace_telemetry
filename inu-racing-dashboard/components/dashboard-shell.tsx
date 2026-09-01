'use client'

import { signOut } from 'next-auth/react'
import { Dashboard } from '@/components/dashboard'

export function DashboardShell({ username }: { username: string }) {
  return (
    <Dashboard
      username={username}
      onLogout={() => signOut({ callbackUrl: '/login' })}
    />
  )
}
