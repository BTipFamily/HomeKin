'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { createSurvey, type SurveyQuestion } from '@/lib/actions/surveys'
import { Plus, Trash2, GripVertical } from 'lucide-react'

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
  const [error, setError] = useState<string | null>(null)

  function addQuestion() {
    setQuestions((q) => [...q, { question: '', type: 'free_text' }])
  }

  function removeQuestion(i: number) {
    setQuestions((q) => q.filter((_, idx) => idx !== i))
  }

  function updateQuestion(i: number, patch: Partial<SurveyQuestion>) {
    setQuestions((q) => q.map((q2, idx) => (idx === i ? { ...q2, ...patch } : q2)))
  }

  function addOption(qi: number) {
    setQuestions((q) =>
      q.map((q2, idx) =>
        idx === qi ? { ...q2, options: [...(q2.options ?? []), ''] } : q2
      )
    )
  }

  function updateOption(qi: number, oi: number, value: string) {
    setQuestions((q) =>
      q.map((q2, idx) =>
        idx === qi
          ? { ...q2, options: q2.options?.map((o, oidx) => (oidx === oi ? value : o)) }
          : q2
      )
    )
  }

  function removeOption(qi: number, oi: number) {
    setQuestions((q) =>
      q.map((q2, idx) =>
        idx === qi ? { ...q2, options: q2.options?.filter((_, oidx) => oidx !== oi) } : q2
      )
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError('Title is required')
    const invalid = questions.some((q) => !q.question.trim())
    if (invalid) return setError('All questions must have text')
    const mcInvalid = questions.some(
      (q) => q.type === 'multiple_choice' && (!q.options || q.options.filter(Boolean).length < 2)
    )
    if (mcInvalid) return setError('Multiple choice questions need at least 2 options')

    setError(null)
    startTransition(async () => {
      try {
        await createSurvey(reunionId, title.trim(), questions)
        router.push(`/reunion/${reunionId}/surveys`)
      } catch (e: any) {
        setError(e.message)
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Survey'}
      </Button>
    </form>
  )
}
