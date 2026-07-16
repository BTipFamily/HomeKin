'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Mail, CheckCircle2, Eye, EyeOff } from 'lucide-react'

function LoginForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const next = searchParams.get('next') || '/dashboard'

  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setStatus('error')
    } else {
      router.push(next)
      router.refresh()
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })

    if (error) {
      setError(error.message)
      setStatus('error')
    } else {
      setStatus('sent')
    }
  }

  if (status === 'sent') {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Check your email</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We sent a magic link to <strong>{email}</strong>.
                <br />
                Click the link to sign in — it expires in 1 hour.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStatus('idle')}>
              Use a different email
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in to HomeKin</CardTitle>
        <CardDescription>
          {mode === 'password'
            ? 'Enter your email and password.'
            : 'Enter your email and we'll send you a magic link.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={mode === 'password' ? handlePasswordSignIn : handleMagicLink}
          className="space-y-4"
        >
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          {mode === 'password' && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={status === 'loading'}>
            {mode === 'password' ? (
              status === 'loading' ? 'Signing in...' : 'Sign in'
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                {status === 'loading' ? 'Sending...' : 'Send magic link'}
              </>
            )}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'password' ? 'magic' : 'password')
              setError('')
              setStatus('idle')
            }}
            className="text-primary hover:underline"
          >
            {mode === 'password' ? 'Forgot password? Use magic link instead' : 'Sign in with password'}
          </button>
        </div>

        <p className="mt-2 text-center text-sm text-muted-foreground">
          New member?{' '}
          <a href="/signup" className="font-medium text-primary hover:underline">
            Join with an invite code
          </a>
        </p>
      </CardContent>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-primary">HomeKin</h1>
        <p className="mt-1 text-muted-foreground">Your family reunion, all in one place</p>
      </div>
      <div className="w-full max-w-sm">
        <Suspense fallback={<div className="text-center text-muted-foreground">Loading...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
