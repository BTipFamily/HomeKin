// Types and wording for closing an account.
//
// A plain module, for the reason lib/surveys.ts spells out and the
// ReferenceError in that file proved: a 'use server' module may export async
// functions and nothing else, and a `export type { … }` re-export survives the
// transform as a bare runtime identifier.

export type AccountLoss = { label: string; count: number }

export type AccountDeletionPreview =
  | {
      ok: true
      name: string
      email: string
      /** Rows that will be destroyed. Zero-count entries are dropped. */
      losses: AccountLoss[]
      amountOwed: number
      amountPaid: number
      /** Set when deletion is refused, with the reason and what to do about it. */
      blocker: string | null
    }
  | { ok: false; message: string }

export type AccountDeletionResult =
  | { ok: true; name: string; loginWarning: string | null }
  | { ok: false; message: string }

/**
 * What somebody is agreeing to.
 *
 * Money is called out separately from the row counts because it is the one
 * thing here that involves other people: a balance is the committee's record as
 * much as it is yours, and deleting the account destroys their copy too. Saying
 * so is not a deterrent, it is the truth about what the button does.
 */
export function describeAccountLoss(input: {
  losses: AccountLoss[]
  amountOwed: number
  amountPaid: number
}): string[] {
  const warnings: string[] = []

  if (input.amountPaid > 0) {
    warnings.push(
      `$${input.amountPaid.toFixed(2)} you have paid is recorded against your name. ` +
        `Deleting your account destroys the committee's record of it as well as yours, ` +
        `so take a copy first if you may need to show it.`
    )
  }

  if (input.amountOwed > input.amountPaid) {
    const outstanding = input.amountOwed - input.amountPaid
    warnings.push(
      `$${outstanding.toFixed(2)} is still outstanding. Deleting your account does not settle it ` +
        `and does not tell anybody you have gone — speak to the committee if money is owed either way.`
    )
  }

  if (input.losses.some((l) => l.label === 'Family relationships')) {
    warnings.push(
      'You will be removed from the family tree. Relatives connected only through you may end up ' +
        'disconnected from each other.'
    )
  }

  warnings.push(
    'Photographs you uploaded stay in the album, and messages you sent stay in the conversation — ' +
      'they simply stop carrying your name. Anything that is yours alone goes.'
  )

  return warnings
}
