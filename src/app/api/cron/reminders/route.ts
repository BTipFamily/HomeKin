import { NextRequest } from 'next/server'
import { sendEmail } from '@/lib/email'
import { reminderHtml, reminderSubject } from '@/lib/reminder-email'
import { planReminders, type DeadlineWithEvent } from '@/lib/reminder-plan'
import { appOrigin, today } from '@/lib/statements'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * How many reminders one run will send.
 *
 * Gmail allows 500 recipients a day on a free account and reminders go out one
 * per member — no BCC batching, because each one names a different amount. A
 * reunion with a few hundred members and two checkpoints landing on the same
 * day would otherwise blow the quota, at which point Gmail locks the account
 * for the rest of the window and the *other* mail the app sends — confirmations,
 * invite codes — stops too. Deferred reminders are picked up by the next run,
 * since nothing is logged for a reminder that was not sent.
 */
const MAX_PER_RUN = 400

/**
 * Sends the deadline reminders that fall due today.
 *
 * Driven by Vercel Cron (see vercel.json), which sends
 * `Authorization: Bearer $CRON_SECRET`. Without that check the URL would be a
 * public button for emailing the entire directory.
 *
 * Safe to re-run: each send is claimed in `email_sends` before the email goes
 * out, and the unique index there means a second run finds the claim and skips.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[Cron] CRON_SECRET is not set; refusing to run')
    return Response.json({ error: 'Not configured' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const asOf = today()
  const service = createServiceClient()

  // Reminders only ever fire before a due date, so checkpoints already in the
  // past cannot produce one and are not worth loading.
  const { data: deadlines, error: deadlineError } = await service
    .from('event_deadlines')
    .select(
      'id, sub_event_id, label, due_date, amount_type, amount_value, reminder_offsets, sort_order'
    )
    .gte('due_date', asOf)

  if (deadlineError) {
    console.error('[Cron] Failed to load deadlines:', deadlineError.message)
    return Response.json({ error: 'Failed to load deadlines' }, { status: 500 })
  }

  const rows = (deadlines ?? []) as DeadlineWithEvent[]
  if (rows.length === 0) {
    return Response.json({ ranAt: asOf, considered: 0, sent: 0, skipped: 0, deferred: 0 })
  }

  const subEventIds = [...new Set(rows.map((d) => d.sub_event_id))]

  const [{ data: balances }, { data: signups }, { data: events }] = await Promise.all([
    service
      .from('balances')
      .select('member_id, sub_event_id, amount_owed, amount_paid')
      .in('sub_event_id', subEventIds),
    service.from('signups').select('member_id, sub_event_id, headcount').in('sub_event_id', subEventIds),
    service
      .from('sub_events')
      .select('id, name, reunion_id, reunion:reunion_id(name)')
      .in('id', subEventIds),
  ])

  const candidates = planReminders({
    today: asOf,
    deadlines: rows,
    balances: (balances ?? []) as Parameters<typeof planReminders>[0]['balances'],
    signups: (signups ?? []) as Parameters<typeof planReminders>[0]['signups'],
  })

  if (candidates.length === 0) {
    return Response.json({ ranAt: asOf, considered: 0, sent: 0, skipped: 0, deferred: 0 })
  }

  type EventRow = {
    id: string
    name: string
    reunion_id: string
    reunion: { name: string } | { name: string }[] | null
  }
  const eventById = new Map(((events ?? []) as EventRow[]).map((e) => [e.id, e]))

  const memberIds = [...new Set(candidates.map((c) => c.memberId))]
  const { data: members } = await service
    .from('members')
    .select('id, name, email')
    .in('id', memberIds)
  const memberById = new Map(
    ((members ?? []) as { id: string; name: string; email: string }[]).map((m) => [m.id, m])
  )

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const candidate of candidates) {
    if (sent >= MAX_PER_RUN) break

    const member = memberById.get(candidate.memberId)
    const event = eventById.get(candidate.subEventId)
    if (!member || !event) {
      skipped += 1
      continue
    }

    const reunion = Array.isArray(event.reunion) ? event.reunion[0] : event.reunion

    // Claim the send before making it. Losing this race means somebody else
    // already sent it; losing it the other way round would mean sending twice.
    const { error: claimError } = await service.from('email_sends').insert({
      kind: 'deadline_reminder',
      member_id: candidate.memberId,
      reunion_id: event.reunion_id,
      deadline_id: candidate.deadlineId,
      offset_days: candidate.offsetDays,
    })

    if (claimError) {
      // 23505 is the dedupe index: this reminder has already gone out.
      if (claimError.code !== '23505') {
        console.error('[Cron] Failed to claim reminder:', claimError.message)
      }
      skipped += 1
      continue
    }

    const input = {
      memberName: member.name,
      reunionName: reunion?.name ?? 'Reunion',
      eventName: event.name,
      label: candidate.label,
      dueDate: candidate.dueDate,
      shortfall: candidate.shortfall,
      eventOutstanding: candidate.eventOutstanding,
      daysUntilDue: candidate.daysUntilDue,
      payUrl: `${appOrigin()}/reunion/${event.reunion_id}/signups`,
    }

    const result = await sendEmail({
      to: member.email,
      subject: reminderSubject(input),
      html: reminderHtml(input),
    })

    if (result.sent) {
      sent += 1
      continue
    }

    // The email did not go out, so release the claim and let the next run try
    // again. Holding it would mean this member is silently never reminded.
    failed += 1
    await service
      .from('email_sends')
      .delete()
      .eq('kind', 'deadline_reminder')
      .eq('member_id', candidate.memberId)
      .eq('deadline_id', candidate.deadlineId)
      .eq('offset_days', candidate.offsetDays)
  }

  const deferred = Math.max(candidates.length - sent - skipped - failed, 0)
  if (deferred > 0) {
    console.warn(
      `[Cron] Hit the ${MAX_PER_RUN}-email ceiling; ${deferred} reminder(s) deferred to the next run.`
    )
  }

  return Response.json({
    ranAt: asOf,
    considered: candidates.length,
    sent,
    skipped,
    failed,
    deferred,
  })
}
