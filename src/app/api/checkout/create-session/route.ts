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

  const paidCents = Math.round(balance.amount_paid * 100)
  const amountDue = Math.round(balance.amount_owed * 100) - paidCents
  if (amountDue <= 0) {
    return Response.json({ error: 'Nothing owed' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const eventName = (balance as any).sub_event?.name ?? 'General Fund'
  const reunionName = (balance as any).reunion?.name ?? 'Reunion'

  // Derived from where this balance actually stands, not from a random id.
  //
  // A member double-tapping "Pay" sends two identical requests; both compute
  // the same key, and Stripe returns the first session rather than opening a
  // second one against the same money. Anything that genuinely changes what is
  // owed — a payment landing, the committee repricing the event — changes the
  // key with it, so the next attempt is a new session for the new amount
  // rather than a cached one for the old.
  const idempotencyKey = `balance:${balanceId}:paid:${paidCents}:due:${amountDue}`

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
    // The same tags again, one level down. Session metadata does not reach the
    // charge, and the charge is all the nightly reconciliation has to work
    // from: without this it cannot tell a HomeKin payment it somehow missed
    // from an unrelated charge on a Stripe account the family also uses for
    // something else, and would report the second as a lost payment every night.
    payment_intent_data: {
      metadata: {
        balance_id: balanceId,
        member_id: member.id,
        reunion_id: balance.reunion_id,
      },
    },
  }, { idempotencyKey })

  // Record the session ID so the webhook can look up this balance
  await serviceClient
    .from('balances')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', balanceId)

  return Response.json({ url: session.url })
}
