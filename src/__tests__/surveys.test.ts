import { describe, it, expect } from 'vitest'
import {
  availableTriggers,
  isQuestionVisible,
  pruneHiddenAnswers,
  validateSurveyAnswers,
  validateSurveyDefinition,
  visibleQuestionIndices,
  type SurveyQuestion,
} from '@/lib/surveys'

// The survey people actually hit the bug with: pick a location, and only if you
// pick "Other Location" are you asked to say where.
const LOCATION_SURVEY: SurveyQuestion[] = [
  {
    question: 'Where should we hold the banquet?',
    type: 'multiple_choice',
    options: ['Main Hall', 'The Lodge', 'Other Location'],
    required: true,
  },
  {
    question: 'Which other location?',
    type: 'free_text',
    required: true,
    showIf: { questionIndex: 0, equals: 'Other Location' },
  },
]

describe('a question with no required flag', () => {
  // The regression test for the reported bug. Every survey created before
  // `required` existed has no such field, and none of them may block submit.
  const legacy: SurveyQuestion[] = [
    { question: 'Where should we meet?', type: 'multiple_choice', options: ['Hall', 'Other'] },
    { question: 'Anything else?', type: 'free_text' },
  ]

  it('does not block submitting when left blank', () => {
    expect(validateSurveyAnswers(legacy, {})).toEqual([])
  })

  it('does not block when only the first question is answered', () => {
    expect(validateSurveyAnswers(legacy, { '0': 'Hall' })).toEqual([])
  })
})

describe('required questions', () => {
  it('blocks when a visible required question is blank', () => {
    const problems = validateSurveyAnswers(LOCATION_SURVEY, {})
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('Question 1')
  })

  it('treats whitespace as blank', () => {
    expect(validateSurveyAnswers(LOCATION_SURVEY, { '0': '   ' })).toHaveLength(1)
  })

  it('passes once the visible required questions are answered', () => {
    expect(validateSurveyAnswers(LOCATION_SURVEY, { '0': 'Main Hall' })).toEqual([])
  })
})

describe('conditional questions', () => {
  it('hides the follow-up while the trigger is unanswered', () => {
    expect(isQuestionVisible(LOCATION_SURVEY, {}, 1)).toBe(false)
  })

  it('hides the follow-up when the trigger has some other answer', () => {
    expect(isQuestionVisible(LOCATION_SURVEY, { '0': 'The Lodge' }, 1)).toBe(false)
  })

  it('shows the follow-up when the trigger matches', () => {
    expect(isQuestionVisible(LOCATION_SURVEY, { '0': 'Other Location' }, 1)).toBe(true)
  })

  it('always shows a question with no condition', () => {
    expect(isQuestionVisible(LOCATION_SURVEY, {}, 0)).toBe(true)
  })

  it('does not let a hidden required question block submit', () => {
    // The exact reported scenario: answer question 1 with anything but "Other
    // Location", and submitting must work first time.
    expect(validateSurveyAnswers(LOCATION_SURVEY, { '0': 'Main Hall' })).toEqual([])
  })

  it('blocks once the follow-up is actually being asked', () => {
    const problems = validateSurveyAnswers(LOCATION_SURVEY, { '0': 'Other Location' })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('Question 2')
  })

  it('passes when the revealed follow-up is filled in', () => {
    expect(
      validateSurveyAnswers(LOCATION_SURVEY, { '0': 'Other Location', '1': "Grandma's yard" })
    ).toEqual([])
  })

  it('collapses a chain when the first trigger stops matching', () => {
    const chained: SurveyQuestion[] = [
      ...LOCATION_SURVEY,
      {
        question: 'Is there parking there?',
        type: 'free_text',
        showIf: { questionIndex: 1, equals: "Grandma's yard" },
      },
    ]
    const answers = { '0': 'Other Location', '1': "Grandma's yard" }
    expect(isQuestionVisible(chained, answers, 2)).toBe(true)
    // Change the first answer and the whole chain goes, not just its first link.
    expect(isQuestionVisible(chained, { ...answers, '0': 'Main Hall' }, 2)).toBe(false)
  })

  it('ignores a condition pointing at a question that does not exist', () => {
    const broken: SurveyQuestion[] = [
      { question: 'Only question', type: 'free_text', showIf: { questionIndex: 7, equals: 'x' } },
    ]
    expect(isQuestionVisible(broken, {}, 0)).toBe(true)
  })

  it('ignores a condition pointing forwards, which nobody could satisfy in order', () => {
    const forwards: SurveyQuestion[] = [
      { question: 'First', type: 'free_text', showIf: { questionIndex: 1, equals: 'x' } },
      { question: 'Second', type: 'multiple_choice', options: ['x', 'y'] },
    ]
    expect(isQuestionVisible(forwards, {}, 0)).toBe(true)
  })
})

describe('visibleQuestionIndices', () => {
  it('lists only what is on screen, in order', () => {
    expect(visibleQuestionIndices(LOCATION_SURVEY, {})).toEqual([0])
    expect(visibleQuestionIndices(LOCATION_SURVEY, { '0': 'Other Location' })).toEqual([0, 1])
  })
})

describe('pruneHiddenAnswers', () => {
  it('drops an answer abandoned when the trigger changed', () => {
    const answers = { '0': 'Other Location', '1': "Grandma's yard" }
    expect(pruneHiddenAnswers(LOCATION_SURVEY, answers)).toEqual(answers)

    const changedMind = { ...answers, '0': 'Main Hall' }
    expect(pruneHiddenAnswers(LOCATION_SURVEY, changedMind)).toEqual({ '0': 'Main Hall' })
  })

  it('drops blanks rather than storing them', () => {
    // "Never asked" and "asked and left blank" should not look alike in results.
    expect(pruneHiddenAnswers(LOCATION_SURVEY, { '0': 'Main Hall', '1': '' })).toEqual({
      '0': 'Main Hall',
    })
  })

  it('leaves an ordinary complete response alone', () => {
    const plain: SurveyQuestion[] = [
      { question: 'A', type: 'free_text' },
      { question: 'B', type: 'free_text' },
    ]
    const answers = { '0': 'one', '1': 'two' }
    expect(pruneHiddenAnswers(plain, answers)).toEqual(answers)
  })
})

describe('availableTriggers', () => {
  const questions: SurveyQuestion[] = [
    { question: 'Free text one', type: 'free_text' },
    { question: 'Choice one', type: 'multiple_choice', options: ['a', 'b'] },
    { question: 'Choice two', type: 'multiple_choice', options: ['c', ''] },
    { question: 'The one being configured', type: 'free_text' },
  ]

  it('offers earlier multiple-choice questions', () => {
    expect(availableTriggers(questions, 3).map((t) => t.index)).toEqual([1, 2])
  })

  it('never offers the question itself or a later one', () => {
    expect(availableTriggers(questions, 1).map((t) => t.index)).toEqual([])
  })

  it('never offers a free-text question', () => {
    expect(availableTriggers(questions, 3).some((t) => t.index === 0)).toBe(false)
  })

  it('strips blank options', () => {
    expect(availableTriggers(questions, 3).find((t) => t.index === 2)?.options).toEqual(['c'])
  })

  it('offers nothing for the first question', () => {
    expect(availableTriggers(questions, 0)).toEqual([])
  })
})

describe('validateSurveyDefinition', () => {
  it('accepts a well-formed survey', () => {
    expect(validateSurveyDefinition('Banquet location', LOCATION_SURVEY)).toEqual([])
  })

  it('needs a title', () => {
    expect(validateSurveyDefinition('  ', LOCATION_SURVEY)[0]).toContain('title')
  })

  it('needs at least one question', () => {
    expect(validateSurveyDefinition('Empty', [])[0]).toContain('at least one question')
  })

  it('needs question text', () => {
    const blank: SurveyQuestion[] = [{ question: '  ', type: 'free_text' }]
    expect(validateSurveyDefinition('T', blank)[0]).toContain('no text')
  })

  it('needs two real options on a multiple choice question', () => {
    const thin: SurveyQuestion[] = [
      { question: 'Pick', type: 'multiple_choice', options: ['only', ''] },
    ]
    expect(validateSurveyDefinition('T', thin)[0]).toContain('two options')
  })

  it('catches a condition whose option was renamed away', () => {
    const stale: SurveyQuestion[] = [
      { question: 'Where?', type: 'multiple_choice', options: ['Hall', 'Lodge'] },
      { question: 'Which other?', type: 'free_text', showIf: { questionIndex: 0, equals: 'Other' } },
    ]
    expect(validateSurveyDefinition('T', stale)[0]).toContain('no longer one of its options')
  })

  it('catches a condition pointing at a later question', () => {
    const forwards: SurveyQuestion[] = [
      { question: 'First', type: 'free_text', showIf: { questionIndex: 1, equals: 'x' } },
      { question: 'Second', type: 'multiple_choice', options: ['x', 'y'] },
    ]
    expect(validateSurveyDefinition('T', forwards)[0]).toContain('comes after it')
  })
})
