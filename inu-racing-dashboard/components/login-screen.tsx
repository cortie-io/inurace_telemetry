'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { useState } from 'react'

export function LoginScreen() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await signIn('credentials', {
        username: username.trim(),
        password,
        redirect: false,
      })
      if (result?.error) {
        setError('Invalid username or password')
        return
      }
      router.push('/')
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center">
          <div className="relative h-32 w-72 overflow-hidden">
            <Image
              src="/inu-racing-logo.png"
              alt="INU Racing Team"
              fill
              priority
              className="object-cover object-center"
            />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded border border-border bg-card">
          {/* accent rule */}
          <div className="flex h-1 w-full">
            <div className="w-16 bg-racing-gold" />
            <div className="flex-1 bg-primary" />
          </div>

          <div className="border-b border-border px-5 py-4">
            <h1 className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-foreground">
              Crew Access
            </h1>
            <p className="mt-0.5 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
              Telemetry Dashboard
            </p>
          </div>

          <div className="p-5">
            <label
              htmlFor="username"
              className="mb-1.5 block font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="driver.name"
              className="mb-4 h-11 w-full rounded border border-input bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary"
            />

            <label
              htmlFor="password"
              className="mb-1.5 block font-mono text-[0.7rem] uppercase tracking-widest text-muted-foreground"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mb-2 h-11 w-full rounded border border-input bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary"
            />

            {error && (
              <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-wider text-racing-red">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !username.trim() || !password}
              className="mt-4 h-11 w-full rounded bg-primary font-mono text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-racing-gold disabled:opacity-40"
            >
              {submitting ? 'Signing In…' : 'Sign In'}
            </button>
          </div>
        </form>

        <p className="mt-6 text-center font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground/60">
          INU Racing Team · Electric Kit Car
        </p>
      </div>
    </main>
  )
}
