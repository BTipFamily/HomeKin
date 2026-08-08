import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GuideNote, H2, List, P, Screen, Step, Steps, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'signing-up-for-an-event',
  title: 'Signing up for an event',
  summary: 'Say you are coming, for how many — and change your mind later if you need to.',
  section: 'taking-part',
}

export default function Guide() {
  return (
    <>
      <P>
        You sign up for each event separately, so you can come to the banquet and skip the golf.
        Open <UI>Events</UI> on the reunion and click the one you want.
      </P>

      <Steps>
        <Step n={1} title="Say how many are coming">
          <p>
            <UI>Number of people</UI> means everyone in your household attending,{' '}
            <strong>including you</strong>. A couple with two children puts 4, not 3.
          </p>
          <p>
            This number is what the cost is worked out from, so it is the one to get right. At $25
            a head, 4 people is $100.
          </p>
          <Screen label="Event — sign up">
            <div className="max-w-md space-y-3">
              <div className="space-y-1">
                <Label>Number of people (including yourself)</Label>
                <Input defaultValue="4" className="w-24" readOnly />
              </div>
              <div className="space-y-1">
                <Label>Guest names (optional)</Label>
                <Input defaultValue="Tom, Ava, Noah" readOnly />
              </div>
              <p className="text-sm text-muted-foreground">Total: 4 × $25.00 = $100.00</p>
              <Button>Sign Up</Button>
            </div>
          </Screen>
        </Step>

        <Step n={2} title="Add guest names, if you like">
          <p>
            Optional, and worth doing. It helps the committee with name badges, seating and
            catering numbers for children, and it means the attendee list reads as people rather
            than as &quot;Jane Smith +3&quot;.
          </p>
        </Step>

        <Step n={3} title="Press Sign Up">
          <p>Three things happen at once:</p>
          <List>
            <li>You appear on the event&apos;s <UI>Who&apos;s Going</UI> list.</li>
            <li>
              A balance is created for what you owe — unless the event is one you book with the
              vendor yourself, in which case no money is involved.
            </li>
            <li>
              You are emailed a statement showing the amount and how to pay.
            </li>
          </List>
        </Step>
      </Steps>

      <GuideNote variant="tip" title="Signing up is not paying">
        <p>
          These are two separate steps on purpose. Signing up records that you are coming and what
          you owe; paying happens whenever suits you, from the Signups page. Nothing is charged at
          the moment you sign up.
        </p>
      </GuideNote>

      <H2>Changing your headcount</H2>
      <P>
        Go back to the event. Instead of the sign-up form you will see your current status, what
        it costs, and an <UI>Update Signup</UI> form. Change the number and save — your balance is
        recalculated and you are emailed a fresh statement.
      </P>

      <H2>Cancelling</H2>
      <P>
        <UI>Cancel Signup</UI> on the same page. What happens to the money depends on whether any
        has changed hands:
      </P>
      <List>
        <li>If you have paid nothing, the balance disappears entirely.</li>
        <li>
          If you have paid something, what you owe drops to zero and{' '}
          <strong>what you paid stays recorded as a credit</strong>. It is not silently pocketed,
          and it is not automatically refunded either — talk to the committee about getting it
          back or moving it to another event.
        </li>
      </List>

      <H2>When an event is full</H2>
      <P>
        Capacity counts heads, not households, so an event with 2 spots left cannot take a family
        of 4. Once it is full the page says{' '}
        <em>&quot;This event is at capacity. Contact the committee to be added to a waitlist.&quot;</em>{' '}
        — and that is exactly what you need to do, because{' '}
        <strong>there is no waitlist in the app</strong>. Message the committee in chat; they keep
        the list themselves.
      </P>

      <H2>Who&apos;s Going</H2>
      <P>
        Every signup is listed with its headcount and a status of{' '}
        <Badge variant="outline">Pending</Badge> or <Badge variant="secondary">Confirmed</Badge>.
        That status is about payment, not about whether your place is secure — your place is held
        the moment you sign up.
      </P>
    </>
  )
}
