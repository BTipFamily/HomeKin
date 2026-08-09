import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppNav } from '@/components/layout/app-nav'
import { PresenceHeartbeat } from '@/components/presence-heartbeat'
import { Toaster } from '@/components/ui/toaster'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Load the member record for this auth user
  const { data: member } = await supabase
    .from('members')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (!member) {
    // Auth user exists but no member profile yet — shouldn't happen in normal flow
    redirect('/login?error=no_profile')
  }

  // Load all reunions for the nav switcher
  const { data: reunions } = await supabase
    .from('reunions')
    .select('*')
    .order('year', { ascending: false })

  return (
    <div className="flex min-h-screen flex-col">
      {/* Keeps last_seen_at fresh so the chat roster knows who is around. */}
      <PresenceHeartbeat />
      <AppNav member={member} reunions={reunions ?? []} />
      <main className="flex-1">{children}</main>
      <Toaster />
    </div>
  )
}
