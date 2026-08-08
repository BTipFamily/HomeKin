'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Download, Loader2, Search } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { MemberHistoryView } from '@/components/member-history-view'
import { getReunionReportCsv, type ReunionReport } from '@/lib/actions/member-history'

type Filter = 'all' | 'outstanding' | 'settled'

export default function ReportClient({
  report,
  reunionId,
}: {
  report: ReunionReport
  reunionId: string
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return report.byMember.filter((m) => {
      if (filter === 'outstanding' && m.outstanding <= 0) return false
      if (filter === 'settled' && m.outstanding > 0) return false
      if (!needle) return true
      return (
        m.memberName.toLowerCase().includes(needle) ||
        m.memberEmail.toLowerCase().includes(needle)
      )
    })
  }, [report.byMember, query, filter])

  function download() {
    setError(null)
    startTransition(async () => {
      try {
        const csv = await getReunionReportCsv(reunionId)
        // Lead with a BOM so Excel opens it as UTF-8 rather than mangling names.
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${report.reunionName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-signups-payments.csv`
        link.click()
        URL.revokeObjectURL(url)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not build the export.')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Members" value={String(report.byMember.length)} />
        <Stat label="Expected" value={formatCurrency(report.totals.totalOwed)} />
        <Stat label="Collected" value={formatCurrency(report.totals.totalPaid)} tone="good" />
        <Stat
          label="Outstanding"
          value={formatCurrency(report.totals.totalOutstanding)}
          tone={report.totals.totalOutstanding > 0 ? 'warn' : 'muted'}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'outstanding', 'settled'] as Filter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
        </div>
        <Button variant="outline" onClick={download} disabled={isPending}>
          {isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-4 w-4" />
          )}
          Export CSV
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {report.deadlines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment deadlines</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Due by</th>
                    <th className="px-4 py-2 font-medium">Event</th>
                    <th className="px-4 py-2 font-medium">Checkpoint</th>
                    <th className="px-4 py-2 text-right font-medium">Expected</th>
                    <th className="px-4 py-2 text-right font-medium">Collected</th>
                    <th className="px-4 py-2 text-right font-medium">Short</th>
                    <th className="px-4 py-2 text-right font-medium">Members</th>
                  </tr>
                </thead>
                <tbody>
                  {report.deadlines.map((d) => (
                    <tr key={d.deadlineId} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-4 py-2">{d.dueDate ?? '—'}</td>
                      <td className="px-4 py-2">{d.eventName}</td>
                      <td className="px-4 py-2">{d.label}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(d.expected)}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(d.collected)}</td>
                      <td
                        className={`px-4 py-2 text-right ${d.short > 0 ? 'font-medium text-warning' : 'text-muted-foreground'}`}
                      >
                        {formatCurrency(d.short)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-muted-foreground">
                        {d.membersPaid} paid
                        {d.membersShort > 0 && `, ${d.membersShort} short`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {visible.length} member{visible.length === 1 ? '' : 's'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nobody matches that filter.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Member</th>
                    <th className="px-4 py-2 font-medium">Events</th>
                    <th className="px-4 py-2 font-medium">People</th>
                    <th className="px-4 py-2 text-right font-medium">Owed</th>
                    <th className="px-4 py-2 text-right font-medium">Paid</th>
                    <th className="px-4 py-2 text-right font-medium">Outstanding</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((m) => {
                    const rows = report.rows.filter((r) => r.memberId === m.memberId)
                    const isOpen = expanded === m.memberId
                    return (
                      <Fragment key={m.memberId}>
                        <tr className="border-b last:border-0">
                          <td className="px-4 py-2">
                            <Link
                              href={`/directory/${m.memberId}`}
                              className="font-medium hover:underline"
                            >
                              {m.memberName}
                            </Link>
                            <p className="text-xs text-muted-foreground">{m.memberEmail}</p>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{m.events}</td>
                          <td className="px-4 py-2 text-muted-foreground">{m.headcount}</td>
                          <td className="px-4 py-2 text-right">{formatCurrency(m.owed)}</td>
                          <td className="px-4 py-2 text-right text-success">
                            {formatCurrency(m.paid)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {m.outstanding > 0 ? (
                              <span className="font-medium text-warning">
                                {formatCurrency(m.outstanding)}
                              </span>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-success-border bg-success-surface text-xs text-success-foreground"
                              >
                                Settled
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpanded(isOpen ? null : m.memberId)}
                            >
                              {isOpen ? 'Hide' : 'Detail'}
                            </Button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b bg-muted/20">
                            <td colSpan={7} className="px-4 py-4">
                              <MemberHistoryView
                                entries={rows}
                                totals={{
                                  events: m.events,
                                  totalHeadcount: m.headcount,
                                  totalOwed: m.owed,
                                  totalPaid: m.paid,
                                  totalOutstanding: m.outstanding,
                                  totalCredit: 0,
                                }}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'muted',
}: {
  label: string
  value: string
  tone?: 'good' | 'warn' | 'muted'
}) {
  const colour =
    tone === 'good' ? 'text-success' : tone === 'warn' ? 'text-warning' : 'text-foreground'
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${colour}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
