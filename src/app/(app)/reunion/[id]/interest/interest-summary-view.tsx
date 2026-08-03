import { topMonths, type InterestSummary } from '@/lib/interest-summary'

/**
 * The committee's read on where the family has landed.
 *
 * Leads with the headcount range rather than a single figure: a venue deposit
 * gets booked against this, and "42 have said yes, up to 71 might come" is a
 * different decision from "71 people are coming".
 */
export function InterestSummaryView({ summary }: { summary: InterestSummary }) {
  const { headcount, attending } = summary
  const best = topMonths(summary, 3)
  const busiest = Math.max(...summary.months.map((m) => m.people), 1)

  return (
    <div className="space-y-6">
      {/* Headcount */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Projected headcount
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums">
          {headcount.confirmed}
          <span className="text-muted-foreground">–{headcount.optimistic}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          {headcount.confirmed} confirmed · {headcount.likely} likely · {headcount.optimistic} if
          everyone unsure comes
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {headcount.adults} adults · {headcount.youth} teens · {headcount.children} children
        </p>
      </div>

      {/* Replies */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ['Yes', attending.yes],
            ['Probably', attending.probably],
            ['Not sure', attending.unsure],
            ['No', attending.no],
          ] as const
        ).map(([label, count]) => (
          <div key={label} className="rounded-md border p-3">
            <p className="text-xl font-semibold tabular-nums">{count}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Months */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          When people can travel
        </p>
        <div className="space-y-1">
          {summary.months.map((month) => (
            <div key={month.month} className="flex items-center gap-2">
              <span className="w-9 shrink-0 text-xs text-muted-foreground">
                {month.name.slice(0, 3)}
              </span>
              <div className="h-4 flex-1 overflow-hidden rounded-sm bg-muted">
                <div
                  className="h-full rounded-sm bg-primary/70"
                  style={{ width: `${(month.people / busiest) * 100}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {month.people > 0 ? `${month.people} ppl` : '—'}
              </span>
            </div>
          ))}
        </div>
        {best.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Best support: {best.map((m) => m.name).join(', ')}.
          </p>
        )}
      </div>

      {/* Distributions */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Distribution
          title="Budget comfort"
          rows={summary.budget.map((b) => ({ label: b.label, count: b.households }))}
        />
        <Distribution
          title="Lodging"
          rows={summary.lodging.map((l) => ({ label: l.label, count: l.households }))}
        />
        <Distribution
          title="Preferred length"
          rows={summary.lengths.map((l) => ({ label: l.label, count: l.households }))}
        />
        <Distribution
          title={`Volunteers (${summary.volunteers.total})`}
          rows={summary.volunteers.byArea.map((v) => ({ label: v.area, count: v.count }))}
          empty="Nobody has offered yet."
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {summary.historyInterest} household(s) offered family history, photos or stories.
      </p>
    </div>
  )
}

function Distribution({
  title,
  rows,
  empty = 'No answers yet.',
}: {
  title: string
  rows: { label: string; count: number }[]
  empty?: string
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.label} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium tabular-nums">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
