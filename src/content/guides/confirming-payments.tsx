import { Button } from '@/components/ui/button'
import { GuideNote, H2, List, P, Screen, Step, Steps, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'confirming-payments',
  title: "Confirming payments and seeing who owes what",
  summary: 'The committee side of the money: the queue, the ledger, and the report.',
  section: 'taking-part',
  role: 'committee',
}

export default function Guide() {
  return (
    <>
      <P>
        The <UI>Payments</UI> page on a reunion is where the committee sees all of it at once:
        what has come in, what is outstanding, and what somebody says they have sent but nobody has
        checked yet.
      </P>

      <Steps>
        <Step n={1} title="Read the three numbers at the top">
          <p>
            <UI>Collected</UI>, split between card and manual so you can reconcile against the
            bank. <UI>Outstanding</UI>, the total still owed. And{' '}
            <UI>Awaiting Confirmation</UI> — the reports members have filed that you have not yet
            checked.
          </p>
          <Screen label="Payments — overview">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['Collected', '$3,420', '$2,180 card · $1,240 manual'],
                ['Outstanding', '$1,865', 'across 14 households'],
                ['Awaiting confirmation', '$300', '3 reported payments'],
              ].map(([label, amount, sub]) => (
                <div key={label} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-bold">{amount}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
                </div>
              ))}
            </div>
          </Screen>
        </Step>

        <Step n={2} title="Work the confirmation queue">
          <p>
            Each reported payment shows who, how much, and by what method. Check it against the
            actual account, then either confirm it or remove it.
          </p>
          <Screen label="Payments — reported payments to confirm">
            <div className="space-y-2">
              {[
                ['Jane Smith', 'Zelle', '$100.00'],
                ['Michael Carter', 'Check', '$150.00'],
              ].map(([who, how, amount]) => (
                <div key={who} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{who}</p>
                    <p className="text-xs text-muted-foreground">
                      {how} · Saturday Banquet
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{amount}</span>
                    <Button size="sm">Confirm</Button>
                  </div>
                </div>
              ))}
            </div>
          </Screen>
          <p>
            Confirming marks the money as received and{' '}
            <strong>emails that member a receipt</strong>. Removing it — &quot;This payment never
            arrived&quot; — puts the amount back on their balance.
          </p>
        </Step>

        <Step n={3} title="Go through the balances">
          <p>
            Below the queue, every household is listed worst-first — biggest outstanding at the
            top — with its full payment history underneath. That ordering is deliberate: the top of
            the list is your chase list.
          </p>
        </Step>
      </Steps>

      <GuideNote variant="warning" title="Confirm only what you can see in the account">
        <p>
          A confirmation is you vouching that the money arrived. Once confirmed the member is told
          they are paid, and they will reasonably stop thinking about it. If you cannot find the
          transfer, leave it pending and ask — that is what the pending state is for.
        </p>
      </GuideNote>

      <H2>Card payments are different</H2>
      <P>
        They confirm themselves and cannot be deleted. If a card payment needs reversing, refund it
        in Stripe and then record a negative payment here so the two agree. Deleting the record
        alone would leave HomeKin and Stripe telling different stories.
      </P>

      <H2>The report</H2>
      <P>
        The <UI>Report</UI> page is the same information arranged for chasing: search by name or
        email, filter to <UI>outstanding</UI> or <UI>settled</UI>, expand anyone to see their
        events and payments, and export the lot as CSV for a committee meeting or a spreadsheet.
      </P>

      <H2>What members can see</H2>
      <List>
        <li>Their own balance and payment history, always.</li>
        <li>
          A summary of everyone&apos;s balances is visible to committee members on the Signups
          page — ordinary members see only their own.
        </li>
      </List>
    </>
  )
}
