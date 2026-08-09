// Which survey questions are actually being asked, and whether a response is
// complete.
//
// Pure — no database, no clock. The response form runs this to decide what to
// render and to show a readable error, and the server action runs the same
// functions before writing. Client-side checking on its own is decoration: a
// thrown Server Action renders Next's generic error with the reason stripped, so
// the client copy is the one a person reads and the server copy is the one that
// holds. Same split as validateDeadlines in payment-schedule.ts.

export type SurveyQuestion = {
  question: string
  type: 'free_text' | 'multiple_choice'
  options?: string[]
  /**
   * Absent means optional. Every survey created before this existed has no
   * field at all, so they all stay optional — which is the behaviour they were
   * built expecting, whatever the form was doing to people.
   */
  required?: boolean
  /**
   * Ask this only when an earlier question was given a particular answer.
   *
   * The trigger is referenced by array index because that is how answers are
   * keyed too — there is no stable question id. That holds only while surveys
   * cannot be edited after creation, which today they cannot. Adding an edit
   * screen means giving questions real ids first, and migrating both this and
   * the answer keys.
   *
   * Restricted to *earlier* questions, which is what makes a cycle impossible.
   */
  showIf?: { questionIndex: number; equals: string }
}

/** Answers are keyed by question index, stringified. */
export type SurveyAnswers = Record<string, string>

/**
 * What the two survey actions hand back.
 *
 * These live here rather than beside the actions on purpose. A 'use server'
 * module is compiled by collecting its exports into a runtime list, and a
 * `export type { … }` specifier list survives that collection as a bare
 * identifier — which then throws `ReferenceError` the moment the module is
 * evaluated, before any page renders. Keeping every type out of the action
 * module makes the rule easy to hold: it exports async functions and nothing
 * else.
 */
export type SurveyResponseResult =
  | { status: 'saved' }
  | { status: 'blocked'; message: string; problems?: string[] }

export type CreateSurveyResult =
  | { status: 'created'; id: string }
  | { status: 'blocked'; message: string; problems?: string[] }

function answerFor(answers: SurveyAnswers, index: number): string {
  return (answers[String(index)] ?? '').trim()
}

/**
 * Is this question being asked at all?
 *
 * A question with no condition is always asked. One with a condition is asked
 * only when its trigger holds — and never when the trigger itself is hidden,
 * so a chain of follow-ups collapses cleanly rather than stranding the last one
 * on screen.
 */
export function isQuestionVisible(
  questions: SurveyQuestion[],
  answers: SurveyAnswers,
  index: number
): boolean {
  const question = questions[index]
  if (!question) return false

  const condition = question.showIf
  if (!condition) return true

  // A condition pointing at a question that no longer exists, or at itself or
  // later, is treated as no condition. Better a question that is always asked
  // than one nobody can ever reach.
  const trigger = questions[condition.questionIndex]
  if (!trigger || condition.questionIndex >= index) return true

  if (!isQuestionVisible(questions, answers, condition.questionIndex)) return false
  return answerFor(answers, condition.questionIndex) === condition.equals
}

/** The indices actually on screen, in order. */
export function visibleQuestionIndices(
  questions: SurveyQuestion[],
  answers: SurveyAnswers
): number[] {
  return questions.map((_, i) => i).filter((i) => isQuestionVisible(questions, answers, i))
}

/**
 * What is stopping this response being submitted. Empty means nothing is.
 *
 * Only visible questions are checked: a required follow-up that is not being
 * asked must not block, which is the whole point.
 */
export function validateSurveyAnswers(
  questions: SurveyQuestion[],
  answers: SurveyAnswers
): string[] {
  const problems: string[] = []

  questions.forEach((question, i) => {
    if (!question.required) return
    if (!isQuestionVisible(questions, answers, i)) return
    if (answerFor(answers, i) === '') {
      problems.push(`Question ${i + 1} needs an answer: ${question.question}`)
    }
  })

  return problems
}

/**
 * Drops answers to questions that are not being asked.
 *
 * Someone picks "Other", types a reason, then changes their mind back — without
 * this the abandoned reason is still submitted. Dropping the key rather than
 * blanking it also keeps "never asked" distinguishable from "asked and left
 * blank" in the results.
 */
export function pruneHiddenAnswers(
  questions: SurveyQuestion[],
  answers: SurveyAnswers
): SurveyAnswers {
  const kept: SurveyAnswers = {}

  questions.forEach((_, i) => {
    if (!isQuestionVisible(questions, answers, i)) return
    const value = answers[String(i)]
    if (value !== undefined && value !== '') kept[String(i)] = value
  })

  return kept
}

/**
 * The questions that could serve as a trigger for the one at `index`.
 *
 * Earlier multiple-choice questions with at least one real option — a free-text
 * answer can't be matched against reliably, and a later question would be a
 * condition nobody could satisfy in order.
 */
export function availableTriggers(
  questions: SurveyQuestion[],
  index: number
): { index: number; question: string; options: string[] }[] {
  return questions
    .slice(0, index)
    .map((question, i) => ({
      index: i,
      question: question.question,
      options: (question.options ?? []).filter(Boolean),
    }))
    .filter((t) => questions[t.index].type === 'multiple_choice' && t.options.length > 0)
}

/**
 * Problems with the survey itself, for the builder — as opposed to problems
 * with someone's answers.
 */
export function validateSurveyDefinition(
  title: string,
  questions: SurveyQuestion[]
): string[] {
  const problems: string[] = []

  if (!title.trim()) problems.push('The survey needs a title.')
  if (questions.length === 0) problems.push('Add at least one question.')

  questions.forEach((question, i) => {
    const label = `Question ${i + 1}`
    if (!question.question.trim()) problems.push(`${label} has no text.`)

    if (question.type === 'multiple_choice') {
      const options = (question.options ?? []).filter(Boolean)
      if (options.length < 2) problems.push(`${label} needs at least two options.`)
    }

    const condition = question.showIf
    if (!condition) return

    const trigger = questions[condition.questionIndex]
    if (!trigger || condition.questionIndex >= i) {
      problems.push(`${label} depends on a question that comes after it, or no longer exists.`)
      return
    }
    if (!(trigger.options ?? []).filter(Boolean).includes(condition.equals)) {
      problems.push(
        `${label} only shows when question ${condition.questionIndex + 1} is answered ` +
          `"${condition.equals}", but that is no longer one of its options.`
      )
    }
  })

  return problems
}
