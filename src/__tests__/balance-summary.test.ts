// What a member is told they still owe.
//
// The invariant worth protecting: the headline number comes from the balances,
// so a family that has paid in full is never shown its whole bill as owed.

import { summarizeBalances, type BalanceLike } from '@/lib/balance-summary'

const bal = (over: Partial<BalanceLike>): BalanceLike => ({
  sub_event_id: 'e1',
  amount_owed: 0,
  amount_paid: 0,
  status: 'unpaid',
  ...over,
})

describe('summarizeBalances', () => {
  it('is all zeros with no balances', () => {
    expect(summarizeBalances([])).toEqual({
      owed: 0,
      paid: 0,
      outstanding: 0,
      credit: 0,
      awaitingConfirmation: false,
      unattachedOwed: 0,
    })
  })

  it('shows nothing outstanding once everything is paid', () => {
    const s = summarizeBalances([
      bal({ amount_owed: 120, amount_paid: 120, status: 'paid' }),
      bal({ sub_event_id: 'e2', amount_owed: 80, amount_paid: 80, status: 'paid' }),
    ])
    expect(s.owed).toBe(200)
    expect(s.paid).toBe(200)
    expect(s.outstanding).toBe(0)
  })

  it('counts a part payment against what is owed', () => {
    const s = summarizeBalances([bal({ amount_owed: 150, amount_paid: 50, status: 'partially_paid' })])
    expect(s.outstanding).toBe(100)
  })

  it('does not let a credit on one balance pay down another', () => {
    // A cancelled event that was paid for leaves a credit awaiting refund. It is
    // not a payment towards the event they are still going to.
    const s = summarizeBalances([
      bal({ amount_owed: 0, amount_paid: 60, status: 'paid' }),
      bal({ sub_event_id: 'e2', amount_owed: 100, amount_paid: 0 }),
    ])
    expect(s.outstanding).toBe(100)
    expect(s.credit).toBe(60)
  })

  it('accepts numeric columns that arrive as strings', () => {
    const s = summarizeBalances([bal({ amount_owed: '45.50', amount_paid: '20.25' })])
    expect(s.outstanding).toBe(25.25)
  })

  it('never shows float noise as money due', () => {
    const s = summarizeBalances([bal({ amount_owed: 0.3, amount_paid: 0.1 + 0.2 })])
    expect(s.outstanding).toBe(0)
  })

  it('flags a reported payment still waiting on the committee', () => {
    const s = summarizeBalances([bal({ amount_owed: 50, status: 'pending_confirmation' })])
    expect(s.awaitingConfirmation).toBe(true)
  })

  it('separates what is owed outside any event', () => {
    const s = summarizeBalances([
      bal({ amount_owed: 40 }),
      bal({ sub_event_id: null, amount_owed: 25 }),
    ])
    expect(s.owed).toBe(65)
    expect(s.unattachedOwed).toBe(25)
  })
})
