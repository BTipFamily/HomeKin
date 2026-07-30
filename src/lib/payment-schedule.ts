// Turning an event's payment checkpoints into what one member owes, and when.
//
// Deadlines are defined once on the event; what they mean for a given member
// depends on their headcount and what they have already paid. That expansion
// happens here rather than in the database, so nothing is stored that could
// drift when a headcount changes or an event is repriced.
//
// Pure — no database, no clock, no environment. `asOf` is always passed in, so
// a test can sit on either side of a due date without mocking time.

/** A checkpoint as stored on the event. */
export type Deadline = {
  id: string
  label: string
  /** 'YYYY-MM-DD'. Compared as a string throughout: no Date, no timezone. */
  due_date: string
  amount_type: 'percent' | 'fixed_per_person' | 'remainder'
  amount_value: number | null
  reminder_offsets: number[]
  sort_order: number
}

export type InstalmentStatus = 'paid' | 'due' | 'overdue' | 'upcoming'

export type Instalment = {
  /** Null for the implicit instalment an event with no checkpoints gets. */
  deadlineId: string | null
  label: string
  dueDate: string | null
  /** This checkpoint's own share of the total. */
  amountDue: number
  /** Everything required by this date, this checkpoint included. */
  cumulativeRequired: number
  /** Of what has been paid, how much reached this checkpoint. */
  applied: number
  /** What is still missing from this checkpoint. */
  shortfall: number
  status: InstalmentStatus
}

export type ScheduleTotals = {
  /** Shortfall on every checkpoint already due or overdue. */
  dueNow: number
  /** Shortfall on checkpoints whose date has passed. */
  overdue: number
  /** The next checkpoint not yet settled. */
  nextDueDate: string | null
  nextDueAmount: number
  /** Everything not yet paid, whenever it falls due. */
  outstanding: number
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Date arithmetic on 'YYYY-MM-DD' strings.
 *
 * Built through Date.UTC rather than `new Date(str)` so the result never shifts
 * by a day for anyone west of Greenwich — a reminder that fires on the wrong
 * date is the whole feature failing quietly.
 */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  return shifted.toISOString().slice(0, 10)
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const ms = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)
  return Math.round(ms / 86_400_000)
}

/**
 * Orders checkpoints the way a person reads them: by the date the money is due,
 * with `sort_order` breaking a tie the database no longer allows but old data
 * or a future relaxation might still produce.
 */
function inDateOrder(deadlines: Deadline[]): Deadline[] {
  return [...deadlines].sort(
    (a, b) => a.due_date.localeCompare(b.due_date) || a.sort_order - b.sort_order
  )
}

/**
 * What one checkpoint asks for, before capping.
 *
 * `remainder` returns null: it cannot be priced until every other checkpoint
 * has been, so it is filled in afterwards.
 */
function rawAmount(deadline: Deadline, amountOwed: number, headcount: number): number | null {
  switch (deadline.amount_type) {
    case 'percent':
      return round((amountOwed * (deadline.amount_value ?? 0)) / 100)
    case 'fixed_per_person':
      return round((deadline.amount_value ?? 0) * Math.max(headcount, 1))
    case 'remainder':
      return null
  }
}

/**
 * Expands an event's checkpoints into what this member owes by each date.
 *
 * The instalments always sum to exactly `amountOwed`:
 *
 *   * checkpoints are capped as they are allocated, so a schedule adding up to
 *     more than the total cannot bill someone twice for the same money;
 *   * `remainder` takes whatever the others left;
 *   * with no remainder, the last checkpoint absorbs the rounding drift, so
 *     three equal thirds of $100 come to $100 rather than $99.99.
 *
 * Payments settle the earliest checkpoint first, which is what makes a part
 * payment clear the deposit rather than smearing across the whole schedule.
 */
export function buildSchedule(input: {
  amountOwed: number
  amountPaid: number
  headcount: number
  deadlines: Deadline[]
  /** Today, as 'YYYY-MM-DD'. */
  asOf: string
  /** Used for the implicit instalment when the event has no checkpoints. */
  fallbackDueDate?: string | null
}): Instalment[] {
  const owed = round(Math.max(input.amountOwed, 0))
  const paid = round(Math.max(input.amountPaid, 0))
  const ordered = inDateOrder(input.deadlines)

  if (ordered.length === 0) {
    // One implicit checkpoint, so every caller has a single shape to render
    // whether or not the committee set any dates.
    return [
      finish(
        {
          deadlineId: null,
          label: 'Full amount',
          dueDate: input.fallbackDueDate ?? null,
          amountDue: owed,
          cumulativeRequired: owed,
        },
        Math.min(paid, owed),
        input.asOf
      ),
    ]
  }

  // Price everything that can be priced, capping as we go so the checkpoints
  // never ask for more than is owed in total.
  let allocated = 0
  const priced = ordered.map((deadline) => {
    const raw = rawAmount(deadline, owed, input.headcount)
    if (raw === null) return { deadline, amount: null as number | null }
    const amount = round(Math.max(Math.min(raw, owed - allocated), 0))
    allocated = round(allocated + amount)
    return { deadline, amount }
  })

  const remaining = round(Math.max(owed - allocated, 0))
  const remainderIndex = priced.findIndex((p) => p.amount === null)

  // What the checkpoints leave uncovered, as its own trailing instalment.
  let trailing: number | null = null

  if (remainderIndex >= 0) {
    priced[remainderIndex].amount = remaining
  } else if (remaining > 0) {
    // Two very different things can leave money unallocated, and they must not
    // be treated the same way.
    //
    // Rounding is the small one: three equal thirds of $100 come to $99.99, and
    // that last cent belongs on the final checkpoint. At most one cent can go
    // astray per checkpoint, which is what makes this safe to detect by size.
    //
    // Anything larger means the committee simply did not schedule the whole
    // cost — a single "$25 per person deposit" on a $300 event. Folding that
    // into the last dated checkpoint would demand the entire balance on the
    // deposit date, which is not what they set up and not what the member
    // agreed to. It becomes an undated instalment due at the event instead.
    const roundingTolerance = round(priced.length * 0.01)
    if (remaining <= roundingTolerance) {
      const last = priced[priced.length - 1]
      last.amount = round((last.amount ?? 0) + remaining)
    } else {
      trailing = remaining
    }
  }

  // Payments land on the earliest unmet checkpoint first.
  let unapplied = paid
  let cumulative = 0

  const instalments = priced.map(({ deadline, amount }) => {
    const amountDue = amount ?? 0
    cumulative = round(cumulative + amountDue)
    const applied = round(Math.min(unapplied, amountDue))
    unapplied = round(unapplied - applied)

    return finish(
      {
        deadlineId: deadline.id,
        label: deadline.label,
        dueDate: deadline.due_date,
        amountDue,
        cumulativeRequired: cumulative,
      },
      applied,
      input.asOf
    )
  })

  if (trailing !== null) {
    cumulative = round(cumulative + trailing)
    instalments.push(
      finish(
        {
          deadlineId: null,
          label: 'Remaining balance',
          dueDate: input.fallbackDueDate ?? null,
          amountDue: trailing,
          cumulativeRequired: cumulative,
        },
        round(Math.min(unapplied, trailing)),
        input.asOf
      )
    )
  }

  return instalments
}

function finish(
  base: Omit<Instalment, 'applied' | 'shortfall' | 'status'>,
  applied: number,
  asOf: string
): Instalment {
  const shortfall = round(Math.max(base.amountDue - applied, 0))
  return { ...base, applied, shortfall, status: statusFor(base.dueDate, shortfall, asOf) }
}

function statusFor(
  dueDate: string | null,
  shortfall: number,
  asOf: string
): InstalmentStatus {
  if (shortfall <= 0) return 'paid'
  // An undated instalment is the whole amount with no checkpoint behind it, so
  // it is owed now rather than at some date we do not have.
  if (!dueDate) return 'due'
  if (dueDate < asOf) return 'overdue'
  if (dueDate === asOf) return 'due'
  return 'upcoming'
}

export function scheduleTotals(instalments: Instalment[]): ScheduleTotals {
  const next = instalments.find((i) => i.shortfall > 0)

  return instalments.reduce<ScheduleTotals>(
    (totals, instalment) => ({
      dueNow:
        instalment.status === 'due' || instalment.status === 'overdue'
          ? round(totals.dueNow + instalment.shortfall)
          : totals.dueNow,
      overdue:
        instalment.status === 'overdue'
          ? round(totals.overdue + instalment.shortfall)
          : totals.overdue,
      nextDueDate: totals.nextDueDate,
      nextDueAmount: totals.nextDueAmount,
      outstanding: round(totals.outstanding + instalment.shortfall),
    }),
    {
      dueNow: 0,
      overdue: 0,
      nextDueDate: next?.dueDate ?? null,
      nextDueAmount: next?.shortfall ?? 0,
      outstanding: 0,
    }
  )
}

export type DeadlineRollup = {
  deadlineId: string
  label: string
  dueDate: string | null
  /** Total asked for at this checkpoint across everyone signed up. */
  expected: number
  collected: number
  short: number
  membersPaid: number
  membersShort: number
}

/**
 * Rolls every member's instalments up by checkpoint, for the committee view.
 *
 * Answers "who has missed the deposit" without a query per deadline. The
 * implicit instalments — the ones with no `deadlineId` — are skipped, because
 * they are not checkpoints anybody set and there is nothing to chase against.
 */
export function rollupByDeadline(instalments: Instalment[]): DeadlineRollup[] {
  const byDeadline = new Map<string, DeadlineRollup>()

  for (const instalment of instalments) {
    if (!instalment.deadlineId) continue

    const rollup = byDeadline.get(instalment.deadlineId) ?? {
      deadlineId: instalment.deadlineId,
      label: instalment.label,
      dueDate: instalment.dueDate,
      expected: 0,
      collected: 0,
      short: 0,
      membersPaid: 0,
      membersShort: 0,
    }

    rollup.expected = round(rollup.expected + instalment.amountDue)
    rollup.collected = round(rollup.collected + instalment.applied)
    rollup.short = round(rollup.short + instalment.shortfall)
    if (instalment.shortfall > 0) rollup.membersShort += 1
    else rollup.membersPaid += 1

    byDeadline.set(instalment.deadlineId, rollup)
  }

  return [...byDeadline.values()].sort((a, b) =>
    (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
  )
}

/**
 * Which reminders for this checkpoint fall on `today`.
 *
 * Returns the offsets rather than a boolean, because each offset is a separate
 * send with its own dedupe key — the fortnight's warning and the final nudge
 * are different emails, not one email sent twice.
 */
export function remindersDueOn(deadline: Deadline, today: string): number[] {
  return [...new Set(deadline.reminder_offsets)]
    .filter((offset) => addDays(deadline.due_date, -offset) === today)
    .sort((a, b) => b - a)
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type DeadlineInput = {
  /** Empty for a row the committee has just added. */
  id: string | null
  label: string
  due_date: string
  amount_type: Deadline['amount_type']
  amount_value: number | null
  reminder_offsets: number[]
}

/** '14, 3' — what the committee types — into [14, 3]. */
export function parseReminderOffsets(raw: string): number[] {
  return [
    ...new Set(
      raw
        .split(/[,\s]+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => Number(part))
        .filter((n) => Number.isInteger(n) && n >= 0)
    ),
  ].sort((a, b) => b - a)
}

/**
 * Pulls the repeating deadline rows out of a submitted event form.
 *
 * The fields are posted as parallel arrays — every row contributes one entry to
 * each — so their order is what pairs a label with its date. Rows are added and
 * removed together on the client, which keeps the arrays the same length; a
 * short array here would mean the form was tampered with, so anything past the
 * end of the shortest is dropped rather than paired with an empty string.
 *
 * Entirely blank rows are ignored, so a committee member who clicks "Add
 * deadline" and changes their mind does not get a validation error.
 */
export function parseDeadlinesFromForm(formData: FormData): DeadlineInput[] {
  const text = (name: string) => formData.getAll(name).map((v) => String(v))

  const ids = text('deadline_id')
  const labels = text('deadline_label')
  const dates = text('deadline_due_date')
  const types = text('deadline_amount_type')
  const values = text('deadline_amount_value')
  const offsets = text('deadline_reminder_offsets')

  const count = Math.min(labels.length, dates.length, types.length, values.length)
  const rows: DeadlineInput[] = []

  for (let i = 0; i < count; i += 1) {
    const label = labels[i].trim()
    const due = dates[i].trim()
    if (!label && !due) continue

    const amountType = (
      ['percent', 'fixed_per_person', 'remainder'].includes(types[i])
        ? types[i]
        : 'percent'
    ) as Deadline['amount_type']

    const rawValue = values[i]?.trim() ?? ''
    const parsedValue = rawValue === '' ? null : Number(rawValue)

    rows.push({
      id: ids[i]?.trim() || null,
      label,
      due_date: due,
      amount_type: amountType,
      amount_value:
        amountType === 'remainder' || parsedValue === null || !Number.isFinite(parsedValue)
          ? null
          : Math.round(parsedValue * 100) / 100,
      reminder_offsets: parseReminderOffsets(offsets[i] ?? ''),
    })
  }

  return rows
}

/**
 * Checks a set of checkpoints before they are saved.
 *
 * The database enforces most of this too, but a constraint violation surfaces
 * as a Postgres error code rather than something a committee member can act
 * on. These messages are what they actually see.
 */
export function validateDeadlines(
  deadlines: DeadlineInput[],
  eventDate: string | null
): string[] {
  const errors: string[] = []
  if (deadlines.length === 0) return errors

  let percentTotal = 0
  let remainders = 0
  const seenDates = new Set<string>()

  for (const [index, deadline] of deadlines.entries()) {
    const where = `Deadline ${index + 1}`

    if (!deadline.label.trim()) errors.push(`${where} needs a name.`)
    if (!deadline.due_date) {
      errors.push(`${where} needs a due date.`)
    } else {
      if (seenDates.has(deadline.due_date)) {
        errors.push(`Two deadlines fall on ${deadline.due_date}. Give them different dates.`)
      }
      seenDates.add(deadline.due_date)

      if (eventDate && deadline.due_date > eventDate) {
        errors.push(
          `${where} falls after the event on ${eventDate}. Payment deadlines need to come first.`
        )
      }
    }

    if (deadline.amount_type === 'remainder') {
      remainders += 1
    } else {
      const value = deadline.amount_value
      if (value === null || !Number.isFinite(value) || value <= 0) {
        errors.push(`${where} needs an amount greater than zero.`)
      } else if (deadline.amount_type === 'percent') {
        if (value > 100) errors.push(`${where} asks for more than 100%.`)
        percentTotal = round(percentTotal + value)
      }
    }

    if (deadline.reminder_offsets.some((offset) => !Number.isInteger(offset) || offset < 0)) {
      errors.push(`${where} has a reminder set for a negative number of days.`)
    }
  }

  if (percentTotal > 100) {
    errors.push(`The percentages add up to ${percentTotal}%, which is more than the total cost.`)
  }
  if (remainders > 1) {
    errors.push('Only one deadline can be for "the remaining balance".')
  }

  return errors
}
