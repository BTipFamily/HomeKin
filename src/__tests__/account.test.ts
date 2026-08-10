import { describe, it, expect } from 'vitest'
import { describeAccountLoss } from '@/lib/account'

// What somebody is told before they close their account.
//
// App Store guideline 5.1.1(v) requires the deletion to be possible. Being
// honest about what it destroys is not required by anybody — it is required
// because a balance is the committee's record as much as it is yours, and
// finding that out afterwards is finding out too late.

const NOTHING = { losses: [], amountOwed: 0, amountPaid: 0 }

describe('what deleting your account costs', () => {
  it('always explains what survives, even with nothing owed and nothing posted', () => {
    const warnings = describeAccountLoss(NOTHING)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('stop carrying your name')
  })

  it('warns about money already paid, and says to keep a copy', () => {
    const warnings = describeAccountLoss({ ...NOTHING, amountOwed: 240, amountPaid: 240 })
    expect(warnings.join(' ')).toContain('$240.00 you have paid')
    expect(warnings.join(' ')).toContain('take a copy')
  })

  it('warns about money still owed, and does not pretend deleting settles it', () => {
    const warnings = describeAccountLoss({ ...NOTHING, amountOwed: 240, amountPaid: 100 })
    const text = warnings.join(' ')
    expect(text).toContain('$140.00 is still outstanding')
    expect(text).toContain('does not settle it')
  })

  it('does not raise an outstanding balance when everything is paid', () => {
    const text = describeAccountLoss({ ...NOTHING, amountOwed: 240, amountPaid: 240 }).join(' ')
    expect(text).not.toContain('outstanding')
  })

  it('says nothing about money when there is none', () => {
    const text = describeAccountLoss(NOTHING).join(' ')
    expect(text).not.toContain('$')
  })

  it('warns that relatives can be left disconnected', () => {
    const warnings = describeAccountLoss({
      ...NOTHING,
      losses: [{ label: 'Family relationships', count: 4 }],
    })
    expect(warnings.join(' ')).toContain('family tree')
    expect(warnings.join(' ')).toContain('disconnected')
  })

  it('does not mention the family tree for somebody who is not in it', () => {
    const text = describeAccountLoss({
      ...NOTHING,
      losses: [{ label: 'Event signups', count: 2 }],
    }).join(' ')
    expect(text).not.toContain('family tree')
  })

  it('formats money to the cent rather than dumping a float', () => {
    const text = describeAccountLoss({ ...NOTHING, amountOwed: 33.333, amountPaid: 10.5 }).join(' ')
    expect(text).toContain('$10.50')
    expect(text).not.toContain('33.333')
  })
})
