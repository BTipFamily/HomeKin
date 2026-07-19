'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getInitials } from '@/lib/utils'
import {
  addCustomRelationship,
  addParentChildRelationship,
  addPartnerRelationship,
  searchMembersForRelationshipPicker,
} from '@/lib/actions/relationships'
import type { ParentChildKind, PartnerStatus } from '@/types/database'

type RelationKind = 'parent' | 'child' | 'partner' | 'custom'

interface PickerResult {
  id: string
  name: string
  photo_url: string | null
  family_branch: string | null
}

const PARENT_CHILD_KINDS: { value: ParentChildKind; label: string }[] = [
  { value: 'biological', label: 'Biological' },
  { value: 'step', label: 'Step' },
  { value: 'adoptive', label: 'Adoptive' },
  { value: 'foster', label: 'Foster' },
]

const PARTNER_STATUSES: { value: PartnerStatus; label: string }[] = [
  { value: 'married', label: 'Married' },
  { value: 'partnered', label: 'Partnered' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'separated', label: 'Separated' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
]

export function RelationshipPicker({ memberId }: { memberId: string }) {
  const router = useRouter()
  const [relationKind, setRelationKind] = useState<RelationKind>('parent')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PickerResult[]>([])
  const [selected, setSelected] = useState<PickerResult | null>(null)
  const [kind, setKind] = useState<ParentChildKind>('biological')
  const [status, setStatus] = useState<PartnerStatus>('married')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [customLabel, setCustomLabel] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) return
    debounceRef.current = setTimeout(() => {
      searchMembersForRelationshipPicker(query, memberId).then((found) =>
        setResults(found as PickerResult[])
      )
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, memberId])

  const visibleResults = query.trim() ? results : []

  function reset() {
    setQuery('')
    setResults([])
    setSelected(null)
    setCustomLabel('')
    setStartDate('')
    setEndDate('')
  }

  function handleSubmit() {
    if (!selected) {
      setError('Search for and select a person first.')
      return
    }
    if (relationKind === 'custom' && !customLabel.trim()) {
      setError('Enter a label for this relationship.')
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        const formData = new FormData()
        if (relationKind === 'parent') {
          formData.set('parent_member_id', selected.id)
          formData.set('child_member_id', memberId)
          formData.set('kind', kind)
          await addParentChildRelationship(formData)
        } else if (relationKind === 'child') {
          formData.set('parent_member_id', memberId)
          formData.set('child_member_id', selected.id)
          formData.set('kind', kind)
          await addParentChildRelationship(formData)
        } else if (relationKind === 'partner') {
          formData.set('member_id', memberId)
          formData.set('partner_member_id', selected.id)
          formData.set('status', status)
          if (startDate) formData.set('start_date', startDate)
          if (endDate) formData.set('end_date', endDate)
          await addPartnerRelationship(formData)
        } else {
          formData.set('member_id', memberId)
          formData.set('related_member_id', selected.id)
          formData.set('custom_label', customLabel)
          await addCustomRelationship(formData)
        }
        reset()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <p className="text-sm font-medium">Add a relationship</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="relation-kind">Relationship</Label>
          <select
            id="relation-kind"
            value={relationKind}
            onChange={(e) => {
              setRelationKind(e.target.value as RelationKind)
              setError(null)
            }}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="parent">This is my parent</option>
            <option value="child">This is my child</option>
            <option value="partner">This is my spouse/partner</option>
            <option value="custom">Other relationship</option>
          </select>
        </div>

        {(relationKind === 'parent' || relationKind === 'child') && (
          <div className="space-y-2">
            <Label htmlFor="pc-kind">Type</Label>
            <select
              id="pc-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as ParentChildKind)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              {PARENT_CHILD_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {relationKind === 'partner' && (
          <div className="space-y-2">
            <Label htmlFor="partner-status">Status</Label>
            <select
              id="partner-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as PartnerStatus)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              {PARTNER_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {relationKind === 'partner' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="start-date">Start date</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end-date">End date</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      )}

      {relationKind === 'custom' && (
        <div className="space-y-2">
          <Label htmlFor="custom-label">Label</Label>
          <Input
            id="custom-label"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="e.g. Godparent, Guardian"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="member-search">Person</Label>
        {selected ? (
          <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
            <div className="flex items-center gap-2">
              <Avatar className="h-7 w-7">
                {selected.photo_url && <AvatarImage src={selected.photo_url} alt={selected.name} />}
                <AvatarFallback className="text-xs">{getInitials(selected.name)}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{selected.name}</span>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Change
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="member-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search members by name..."
              className="pl-9"
              autoComplete="off"
            />
            {visibleResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
                {visibleResults.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setSelected(r)
                      setResults([])
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <Avatar className="h-6 w-6">
                      {r.photo_url && <AvatarImage src={r.photo_url} alt={r.name} />}
                      <AvatarFallback className="text-xs">{getInitials(r.name)}</AvatarFallback>
                    </Avatar>
                    <span>{r.name}</span>
                    {r.family_branch && (
                      <span className="text-xs text-muted-foreground">{r.family_branch}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="button" size="sm" onClick={handleSubmit} disabled={isPending}>
        {isPending ? 'Adding...' : 'Add Relationship'}
      </Button>
    </div>
  )
}
