import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { GuideNote, H2, List, P, Screen, Step, Steps, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'payment-deadlines',
  title: 'Payment deadlines and reminders',
  summary: 'Stage a big payment into instalments, and let HomeKin do the chasing.',
  section: 'events',
  role: 'committee',
}

export default function Guide() {
  return (
    <>
      <P>
        For anything expensive, asking for the whole amount at once tends to get you nothing at
        all. Deadlines let you split it — a deposit now, the rest before the caterer needs
        confirming — and have HomeKin email the reminders so no one has to be the person who
        nags.
      </P>
      <P>
        They are optional, and live at the bottom of the event form under{' '}
        <UI>Payment deadlines</UI>.
      </P>

      <Steps>
        <Step n={1} title="Add a deadline row">
          <p>
            Each row is a name, a due date, and how much. Name it something a member will
            recognise on a bank statement — &quot;Deposit&quot;, &quot;Final balance&quot;.
          </p>
          <Screen label="Event form — payment deadlines">
            <div className="space-y-2">
              {[
                ['Deposit', '2027-03-01', '25%'],
                ['Final balance', '2027-06-15', 'Remainder'],
              ].map(([name, due, amount]) => (
                <div key={name} className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input defaultValue={name} className="h-9 w-36" readOnly />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Due date</Label>
                    <Input defaultValue={due} className="h-9 w-36" readOnly />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Amount</Label>
                    <Input defaultValue={amount} className="h-9 w-28" readOnly />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Remind (days before)</Label>
                    <Input defaultValue="14, 3" className="h-9 w-32" readOnly />
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm">Add a deadline</Button>
            </div>
          </Screen>
        </Step>

        <Step n={2} title="Choose how the amount is worked out">
          <p>Three ways, and they mix freely:</p>
          <List>
            <li>
              <UI>Percent</UI> — a share of what that household owes. Scales with headcount
              automatically, so a family of five is asked for more than a couple.
            </li>
            <li>
              <UI>Fixed per person</UI> — a flat figure per head. Good when the venue wants a
              specific deposit per guest.
            </li>
            <li>
              <UI>Remainder</UI> — whatever is still outstanding. Almost always what the last row
              should be, because it can never leave a few cents behind through rounding.
            </li>
          </List>
        </Step>

        <Step n={3} title="Set the reminder offsets">
          <p>
            <UI>Remind (days before)</UI> takes a comma-separated list, defaulting to{' '}
            <UI>14, 3</UI> — one email a fortnight out, one three days out. Change it to whatever
            suits, or clear it for a deadline you would rather chase yourself.
          </p>
        </Step>
      </Steps>

      <GuideNote variant="warning" title="These emails go to real people automatically">
        <p>
          A reminder is sent to every member with an outstanding amount against that deadline,
          without anyone pressing send. Each person gets each reminder once — HomeKin records what
          it has sent — but a badly set date still means the whole family is emailed at a time you
          didn&apos;t intend. Check the dates before saving.
        </p>
      </GuideNote>

      <H2>What gets rejected</H2>
      <P>
        The form checks as you type, and the server checks again on save. Percentages across all
        deadlines can&apos;t exceed 100. Nothing can fall after the event date. A deadline with no
        amount is not a deadline.
      </P>

      <H2>Editing them later</H2>
      <P>
        Safe to do. Rows keep their identity when you edit, so a reminder that has already gone out
        will not fire a second time just because you corrected a typo elsewhere in the list.
      </P>

      <H2>What members see</H2>
      <P>
        On their Signups page: what they owe, what they have paid, and what falls due next.
        Reminder emails carry the same figures and a link straight to the payment page — the whole
        point being that a member never has to work out their own arithmetic.
      </P>
    </>
  )
}
