import { NextRequest } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'

// Stripe requires the raw body for signature verification — do not parse JSON first
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return Response.json({ error: 'Missing signature' }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not set')
    return Response.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err: any) {
    console.error('Stripe webhook verification failed:', err.message)
    return Response.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const balanceId = session.metadata?.balance_id

    if (!balanceId) {
      console.error('Webhook: no balance_id in metadata', session.id)
      return Response.json({ received: true })
    }

    const amountPaid = (session.amount_total ?? 0) / 100

    const serviceClient = createServiceClient()
    const { error } = await serviceClient
      .from('balances')
      .update({
        amount_paid: amountPaid,
        payment_method: 'stripe',
        status: 'paid',
      })
      .eq('id', balanceId)

    if (error) {
      console.error('Webhook: failed to update balance', balanceId, error)
      return Response.json({ error: 'DB update failed' }, { status: 500 })
    }
  }

  return Response.json({ received: true })
}
