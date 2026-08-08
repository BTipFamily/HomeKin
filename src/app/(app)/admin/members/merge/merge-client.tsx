'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  AlertCircle,
  ArrowRight,
  ArrowLeftRight,
  CheckCircle2,
  Info,
  Loader2,
  Users,
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import type { DuplicatePair, MergeCandidate } from '@/lib/member-merge'
import {
  mergeMembers,
  previewMemberMerge,
  type MergeOutcome,
  type MergePreview,
} from '@/lib/actions/member-merge'

export default function MergeClient({ initialPairs }: { initialPairs: DuplicatePair[] }) {
  const [isPending, startTransition] = useTransition()
  const [pairs, setPairs] = useState(initialPairs)
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [outcome, setOutcome] = useState<MergeOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)

  function openPreview(keepId: string, removeId: string) {
    setError(null)
    setOutcome(null)
    startTransition(async () => {
      try {
        setPreview(await previewMemberMerge(keepId, removeId))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not build a preview.')
      }
    })
  }

  function confirmMerge() {
    if (!preview) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await mergeMembers(preview.keep.id, preview.remove.id)
        const removedId = preview.remove.id
        setOutcome(result)
        setPreview(null)
        // Drop every suggestion that referenced the profile that no longer exists.
        setPairs((current) =>
          current.filter((p) => p.keep.id !== removedId && p.remove.id !== removedId)
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The merge failed.')
      }
    })
  }

  // ---- Confirmation step ----
  if (preview) {
    const blocked = preview.blockers.length > 0

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review this merge</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <ProfileSummary member={preview.keep} tone="keep" />
              <ArrowRight className="mx-auto hidden h-5 w-5 text-muted-foreground sm:block" />
              <ProfileSummary member={preview.remove} tone="remove" />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => openPreview(preview.remove.id, preview.keep.id)}
              disabled={isPending}
            >
              <ArrowLeftRight className="mr-1.5 h-4 w-4" />
              Swap — keep {preview.remove.name} instead
            </Button>

            {preview.blockers.map((message, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{message}</span>
              </div>
            ))}

            {preview.warnings.map((message, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-surface p-4 text-sm text-warning-foreground"
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{message}</span>
              </div>
            ))}

            <div>
              <p className="text-sm font-medium">The surviving profile</p>
              <div className="mt-2 overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <tbody>
                    {preview.fields.map((field) => (
                      <tr key={field.field} className="border-b last:border-0">
                        <td className="w-36 bg-muted/40 px-3 py-2 align-top text-xs font-medium text-muted-foreground">
                          {field.label}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span className={field.result ? '' : 'text-muted-foreground'}>
                            {field.result ?? '—'}
                          </span>
                          {field.filledFromRemoved && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              from {preview.remove.name}
                            </Badge>
                          )}
                          {!field.filledFromRemoved &&
                            field.removedValue &&
                            field.removedValue !== field.result && (
                              <span className="ml-2 text-xs text-muted-foreground line-through">
                                {field.removedValue}
                              </span>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Blanks are filled in from {preview.remove.name}; nothing already set is
                overwritten. You can edit the profile afterwards.
              </p>
            </div>

            {preview.moves.length > 0 && (
              <div>
                <p className="text-sm font-medium">What moves across</p>
                <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
                  {preview.moves.map((move) => (
                    <li key={move.label} className="flex items-center justify-between rounded border px-3 py-1.5">
                      <span>{move.label}</span>
                      <span className="font-medium text-foreground">{move.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Separator />

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={confirmMerge} disabled={blocked || isPending}>
                {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Merge and delete {preview.remove.name}
              </Button>
              <Button variant="outline" onClick={() => setPreview(null)} disabled={isPending}>
                Cancel
              </Button>
              <span className="text-xs text-muted-foreground">This cannot be undone.</span>
            </div>

            {error && (
              <p className="flex items-start gap-1.5 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---- List of suggestions ----
  return (
    <div className="space-y-4">
      {outcome && (
        <Card className="border-success-border bg-success-surface">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <div className="text-sm text-success-foreground">
                <p className="font-semibold">
                  Merged — {outcome.removedName}
                  {outcome.removedEmail ? ` (${outcome.removedEmail})` : ''} has been removed.
                </p>
                {outcome.counts.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {outcome.counts.map((c) => (
                      <li key={c.label}>
                        {c.label}: {c.count}
                      </li>
                    ))}
                  </ul>
                )}
                {outcome.adoptedLogin && (
                  <p className="mt-2">Their login now signs in to the profile you kept.</p>
                )}
                {outcome.orphanedLogin && (
                  <p className="mt-2 font-medium">
                    The other login no longer has a profile — re-invite that person if they still
                    need access.
                  </p>
                )}
                <Button asChild size="sm" className="mt-3">
                  <Link href={`/directory/${outcome.keptId}`}>View the merged profile</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {pairs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="mx-auto mb-3 h-8 w-8" />
            <p className="font-medium text-foreground">No likely duplicates found</p>
            <p className="mt-1 text-sm">
              Everyone in the directory looks distinct. Profiles are compared on email address,
              name, phone number and date of birth.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {pairs.length} possible duplicate pair{pairs.length === 1 ? '' : 's'}, most likely
            first. Nothing is merged until you confirm.
          </p>
          {pairs.map((pair) => (
            <Card key={`${pair.keep.id}-${pair.remove.id}`}>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-center gap-2">
                  <ConfidenceBadge score={pair.score} />
                  {pair.reasons.map((reason) => (
                    <Badge key={reason} variant="outline" className="text-xs font-normal">
                      {reason}
                    </Badge>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <ProfileSummary member={pair.keep} tone="keep" />
                  <ProfileSummary member={pair.remove} tone="remove" />
                </div>

                <div className="mt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openPreview(pair.keep.id, pair.remove.id)}
                    disabled={isPending}
                  >
                    {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Review merge
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  )
}

function ConfidenceBadge({ score }: { score: number }) {
  if (score >= 90) {
    return <Badge className="bg-green-600 hover:bg-green-600">Very likely the same person</Badge>
  }
  if (score >= 70) return <Badge variant="secondary">Probably the same person</Badge>
  return <Badge variant="outline">Possibly the same person</Badge>
}

function ProfileSummary({
  member,
  tone,
}: {
  member: MergeCandidate
  tone: 'keep' | 'remove'
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        tone === 'keep' ? 'border-success-border bg-success-surface/50' : 'border-muted bg-muted/30'
      }`}
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {tone === 'keep' ? 'Keep' : 'Merge away and delete'}
      </p>
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          {member.photo_url && <AvatarImage src={member.photo_url} alt={member.name} />}
          <AvatarFallback className="text-xs">{getInitials(member.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 text-sm">
          <Link
            href={`/directory/${member.id}`}
            className="font-medium hover:underline"
            target="_blank"
          >
            {member.name}
          </Link>
          <p className="truncate text-muted-foreground">{member.email}</p>
          {member.phone && <p className="text-muted-foreground">{member.phone}</p>}
          {member.family_branch && (
            <p className="text-xs text-muted-foreground">{member.family_branch}</p>
          )}
          <div className="mt-1 flex flex-wrap gap-1">
            {member.role !== 'member' && (
              <Badge variant="secondary" className="text-[10px] capitalize">
                {member.role}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px]">
              {member.auth_user_id ? 'Has login' : 'Never signed in'}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  )
}
