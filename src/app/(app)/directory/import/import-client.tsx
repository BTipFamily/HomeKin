'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Upload,
  Users,
} from 'lucide-react'
import { previewMemberImport, commitMemberImport, type ImportResult } from '@/lib/actions/member-import'
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS, type ImportPlan } from '@/lib/member-import'

const REQUIRED_COLUMNS = ['name', 'email']
const RELATIONSHIP_COLUMNS = ['parent_1', 'parent_2', 'parent_kind', 'spouse', 'spouse_status']

export default function ImportClient({ isAdmin }: { isAdmin: boolean }) {
  const [isPending, startTransition] = useTransition()
  const [fileName, setFileName] = useState<string | null>(null)
  const [csvText, setCsvText] = useState<string | null>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setPlan(null)
    setResult(null)
    setError(null)
    setCsvText(null)
    setFileName(file?.name ?? null)
    if (!file) return

    startTransition(async () => {
      try {
        const text = await file.text()
        setCsvText(text)
        const nextPlan = await previewMemberImport(text)
        setPlan(nextPlan)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not read that file.')
      }
    })
  }

  function handleImport() {
    if (!csvText) return
    setError(null)
    startTransition(async () => {
      try {
        const nextResult = await commitMemberImport(csvText)
        setResult(nextResult)
        setPlan(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The import failed.')
      }
    })
  }

  function reset() {
    setFileName(null)
    setCsvText(null)
    setPlan(null)
    setResult(null)
    setError(null)
  }

  // ---- Success state ----
  if (result) {
    return (
      <div className="space-y-4">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <div>
                <p className="font-semibold text-green-900">Import complete</p>
                <ul className="mt-2 space-y-1 text-sm text-green-900">
                  <li>{result.membersCreated} member{result.membersCreated === 1 ? '' : 's'} added</li>
                  {result.membersSkipped > 0 && (
                    <li>
                      {result.membersSkipped} already in the directory — left unchanged
                    </li>
                  )}
                  <li>
                    {result.relationshipsCreated} relationship
                    {result.relationshipsCreated === 1 ? '' : 's'} created
                    {result.relationshipsSkipped > 0 &&
                      ` (${result.relationshipsSkipped} already existed)`}
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {result.writeErrors.length > 0 && (
          <Card className="border-amber-200">
            <CardHeader>
              <CardTitle className="text-base">Some rows could not be saved</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {result.writeErrors.map((message, i) => (
                  <li key={i}>{message}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3">
          <Button asChild>
            <Link href="/directory">View Directory</Link>
          </Button>
          <Button variant="outline" onClick={reset}>
            Import Another File
          </Button>
        </div>
      </div>
    )
  }

  const blockingErrors = plan?.errors ?? []
  const canImport = !!plan && blockingErrors.length === 0 && plan.summary.toCreate > 0

  return (
    <div className="space-y-6">
      {/* Step 1 — template */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Start from the template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" asChild>
            <a href="/api/directory/import-template" download>
              <Download className="mr-1.5 h-4 w-4" />
              Download CSV Template
            </a>
          </Button>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Open it in Excel or Google Sheets, replace the example rows with your family, then
              save as <strong>CSV</strong>. Up to {MAX_IMPORT_ROWS} people per file.
            </p>
            <div>
              <p className="font-medium text-foreground">Columns</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {IMPORT_COLUMNS.map((col) => (
                  <Badge
                    key={col}
                    variant={REQUIRED_COLUMNS.includes(col) ? 'default' : 'outline'}
                    className="font-mono text-xs"
                  >
                    {col}
                    {REQUIRED_COLUMNS.includes(col) && ' *'}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-xs">
                <strong>name</strong> and <strong>email</strong> are required — email is how each
                person later claims their own profile when they sign up.
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <p className="flex items-center gap-1.5 font-medium">
                <Info className="h-3.5 w-3.5" />
                Linking families
              </p>
              <p className="mt-1 text-xs">
                Give each person an <code className="font-mono">external_id</code> (any short label
                like <code className="font-mono">1</code> or{' '}
                <code className="font-mono">grandpa-joe</code>), then put that value in someone
                else&apos;s{' '}
                {RELATIONSHIP_COLUMNS.slice(0, 2).map((c, i) => (
                  <span key={c}>
                    {i > 0 && ' / '}
                    <code className="font-mono">{c}</code>
                  </span>
                ))}{' '}
                or <code className="font-mono">spouse</code> column. An email address works as a
                reference too, including for people already in the directory.
              </p>
              {!isAdmin && (
                <p className="mt-2 text-xs">
                  Note: only an admin can assign committee or admin roles — everyone you import will
                  be added as a regular member.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 2 — upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Upload your file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center transition-colors hover:bg-muted/50">
            <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm font-medium">
              {fileName ?? 'Choose a CSV file'}
            </span>
            <span className="text-xs text-muted-foreground">
              We&apos;ll check it and show you a preview before anything is saved.
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileChange}
              disabled={isPending}
            />
          </label>

          {isPending && !plan && (
            <p className="text-sm text-muted-foreground">Checking your file...</p>
          )}
          {error && (
            <p className="flex items-start gap-1.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Step 3 — preview */}
      {plan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Review and import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryTile
                label="To be added"
                value={plan.summary.toCreate}
                icon={<Users className="h-5 w-5 text-green-600" />}
              />
              <SummaryTile
                label="Already in directory"
                value={plan.summary.toSkip}
                hint="skipped"
                icon={<Info className="h-5 w-5 text-muted-foreground" />}
              />
              <SummaryTile
                label="Relationships"
                value={plan.summary.relationships}
                icon={<Users className="h-5 w-5 text-blue-600" />}
              />
            </div>

            {blockingErrors.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <p className="flex items-center gap-1.5 font-medium text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {blockingErrors.length} problem{blockingErrors.length === 1 ? '' : 's'} to fix
                  before importing
                </p>
                <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm text-destructive">
                  {blockingErrors.map((issue, i) => (
                    <li key={i}>
                      <strong>Row {issue.row}</strong>
                      {issue.column && (
                        <span className="font-mono text-xs"> ({issue.column})</span>
                      )}
                      : {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {plan.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="font-medium text-amber-900">Notes</p>
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm text-amber-900">
                  {plan.warnings.map((issue, i) => (
                    <li key={i}>
                      {issue.row > 1 ? `Row ${issue.row}: ` : ''}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {plan.people.length > 0 && (
              <div className="max-h-96 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Row</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.people.map((person) => {
                      const rowHasError = blockingErrors.some((e) => e.row === person.row)
                      return (
                        <TableRow key={person.row}>
                          <TableCell className="text-muted-foreground">{person.row}</TableCell>
                          <TableCell className="font-medium">{person.name || '—'}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {person.email || '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {person.familyBranch ?? '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            {rowHasError ? (
                              <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                                Error
                              </Badge>
                            ) : person.alreadyExists ? (
                              <Badge variant="outline">Skip</Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-green-200 bg-green-50 text-green-700"
                              >
                                Add
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleImport} disabled={!canImport || isPending}>
                <Upload className="mr-1.5 h-4 w-4" />
                {isPending
                  ? 'Importing...'
                  : `Import ${plan.summary.toCreate} Member${plan.summary.toCreate === 1 ? '' : 's'}`}
              </Button>
              <Button variant="outline" onClick={reset} disabled={isPending}>
                Cancel
              </Button>
            </div>

            {!canImport && blockingErrors.length === 0 && plan.summary.toCreate === 0 && (
              <p className="text-sm text-muted-foreground">
                Everyone in this file is already in the directory — there is nothing to import.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SummaryTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string
  value: number
  hint?: string
  icon: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {icon}
    </div>
  )
}
