import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GuideNote, H2, List, P, Screen, Step, Steps, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'reporting-a-payment',
  title: 'Reporting a payment you made another way',
  summary: 'Paid by Zelle, Cash App, cheque or cash? Tell HomeKin so your balance is right.',
  section: 'taking-part',
}

export default function Guide() {
  return (
    <>
      <P>
        Plenty of families move money by Zelle or hand a cheque over at church. HomeKin has no way
        to know that happened, so you tell it — otherwise your balance keeps saying you owe money
        you have already paid, and the reminder emails keep coming.
      </P>

      <Steps>
        <Step n={1} title="Open the event on Signups & Pay">
          <p>
            Under the Pay button there is a quieter link:{' '}
            <UI>I already paid another way</UI>. Press it and a small form opens.
          </p>
        </Step>

        <Step n={2} title="Say how, and how much">
          <p>
            Pick <UI>Zelle</UI>, <UI>Cash App</UI>, <UI>Check</UI> or <UI>Other</UI>, and give the
            amount. It is pre-filled with what is outstanding, so if you paid it all you can leave
            it alone.
          </p>
          <Screen label="Report a payment">
            <div className="max-w-md space-y-3">
              <div className="space-y-1">
                <Label>How did you pay?</Label>
                <div className="flex flex-wrap gap-2">
                  <Badge className="border-transparent bg-primary text-primary-foreground">Zelle</Badge>
                  <Badge variant="outline">Cash App</Badge>
                  <Badge variant="outline">Check</Badge>
                  <Badge variant="outline">Other</Badge>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Amount</Label>
                <Input defaultValue="100.00" className="w-32" readOnly />
              </div>
              <Button>Report payment</Button>
            </div>
          </Screen>
          <p>
            Report what you <em>actually sent</em>. If you paid half, enter half — a partial
            report is far more useful to the committee than a rounded-up guess.
          </p>
        </Step>

        <Step n={3} title="Wait for it to be confirmed">
          <p>
            Your status becomes <Badge variant="outline">Pending</Badge> and the page says
            &quot;Reported — the committee will confirm it.&quot; Somebody on the committee checks
            it against the account and confirms, at which point it counts as paid and you are
            emailed a receipt.
          </p>
        </Step>
      </Steps>

      <GuideNote title="Reporting is a claim, not a payment">
        <p>
          Anyone can type any number into this form, which is why it does not settle your balance
          on its own. It is a message to the committee saying &quot;look for this&quot;. Until
          somebody confirms it, the money is still counted as outstanding.
        </p>
      </GuideNote>

      <H2>If it stays pending</H2>
      <P>
        Committee members are volunteers, so a day or two is normal. Longer than that, mention it
        in chat — the most common causes are a transfer that arrived without a name attached, or an
        amount that doesn&apos;t match anything they were expecting. Telling them the date you sent
        it usually resolves it in one message.
      </P>

      <H2>If it was never received</H2>
      <P>
        The committee can delete a reported payment that never arrived, which puts the amount back
        onto your balance. That is not an accusation — transfers do fail — but it does mean the
        money needs sending again.
      </P>

      <H2>What the committee sees</H2>
      <List>
        <li>Your report appears in an <UI>Awaiting Confirmation</UI> queue on the Payments page.</li>
        <li>They see the method, the amount, and who reported it.</li>
        <li>
          They press <UI>Confirm</UI>, or remove it with &quot;This payment never arrived&quot;.
        </li>
      </List>
    </>
  )
}
