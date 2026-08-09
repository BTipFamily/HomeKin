'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { AlertCircle, Loader2 } from 'lucide-react'
import { submitSurveyResponse } from '@/lib/actions/surveys'
import {
  pruneHiddenAnswers,
  validateSurveyAnswers,
  visibleQuestionIndices,
  type SurveyAnswers,
  type SurveyQuestion,
} from '@/lib/surveys'

/**
 * Answering a survey.
 *
 * A client component because questions can be conditional, and deciding what to
 * show has to happen as somebody types rather than on a round trip. It posts
 * controlled state through the action instead of a FormData form, the same way
 * interest-form.tsx does — which is also why there is no HTML `required` here.
 *
 * The previous version put a bare `required` on every input, so a follow-up
 * question nobody was being asked still blocked the submit button, and the
 * browser threw focus at it with no explanation.
 */
export function SurveyResponseForm({
  surveyId,
  reunionId,
  questions,
  initialAnswers,
}: {
  surveyId: string
  reunionId: string
  questions: SurveyQuestion[]
  initialAnswers?: SurveyAnswers
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [answers, setAnswers] = useState<SurveyAnswers>(initialAnswers ?? {})
  const [problems, setProblems] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const visible = useMemo(() => visibleQuestionIndices(questions, answers), [questions, answers])

  function setAnswer(index: number, value: string) {
    setAnswers((current) => {
      const next = { ...current, [String(index)]: value }
      // Prune as they go, so changing an earlier answer cannot leave a stranded
      // reply to a question that is no longer being asked.
      return pruneHiddenAnswers(questions, next)
    })
    setProblems([])
    setError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const kept = pruneHiddenAnswers(questions, answers)
    const found = validateSurveyAnswers(questions, kept)
    if (found.length > 0) {
      setProblems(found)
      return
    }
    setProblems([])

    startTransition(async () => {
      try {
        await submitSurveyResponse(surveyId, reunionId, kept)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Your response could not be saved.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {visible.map((qi, position) => {
        const question = questions[qi]
        const value = answers[String(qi)] ?? ''

        return (
          <div key={qi}>
            <label className="mb-1.5 block text-sm font-medium">
              {/* Numbered by what is on screen, so the list never skips a number
                  and leaves someone hunting for a question that isn't there. */}
              {position + 1}. {question.question}
              {question.required && (
                <span className="ml-1 text-destructive" aria-hidden="true">
                  *
                </span>
              )}
              {question.required && <span className="sr-only"> (required)</span>}
            </label>

            {question.type === 'multiple_choice' && question.options ? (
              <div className="space-y-1.5">
                {question.options.filter(Boolean).map((opt, oi) => (
                  <label key={oi} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`q_${qi}`}
                      value={opt}
                      checked={value === opt}
                      onChange={() => setAnswer(qi, opt)}
                      className="accent-primary"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                name={`q_${qi}`}
                rows={2}
                value={value}
                onChange={(e) => setAnswer(qi, e.target.value)}
                className="flex min-h-[60px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            )}
          </div>
        )
      })}

      {problems.length > 0 && (
        <div
          className="rounded-lg border border-warning-border bg-warning-surface p-3 text-sm text-warning-foreground"
          role="alert"
        >
          <p className="mb-1 font-medium">Before you send this:</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-sm text-destructive" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        Submit Response
      </Button>
    </form>
  )
}
