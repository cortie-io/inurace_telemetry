import { redirect } from 'next/navigation'
import { auth } from '@/app/(auth)/auth'
import { DashboardShell } from '@/components/dashboard-shell'

export default async function Page() {
  const session = await auth()
  // Defense in depth — proxy.ts already redirects unauthenticated requests to /login.
  if (!session?.user) {
    redirect('/login')
  }

  return (
    <DashboardShell username={session.user.name ?? session.user.username} />
  )
}
