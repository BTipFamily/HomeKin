import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GuideNote, H2, List, P, Screen, Step, Steps, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'paying-by-card',
  title: 'Paying by card',
  summary: 'Settle what you owe online, and know exactly where your card details go.',
  section: 'taking-part',
}

export default function Guide() {
  return (
    <>
      <P>
        Everything you owe across the reunion is gathered on one page:{' '}
        <UI>Signups &amp; Pay</UI> on the reunion. Each event you have signed up for shows what it
        costs, what you have paid, and what is left.
      </P>

      <Steps>
        <Step n={1} title="Find what you owe">
          <p>
            Each signup carries a status: <Badge variant="outline">Unpaid</Badge>,{' '}
            <Badge variant="outline">Pending</Badge>, <Badge variant="outline">Partial</Badge> or{' '}
            <Badge variant="secondary">Paid</Badge>. A <UI>Total Owed</UI> card at the top adds it
            all up.
          </p>
          <Screen label="Signups & Pay">
            <div className="max-w-lg space-y-3">
              <div className="rounded-lg border p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">Saturday Banquet</p>
                    <p className="text-xs text-muted-foreground">10 July · 4 people</p>
                  </div>
                  <Badge variant="outline">Unpaid</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between border-t pt-3">
                  <p className="text-sm text-muted-foreground">$0.00 paid of $100.00</p>
                  <Button size="sm">Pay $100.00</Button>
                </div>
                <p className="mt-2 text-xs text-primary">I already paid another way</p>
              </div>
            </div>
          </Screen>
        </Step>

        <Step n={2} title="Press Pay">
          <p>
            You are taken to Stripe&apos;s own checkout page to enter your card. HomeKin never sees
            or stores your card number — the payment happens on Stripe&apos;s systems, and only the
            result comes back.
          </p>
        </Step>

        <Step n={3} title="Come back">
          <p>
            After paying you land back on the Signups page with a green confirmation, and the
            balance updates on its own. If you change your mind on the checkout page and back out,
            you return with a &quot;cancelled&quot; note and nothing has been charged.
          </p>
        </Step>
      </Steps>

      <GuideNote variant="tip" title="Card payments confirm themselves">
        <p>
          A card payment is confirmed the moment Stripe reports it, with no committee member
          needing to do anything, and your receipt is emailed automatically. This is the
          difference from paying by Zelle or cheque, which somebody has to tick off by hand.
        </p>
      </GuideNote>

      <H2>Paying part of it</H2>
      <P>
        The Pay button settles everything outstanding on that event. If you need to pay in
        instalments, use the deadlines the committee has set — pay what is due now, and the rest
        stays outstanding until you come back. Your status shows{' '}
        <Badge variant="outline">Partial</Badge> in the meantime.
      </P>

      <H2>If something goes wrong</H2>
      <List>
        <li>
          <strong>Paid but the page still says unpaid.</strong> Give it a moment and refresh —
          confirmation arrives from Stripe separately from your return to the page.
        </li>
        <li>
          <strong>Charged twice.</strong> Tell the committee. They can see every payment against
          your balance and arrange the refund through Stripe.
        </li>
        <li>
          <strong>No Pay button.</strong> Either there is nothing outstanding, or the event is one
          you book with the vendor directly — in which case HomeKin was never collecting money for
          it.
        </li>
      </List>
    </>
  )
}
