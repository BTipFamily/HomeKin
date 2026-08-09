import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { GuideNote, H2, List, P, Screen, Step, Steps, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'estimating-the-budget',
  title: 'Estimating the budget',
  summary: 'Work out roughly what a reunion will cost before committing anyone to anything.',
  section: 'planning',
}

export default function Guide() {
  return (
    <>
      <P>
        The budget estimator is a planning tool, not a ledger. It answers &quot;what would this
        cost, roughly, per person?&quot; so the committee can sanity-check an idea before booking
        anything. Real money — what people actually owe and have paid — lives on the Payments
        page and has nothing to do with this.
      </P>
      <P>
        Everyone can read the estimate. Only committee and admins can change it.
      </P>

      <Steps>
        <Step n={1} title="Describe the reunion">
          <p>
            Host city, number of nights, and how many are coming split into adults, youth (6–12)
            and toddlers (0–5). Then a budget style: <UI>low</UI>, <UI>average</UI> or{' '}
            <UI>high</UI>, which scales everything at once.
          </p>
          <Screen label="Budget estimator — basics">
            <div className="grid max-w-lg gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Host City</Label>
                <Input defaultValue="Atlanta, GA" readOnly />
              </div>
              <div className="space-y-1">
                <Label>Nights</Label>
                <Input defaultValue="3" readOnly />
              </div>
              <div className="space-y-1">
                <Label>Adults 13+</Label>
                <Input defaultValue="38" readOnly />
              </div>
              <div className="space-y-1">
                <Label>Youth 6–12</Label>
                <Input defaultValue="11" readOnly />
              </div>
            </div>
          </Screen>
          <p>
            The host city matters more than it looks — each city carries a cost-of-living index,
            so the same plan priced in Atlanta and in San Francisco gives different answers.
          </p>
        </Step>

        <Step n={2} title="Turn categories on and off">
          <p>
            Venue, catering and food, activities and excursions, entertainment, heritage and
            genealogy, merchandise and apparel, lodging. Include the ones that apply and adjust
            any figure you have a real quote for. Totals update as you type, including the
            per-person number, which is usually the one that decides things.
          </p>
        </Step>

        <Step n={3} title="Save it, or print it">
          <p>
            <UI>Save Estimate</UI> keeps it so the rest of the committee sees the same numbers.{' '}
            <UI>Download Estimate</UI> opens your browser&apos;s print dialogue — choose &quot;Save
            as PDF&quot; to get a file you can email round.
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled>Save Estimate</Button>
            <Button size="sm" variant="outline" disabled>Download Estimate</Button>
          </div>
        </Step>
      </Steps>

      <GuideNote title="This never charges anybody">
        <p>
          Nothing here creates a balance or asks anyone for money. It is a spreadsheet with better
          manners. What people actually owe comes from the per-person cost you set on each event,
          and from their signups.
        </p>
      </GuideNote>

      <H2>Using it well</H2>
      <List>
        <li>
          Run it early, on guesses, to find out whether the reunion the family described is
          affordable at all.
        </li>
        <li>
          Run it again as real quotes arrive, replacing estimates one at a time.
        </li>
        <li>
          Compare the per-person figure with what people said they could comfortably spend on the
          interest form. That comparison is the single most useful thing this tool does.
        </li>
      </List>
    </>
  )
}
