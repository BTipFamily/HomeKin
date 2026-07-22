import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { buildDefaultCategories } from '@/lib/budget-estimator'
import type { BudgetEstimatorValue } from '@/components/budget-estimator-form'
import { BudgetEstimatorPageClient } from './budget-estimator-page-client'

interface BudgetEstimatorPageProps {
  params: Promise<{ id: string }>
}

export default async function BudgetEstimatorPage({ params }: BudgetEstimatorPageProps) {
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
  if (!member) redirect('/login')

  const { data: reunion } = await supabase
    .from('reunions')
    .select('id, name, location_name')
    .eq('id', id)
    .single()
  if (!reunion) notFound()

  const { data: estimate } = await supabase
    .from('reunion_budget_estimates')
    .select('*')
    .eq('reunion_id', id)
    .maybeSingle()

  const hostCity = estimate?.host_city ?? reunion.location_name ?? ''
  const initialValue: BudgetEstimatorValue = estimate
    ? {
        hostCity,
        nights: estimate.nights,
        budgetStyle: estimate.budget_style,
        guests: {
          adults: estimate.adults_count,
          youth: estimate.youth_count,
          toddlers: estimate.toddlers_count,
        },
        lodgingType: estimate.lodging_type,
        categories: estimate.categories,
      }
    : {
        hostCity,
        nights: 1,
        budgetStyle: 'average',
        guests: { adults: 0, youth: 0, toddlers: 0 },
        lodgingType: 'hotel_resort',
        categories: buildDefaultCategories(hostCity, 'average'),
      }

  const canManage = ['committee', 'admin'].includes(member.role)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2 print:hidden">
        <Link href={`/reunion/${id}`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {reunion.name}
        </Link>
      </Button>

      <h1 className="mb-6 text-2xl font-bold print:hidden">{reunion.name} — Budget Estimator</h1>

      <BudgetEstimatorPageClient reunionId={id} initialValue={initialValue} canEdit={canManage} reunionName={reunion.name} />
    </div>
  )
}
