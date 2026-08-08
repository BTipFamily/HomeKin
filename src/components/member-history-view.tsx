import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { groupByReunion, type HistoryEntry, type HistoryTotals } from '@/lib/member-history'

/**
 * Renders a member's signup and payment history. Shared by the directory
 * profile and the committee report so both tell the same story.
 */
export function MemberHistoryView({
  entries,
  totals,
  showPayments = true,
}: {
  entries: HistoryEntry[]
  totals: HistoryTotals
  /** Committee sees individual payments; the summary alone is enough elsewhere. */
  showPayments?: boolean
}) {
  if (entries.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No events signed up for yet.
      </p>
    )
  }

  const groups = groupByReunion(entries)

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Events" value={String(totals.events)} />
        <Stat label="Total owed" value={formatCurrency(totals.totalOwed)} />
        <Stat label="Total paid" value={formatCurrency(totals.totalPaid)} tone="good" />
        <Stat
          label={totals.totalCredit > 0 ? 'Credit' : 'Outstanding'}
          value={formatCurrency(
            totals.totalCredit > 0 ? totals.totalCredit : totals.totalOutstanding
          )}
          tone={totals.totalOutstanding > 0 ? 'warn' : 'muted'}
        />
      </div>

      {groups.map((group) => (
        <div key={group.reunionId}>
          <p className="mb-2 text-sm font-medium">
            {group.reunionName}{' '}
            <span className="text-muted-foreground">{group.reunionYear}</span>
          </p>
          <div className="overflow-hidden rounded-lg border">
            {group.entries.map((entry, i) => (
              <div
                key={entry.key}
                className={`p-3 text-sm ${i > 0 ? 'border-t' : ''}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{entry.eventName}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.eventDate && <span>{entry.eventDate}</span>}
                      {entry.headcount !== null && (
                        <span>
                          {entry.eventDate ? ' · ' : ''}
                          {entry.headcount} {entry.headcount === 1 ? 'person' : 'people'}
                        </span>
                      )}
                      {entry.signupStatus && (
                        <span> · signup {entry.signupStatus}</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    {entry.amountOwed > 0 || entry.amountPaid > 0 ? (
                      <>
                        <p className="font-medium">
                          {formatCurrency(entry.amountPaid)}
                          <span className="text-muted-foreground">
                            {' '}
                            of {formatCurrency(entry.amountOwed)}
                          </span>
                        </p>
                        {entry.balanceStatus && <BalanceBadge status={entry.balanceStatus} />}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">No charge</span>
                    )}
                  </div>
                </div>

                {showPayments && entry.payments.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                    {entry.payments.map((payment) => (
                      <li key={payment.id} className="flex items-center justify-between gap-2">
                        <span>
                          {payment.paid_at.slice(0, 10)} · {payment.method}
                          {payment.note ? ` · ${payment.note}` : ''}
                        </span>
                        <span
                          className={
                            payment.amount < 0 ? 'text-destructive' : 'text-foreground'
                          }
                        >
                          {payment.amount < 0 ? '−' : ''}
                          {formatCurrency(Math.abs(payment.amount))}
                          {payment.status === 'pending' && (
                            <Badge variant="outline" className="ml-1.5 text-[10px]">
                              Pending
                            </Badge>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
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
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${colour}`}>{value}</p>
    </div>
  )
}

export function BalanceBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    unpaid: { label: 'Unpaid', className: 'border-danger-border bg-danger-surface text-danger-foreground' },
    pending_confirmation: {
      label: 'Awaiting confirmation',
      className: 'border-warning-border text-warning-foreground bg-warning-surface',
    },
    partially_paid: { label: 'Part paid', className: 'border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950' },
    paid: { label: 'Paid', className: 'border-success-border text-success-foreground bg-success-surface' },
  }
  const config = map[status] ?? { label: status, className: '' }
  return (
    <Badge variant="outline" className={`text-xs ${config.className}`}>
      {config.label}
    </Badge>
  )
}
