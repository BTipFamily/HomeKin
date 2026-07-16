'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react'

type InviteStatus = 'checking' | 'valid' | 'invalid' | 'used' | 'expired'

function SignupForm() {
  const searchParams = useSearchParams()
  const codeFromUrl = searchParams.get('code') || ''

  const [code, setCode] = useState(codeFromUrl)
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>(
    codeFromUrl ? 'checking' : 'invalid'
  )
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [phone, setPhone] = useState('')
  const [familyBranch, setFamilyBranch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (codeFromUrl) validateCode(codeFromUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeFromUrl])

  async function validateCode(c: string) {
    if (!c.trim()) return
    setInviteStatus('checking')

    const supabase = createClient()
    const { data, error } = await supabase
      .from('invite_codes')
      .select('id, used_at, expires_at')
      .eq('code', c.trim().toUpperCase())
      .single()

    if (error || !data) {
      setInviteStatus('invalid')
      return
    }
    if (data.used_at) {
      setInviteStatus('used')
      return
    }
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      setInviteStatus('expired')
      return
    }
    setInviteStatus('valid')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (inviteStatus !== 'valid') return
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setSubmitting(true)
    setError('')

    const supabase = createClient()
    const normalizedCode = code.trim().toUpperCase()

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          phone,
          family_branch: familyBranch,
          invite_code: normalizedCode,
        },
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/dashboard&invite_code=${encodeURIComponent(normalizedCode)}`,
      },
    })

    if (authError) {
      setError(authError.message)
      setSubmitting(false)
      return
    }

    // If Supabase returned an immediate session (email confirmation disabled),
    // the callback never fires — provision the member record now.
    if (data.session) {
      const res = await fetch('/api/auth/provision-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, family_branch: familyBranch, invite_code: normalizedCode }),
      })
      if (!res.ok) {
        setError('Account created but profile setup failed. Please contact your admin.')
        setSubmitting(false)
        return
      }
      window.location.href = '/dashboard'
      return
    }

    setEmailSent(true)
  }

  if (emailSent) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Almost there!</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We sent a confirmation link to <strong>{email}</strong>.
                <br />
                Click it to complete your account setup.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join HomeKin</CardTitle>
        <CardDescription>Enter your invite code to create your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Invite code */}
          <div className="space-y-2">
            <Label htmlFor="code">Invite Code</Label>
            <div className="flex gap-2">
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. A1B2C3D4"
                className="font-mono uppercase tracking-widest"
                maxLength={8}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => validateCode(code)}
                disabled={inviteStatus === 'checking'}
              >
                Check
              </Button>
            </div>
            {inviteStatus === 'checking' && (
              <p className="text-xs text-muted-foreground">Checking code...</p>
            )}
            {inviteStatus === 'valid' && (
              <p className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="h-3 w-3" /> Valid invite code
              </p>
            )}
            {inviteStatus === 'invalid' && code && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" /> Invalid invite code
              </p>
            )}
            {inviteStatus === 'used' && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" /> This code has already been used
              </p>
            )}
            {inviteStatus === 'expired' && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" /> This code has expired
              </p>
            )}
          </div>

          {/* Profile fields — only show if code is valid */}
          {inviteStatus === 'valid' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
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
              <div className="space-y-2">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 555-5555"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch">Family Branch (optional)</Label>
                <Input
                  id="branch"
                  value={familyBranch}
                  onChange={(e) => setFamilyBranch(e.target.value)}
                  placeholder="e.g. Grandma Rose's side"
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Creating account...' : 'Create my account'}
              </Button>
            </>
          )}
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <a href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </a>
        </p>
      </CardContent>
    </Card>
  )
}

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-primary">HomeKin</h1>
        <p className="mt-1 text-muted-foreground">Your family reunion, all in one place</p>
      </div>
      <div className="w-full max-w-sm">
        <Suspense fallback={<div className="text-center text-muted-foreground">Loading...</div>}>
          <SignupForm />
        </Suspense>
      </div>
    </div>
  )
}
