import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ReunionBottomBar, ReunionTabs } from '@/components/layout/reunion-nav'

// Wraps every reunion page with that reunion's own navigation: a tab row under
// the top bar on desktop, a bottom tab bar on a phone. `reunion-shell` reserves
// room for whichever is showing and exposes its height as --reunion-chrome, so a
// full-height page like the chat can subtract it.
export default async function ReunionLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()
  if (!member) redirect('/login')

  const { data: reunions } = await supabase
    .from('reunions')
    .select('id, name, year')
    .order('year', { ascending: false })

  const reunion = reunions?.find((r) => r.id === id)
  if (!reunion) notFound()

  const navProps = {
    reunionId: id,
    reunionName: reunion.name,
    canManage: ['committee', 'admin'].includes(member.role),
    reunions: reunions ?? [],
  }

  return (
    <>
      <ReunionTabs {...navProps} />
      <div className="reunion-shell">{children}</div>
      <ReunionBottomBar {...navProps} />
    </>
  )
}
