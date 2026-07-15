import Stripe from 'stripe'

// Singleton — server-side only, never import in client components
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder', {
  apiVersion: '2026-06-24.dahlia',
})
