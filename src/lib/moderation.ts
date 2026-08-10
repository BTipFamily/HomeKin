// Reporting content and blocking people — the pure parts.
//
// Kept out of the action module so the wording and the validation can be tested
// without a database, matching lib/surveys.ts and lib/account.ts. A 'use server'
// file may export async functions and nothing else.

export const REPORT_REASONS = [
  'harassment',
  'hate',
  'nudity',
  'violence',
  'private_information',
  'spam',
  'other',
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]

/**
 * What each reason means, in the words a family member would use.
 *
 * Deliberately not the usual platform vocabulary. "Content that violates our
 * community standards" tells somebody upset by a photograph nothing about which
 * option to pick, and a report form nobody can navigate is the same as no report
 * form — which is the thing App Store guideline 1.2 is actually asking for.
 */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  harassment: 'Bullying or harassment',
  hate: 'Hateful or abusive language',
  nudity: 'Nudity or sexual content',
  violence: 'Violence or a threat',
  private_information: "Private information shared without permission",
  spam: 'Spam or a scam',
  other: 'Something else',
}

export const REPORTABLE_TYPES = [
  'photo',
  'photo_comment',
  'message',
  'direct_message',
  'announcement',
  'member',
] as const

export type ReportableType = (typeof REPORTABLE_TYPES)[number]

export const REPORTABLE_TYPE_LABELS: Record<ReportableType, string> = {
  photo: 'photo',
  photo_comment: 'comment',
  message: 'message',
  direct_message: 'direct message',
  announcement: 'announcement',
  member: 'profile',
}

export type ReportStatus = 'open' | 'actioned' | 'dismissed'

export function isReportReason(value: unknown): value is ReportReason {
  return REPORT_REASONS.includes(value as ReportReason)
}

export function isReportableType(value: unknown): value is ReportableType {
  return REPORTABLE_TYPES.includes(value as ReportableType)
}

/**
 * Problems with a report, for the form.
 *
 * `other` is the only reason that requires an explanation: every other option
 * already says what the matter is, and demanding a paragraph from somebody who
 * has just seen something upsetting is a way of receiving fewer reports.
 */
export function validateReport(input: {
  reason: unknown
  detail: string
}): string[] {
  const problems: string[] = []

  if (!isReportReason(input.reason)) {
    problems.push('Choose what is wrong with it.')
    return problems
  }

  if (input.reason === 'other' && !input.detail.trim()) {
    problems.push('Say briefly what is wrong, so the committee knows what to look at.')
  }

  if (input.detail.length > 1000) {
    problems.push('Keep the description under 1000 characters.')
  }

  return problems
}

/**
 * What the committee sees at the top of a queue entry.
 *
 * The reason comes first because it decides how fast somebody needs to look: a
 * threat of violence and a piece of spam are both "1 report" and are not the
 * same job.
 */
export function describeReport(input: {
  reason: ReportReason
  contentType: ReportableType
  reporterName: string | null
}): string {
  const who = input.reporterName?.trim() || 'Someone'
  return `${REPORT_REASON_LABELS[input.reason]} — ${who} reported a ${REPORTABLE_TYPE_LABELS[input.contentType]}`
}

/**
 * What blocking somebody actually does, said before they press it.
 *
 * Both directions, because that is how the policy in migration 035 works, and
 * somebody who expects a one-way mute will otherwise be surprised to vanish from
 * a conversation.
 */
export function describeBlock(name: string): string {
  return (
    `Block ${name}? You will stop seeing their photos, comments and messages, and they will ` +
    `stop seeing yours. They are not told. You can undo this at any time from your account page.`
  )
}
