import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppNav } from '@/components/layout/app-nav'

// This layout wraps all reunion sub-pages so the nav knows the currentReunionId
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

  return <>{children}</>
}
