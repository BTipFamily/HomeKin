'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { createSurvey } from '@/lib/actions/surveys'
import {
  availableTriggers,
  validateSurveyDefinition,
  type SurveyQuestion,
} from '@/lib/surveys'
import { Plus, Trash2 } from 'lucide-react'

interface SurveyBuilderProps {
  reunionId: string
}

export default function SurveyBuilder({ reunionId }: SurveyBuilderProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [questions, setQuestions] = useState<SurveyQuestion[]>([
    { question: '', type: 'free_text' },
  ])
  const [problems, setProblems] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  function addQuestion() {
    setQuestions((q) => [...q, { question: '', type: 'free_text' }])
  }

  function removeQuestion(i: number) {
    setQuestions((list) => {
      // Deleting a question renumbers everything after it, so conditions have to
      // be re-pointed. Without this, removing question 1 silently moves a
      // follow-up's trigger onto whatever slid into its place.
      const next = list
        .filter((_, idx) => idx !== i)
        .map((q) => {
          if (!q.showIf) return q
          if (q.showIf.questionIndex === i) return { ...q, showIf: undefined }
          if (q.showIf.questionIndex > i) {
            return { ...q, showIf: { ...q.showIf, questionIndex: q.showIf.questionIndex - 1 } }
          }
          return q
        })
      return dropStaleConditions(next)
    })
  }

  function updateQuestion(i: number, patch: Partial<SurveyQuestion>) {
    setQuestions((list) =>
      dropStaleConditions(list.map((q, idx) => (idx === i ? { ...q, ...patch } : q)))
    )
  }

  function setCondition(i: number, showIf: SurveyQuestion['showIf']) {
    setQuestions((list) => list.map((q, idx) => (idx === i ? { ...q, showIf } : q)))
  }

  function addOption(qi: number) {
    setQuestions((q) =>
      q.map((q2, idx) =>
        idx === qi ? { ...q2, options: [...(q2.options ?? []), ''] } : q2
      )
    )
  }

  function updateOption(qi: number, oi: number, value: string) {
    setQuestions((list) =>
      dropStaleConditions(
        list.map((q, idx) =>
          idx === qi ? { ...q, options: q.options?.map((o, oidx) => (oidx === oi ? value : o)) } : q
        )
      )
    )
  }

  function removeOption(qi: number, oi: number) {
    setQuestions((list) =>
      dropStaleConditions(
        list.map((q, idx) =>
          idx === qi ? { ...q, options: q.options?.filter((_, oidx) => oidx !== oi) } : q
        )
      )
    )
  }

  /**
   * Removing or retyping a question can strand a condition that pointed at it,
   * so conditions are cleared whenever the question they name stops qualifying
   * — rather than left to fail validation later, when the cause is no longer
   * on screen.
   */
  function dropStaleConditions(list: SurveyQuestion[]): SurveyQuestion[] {
    return list.map((q, i) => {
      if (!q.showIf) return q
      const stillValid = availableTriggers(list, i).some(
        (t) => t.index === q.showIf!.questionIndex && t.options.includes(q.showIf!.equals)
      )
      return stillValid ? q : { ...q, showIf: undefined }
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Same function the server runs, so the message here is the message there.
    const found = validateSurveyDefinition(title, questions)
    if (found.length > 0) {
      setProblems(found)
      setError(null)
      return
    }

    setProblems([])
    setError(null)
    startTransition(async () => {
      try {
        const result = await createSurvey(reunionId, title.trim(), questions)
        if (result.status === 'created') {
          router.push(`/reunion/${reunionId}/surveys`)
          return
        }
        setProblems(result.problems ?? [])
        setError(result.problems?.length ? null : result.message)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The survey could not be created.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-1">Survey Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Dietary Preferences & Activities"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="space-y-4">
        <p className="text-sm font-medium">Questions</p>
        {questions.map((q, qi) => (
          <Card key={qi}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <input
                    value={q.question}
                    onChange={(e) => updateQuestion(qi, { question: e.target.value })}
                    placeholder={`Question ${qi + 1}`}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <select
                    value={q.type}
                    onChange={(e) =>
                      updateQuestion(qi, {
                        type: e.target.value as SurveyQuestion['type'],
                        options: e.target.value === 'multiple_choice' ? ['', ''] : undefined,
                      })
                    }
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="free_text">Free text</option>
                    <option value="multiple_choice">Multiple choice</option>
                  </select>

                  {q.type === 'multiple_choice' && (
                    <div className="space-y-1.5 pl-2 border-l-2 border-muted">
                      {(q.options ?? []).map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-1.5">
                          <input
                            value={opt}
                            onChange={(e) => updateOption(qi, oi, e.target.value)}
                            placeholder={`Option ${oi + 1}`}
                            className="flex h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                          {(q.options?.length ?? 0) > 2 && (
                            <button
                              type="button"
                              onClick={() => removeOption(qi, oi)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addOption(qi)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" /> Add option
                      </button>
                    </div>
                  )}

                  <div className="space-y-2 border-t pt-2">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={q.required ?? false}
                        onChange={(e) => updateQuestion(qi, { required: e.target.checked })}
                        className="accent-primary"
                      />
                      Must be answered
                    </label>

                    {/* Only offered once there is an earlier multiple-choice
                        question to hang a condition on, so a short survey never
                        shows a control with nothing to put in it. */}
                    {availableTriggers(questions, qi).length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">Only ask this if</span>
                        <select
                          value={q.showIf ? String(q.showIf.questionIndex) : ''}
                          onChange={(e) => {
                            if (!e.target.value) return setCondition(qi, undefined)
                            const triggerIndex = Number(e.target.value)
                            const first =
                              availableTriggers(questions, qi).find((t) => t.index === triggerIndex)
                                ?.options[0] ?? ''
                            setCondition(qi, { questionIndex: triggerIndex, equals: first })
                          }}
                          className="h-7 max-w-[12rem] rounded-md border border-input bg-background px-2 text-xs"
                        >
                          <option value="">always ask it</option>
                          {availableTriggers(questions, qi).map((t) => (
                            <option key={t.index} value={t.index}>
                              Q{t.index + 1}: {t.question || `Question ${t.index + 1}`}
                            </option>
                          ))}
                        </select>

                        {q.showIf && (
                          <>
                            <span className="text-muted-foreground">is answered</span>
                            <select
                              value={q.showIf.equals}
                              onChange={(e) =>
                                setCondition(qi, {
                                  questionIndex: q.showIf!.questionIndex,
                                  equals: e.target.value,
                                })
                              }
                              className="h-7 max-w-[12rem] rounded-md border border-input bg-background px-2 text-xs"
                            >
                              {(
                                availableTriggers(questions, qi).find(
                                  (t) => t.index === q.showIf!.questionIndex
                                )?.options ?? []
                              ).map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeQuestion(qi)}
                    className="mt-1.5 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Question
        </Button>
      </div>

      {problems.length > 0 && (
        <div
          className="rounded-lg border border-warning-border bg-warning-surface p-3 text-sm text-warning-foreground"
          role="alert"
        >
          <p className="mb-1 font-medium">Before you create this:</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Survey'}
      </Button>
    </form>
  )
}
