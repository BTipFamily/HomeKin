import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { getReunionReport } from '@/lib/actions/member-history'
import ReportClient from './report-client'

interface ReportPageProps {
  params: Promise<{ id: string }>
}

export default async function ReunionReportPage({ params }: ReportPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()
  if (!member || !['committee', 'admin'].includes(member.role)) redirect(`/reunion/${id}`)

  const report = await getReunionReport(id)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href={`/reunion/${id}`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {report.reunionName}
        </Link>
      </Button>

      <h1 className="text-2xl font-bold">Signups &amp; Payments Report</h1>
      <p className="mt-1 text-muted-foreground">
        Every member&apos;s events and payments for {report.reunionName}.
      </p>

      {report.rows.length === 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Nothing to report yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Nobody has signed up for an event in this reunion yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6">
          <ReportClient report={report} reunionId={id} />
        </div>
      )}
    </div>
  )
}
