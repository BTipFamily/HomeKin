// Deciding who gets a deadline reminder today.
//
// Kept apart from the cron route and pure, because this is the part with the
// judgement in it: emailing the wrong people, or the same people twice, is the
// failure mode that makes a family stop trusting the app. The route does the
// I/O; this decides.

import {
  buildSchedule,
  daysBetween,
  remindersDueOn,
  type Deadline,
} from '@/lib/payment-schedule'

export type DeadlineWithEvent = Deadline & { sub_event_id: string }

export type ReminderBalance = {
  member_id: string
  sub_event_id: string | null
  amount_owed: number
  amount_paid: number
}

export type ReminderSignup = {
  member_id: string
  sub_event_id: string
  headcount: number
}

export type ReminderCandidate = {
  memberId: string
  subEventId: string
  deadlineId: string
  /** Which reminder in the series — part of the dedupe key. */
  offsetDays: number
  label: string
  dueDate: string
  /** Missing from this checkpoint specifically. */
  shortfall: number
  /** Missing from the event as a whole. */
  eventOutstanding: number
  daysUntilDue: number
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Every reminder that should go out today.
 *
 * A member is a candidate only when the checkpoint firing today is genuinely
 * short for them: someone who paid the whole event up front is never chased for
 * its deposit, and someone who paid the deposit but not the balance is chased
 * only for the balance. That falls out of `buildSchedule` applying payments
 * oldest-first rather than being special-cased here.
 */
export function planReminders(input: {
  /** 'YYYY-MM-DD'. */
  today: string
  deadlines: DeadlineWithEvent[]
  balances: ReminderBalance[]
  signups: ReminderSignup[]
}): ReminderCandidate[] {
  const byEvent = new Map<string, DeadlineWithEvent[]>()
  for (const deadline of input.deadlines) {
    const list = byEvent.get(deadline.sub_event_id) ?? []
    list.push(deadline)
    byEvent.set(deadline.sub_event_id, list)
  }

  const headcounts = new Map<string, number>()
  for (const signup of input.signups) {
    headcounts.set(`${signup.member_id}:${signup.sub_event_id}`, signup.headcount)
  }

  const candidates: ReminderCandidate[] = []

  for (const [subEventId, deadlines] of byEvent) {
    // Which of this event's checkpoints have a reminder falling today, and at
    // which offsets. Computed once per event rather than once per member.
    const firing = deadlines
      .map((deadline) => ({ deadline, offsets: remindersDueOn(deadline, input.today) }))
      .filter((entry) => entry.offsets.length > 0)

    if (firing.length === 0) continue

    const eventBalances = input.balances.filter((b) => b.sub_event_id === subEventId)

    for (const balance of eventBalances) {
      const owed = Number(balance.amount_owed)
      const paid = Number(balance.amount_paid)
      const eventOutstanding = round(Math.max(owed - paid, 0))
      if (eventOutstanding <= 0) continue

      const schedule = buildSchedule({
        amountOwed: owed,
        amountPaid: paid,
        headcount: headcounts.get(`${balance.member_id}:${subEventId}`) ?? 1,
        deadlines,
        asOf: input.today,
      })

      for (const { deadline, offsets } of firing) {
        const instalment = schedule.find((i) => i.deadlineId === deadline.id)
        if (!instalment || instalment.shortfall <= 0) continue

        for (const offsetDays of offsets) {
          candidates.push({
            memberId: balance.member_id,
            subEventId,
            deadlineId: deadline.id,
            offsetDays,
            label: deadline.label,
            dueDate: deadline.due_date,
            shortfall: instalment.shortfall,
            eventOutstanding,
            daysUntilDue: daysBetween(input.today, deadline.due_date),
          })
        }
      }
    }
  }

  // Soonest first, so that if a run hits the daily send ceiling the reminders
  // that get deferred are the least urgent ones.
  return candidates.sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.memberId.localeCompare(b.memberId)
  )
}
