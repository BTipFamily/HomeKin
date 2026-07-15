import { NextRequest } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: member } = await supabase
    .from('members')
    .select('id, name, email')
    .eq('auth_user_id', user.id)
    .single()
  if (!member) {
    return Response.json({ error: 'Member not found' }, { status: 404 })
  }

  const body = await request.json()
  const { balanceId } = body as { balanceId: string }
  if (!balanceId) {
    return Response.json({ error: 'balanceId required' }, { status: 400 })
  }

  // Fetch the balance — ensure it belongs to this member
  const serviceClient = createServiceClient()
  const { data: balance } = await serviceClient
    .from('balances')
    .select('*, reunion:reunion_id(name), sub_event:sub_event_id(name)')
    .eq('id', balanceId)
    .eq('member_id', member.id)
    .single()

  if (!balance) {
    return Response.json({ error: 'Balance not found' }, { status: 404 })
  }
  if (balance.status === 'paid') {
    return Response.json({ error: 'Balance already paid' }, { status: 400 })
  }

  const amountDue = Math.round((balance.amount_owed - balance.amount_paid) * 100) // cents
  if (amountDue <= 0) {
    return Response.json({ error: 'Nothing owed' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const eventName = (balance as any).sub_event?.name ?? 'General Fund'
  const reunionName = (balance as any).reunion?.name ?? 'Reunion'

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${reunionName} — ${eventName}`,
          },
          unit_amount: amountDue,
        },
        quantity: 1,
      },
    ],
    customer_email: member.email,
    success_url: `${appUrl}/reunion/${balance.reunion_id}/signups?payment=success`,
    cancel_url: `${appUrl}/reunion/${balance.reunion_id}/signups?payment=cancelled`,
    metadata: {
      balance_id: balanceId,
      member_id: member.id,
      reunion_id: balance.reunion_id,
      sub_event_id: balance.sub_event_id ?? 'general_fund',
    },
  })

  // Record the session ID so the webhook can look up this balance
  await serviceClient
    .from('balances')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', balanceId)

  return Response.json({ url: session.url })
}
