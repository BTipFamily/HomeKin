import { describe, it, expect } from 'vitest'
import {
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  REPORTABLE_TYPES,
  REPORTABLE_TYPE_LABELS,
  describeBlock,
  describeReport,
  isReportReason,
  isReportableType,
  validateReport,
} from '@/lib/moderation'

// The report form is the one screen where the words matter more than the code:
// somebody upset by a photograph has to be able to find the option that fits and
// press it. These are the checks that stop that wording drifting.

describe('the reasons somebody can pick', () => {
  it('labels every reason', () => {
    for (const reason of REPORT_REASONS) {
      expect(REPORT_REASON_LABELS[reason]).toBeTruthy()
    }
  })

  it('labels every kind of thing that can be reported', () => {
    for (const type of REPORTABLE_TYPES) {
      expect(REPORTABLE_TYPE_LABELS[type]).toBeTruthy()
    }
  })

  it('offers the four categories Apple names, and harassment first', () => {
    // Guideline 1.2 is written about abuse, not about spam. The list is ordered
    // so the reasons somebody is actually distressed by come before the tidying.
    expect(REPORT_REASONS[0]).toBe('harassment')
    for (const required of ['harassment', 'hate', 'nudity', 'violence']) {
      expect(REPORT_REASONS).toContain(required)
    }
  })

  it('keeps "something else" last, so it is the fallback rather than the default', () => {
    expect(REPORT_REASONS[REPORT_REASONS.length - 1]).toBe('other')
  })

  it('says what each reason means in plain words', () => {
    // No "violates our community standards" — the phrase tells somebody nothing
    // about which button to press.
    for (const label of Object.values(REPORT_REASON_LABELS)) {
      expect(label.toLowerCase()).not.toContain('community standards')
      expect(label.toLowerCase()).not.toContain('violat')
    }
  })
})

describe('guarding what arrives from a form', () => {
  it('accepts the real values', () => {
    expect(isReportReason('harassment')).toBe(true)
    expect(isReportableType('photo_comment')).toBe(true)
  })

  it('rejects anything else, including near misses', () => {
    expect(isReportReason('HARASSMENT')).toBe(false)
    expect(isReportReason('')).toBe(false)
    expect(isReportReason(null)).toBe(false)
    expect(isReportableType('photos')).toBe(false)
    expect(isReportableType(undefined)).toBe(false)
  })
})

describe('validating a report', () => {
  it('passes a plain reason with no explanation', () => {
    expect(validateReport({ reason: 'nudity', detail: '' })).toEqual([])
  })

  it('will not accept "something else" with nothing else said', () => {
    const problems = validateReport({ reason: 'other', detail: '   ' })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('what is wrong')
  })

  it('accepts "something else" once explained', () => {
    expect(validateReport({ reason: 'other', detail: 'Wrong child tagged' })).toEqual([])
  })

  it('asks for a reason before anything else', () => {
    const problems = validateReport({ reason: 'nonsense', detail: '' })
    expect(problems).toEqual(['Choose what is wrong with it.'])
  })

  it('caps the description', () => {
    const problems = validateReport({ reason: 'spam', detail: 'x'.repeat(1001) })
    expect(problems[0]).toContain('1000')
  })

  it('does not demand an explanation for the other six reasons', () => {
    for (const reason of REPORT_REASONS.filter((r) => r !== 'other')) {
      expect(validateReport({ reason, detail: '' })).toEqual([])
    }
  })
})

describe('what the committee reads in the queue', () => {
  it('leads with the reason, because that decides how fast to look', () => {
    const line = describeReport({
      reason: 'violence',
      contentType: 'photo',
      reporterName: 'Ali Tipton',
    })
    expect(line.startsWith('Violence or a threat')).toBe(true)
    expect(line).toContain('Ali Tipton')
    expect(line).toContain('photo')
  })

  it('still reads as a sentence when the reporter has since been deleted', () => {
    const line = describeReport({ reason: 'spam', contentType: 'message', reporterName: null })
    expect(line).toContain('Someone reported a message')
    expect(line).not.toContain('null')
  })
})

describe('what blocking says it will do', () => {
  const text = describeBlock('Marcus')

  it('names the person', () => {
    expect(text).toContain('Marcus')
  })

  it('says it works in both directions, which is the surprising part', () => {
    expect(text).toContain('they will stop seeing yours')
  })

  it('says they are not told', () => {
    expect(text).toContain('not told')
  })

  it('says it can be undone, and where', () => {
    expect(text).toContain('undo')
    expect(text).toContain('account page')
  })
})
