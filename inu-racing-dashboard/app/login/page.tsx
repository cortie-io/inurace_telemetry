import { redirect } from 'next/navigation'
import { auth } from '@/app/(auth)/auth'
import { LoginScreen } from '@/components/login-screen'

export default async function LoginPage() {
  const session = await auth()
  if (session?.user) {
    redirect('/')
  }

  return <LoginScreen />
}
