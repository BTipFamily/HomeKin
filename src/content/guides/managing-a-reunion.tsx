import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { GuideNote, H2, List, P, Screen, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'managing-a-reunion',
  title: 'Reunion details, and deleting a reunion',
  summary: 'Change the name, dates, description or location — or remove the whole thing.',
  section: 'planning',
  role: 'committee',
}

export default function Guide() {
  return (
    <>
      <P>
        <UI>Manage</UI> in the reunion nav is where the reunion&apos;s own details live, as
        opposed to its events or its money. Committee members and admins can reach it.
      </P>

      <H2>The details form</H2>
      <P>
        Name, year, start and end dates, description, location name and address. The address is
        looked up and pinned on the travel map, so it is worth entering fully.
      </P>
      <Screen label="Manage reunion">
        <div className="grid max-w-lg gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>Name</Label>
            <Input defaultValue="Carter Family Reunion" readOnly />
          </div>
          <div className="space-y-1">
            <Label>Start Date</Label>
            <Input defaultValue="2027-07-09" readOnly />
          </div>
          <div className="space-y-1">
            <Label>End Date</Label>
            <Input defaultValue="2027-07-13" readOnly />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Location Name</Label>
            <Input defaultValue="Peachtree Hall, Atlanta" readOnly />
          </div>
        </div>
      </Screen>

      <GuideNote variant="tip" title="The start date drives the timeline">
        <p>
          The planning checklist is counted backwards from the start date, so changing it here
          reshuffles every deadline on the timeline. That is usually what you want — but if the
          committee has been working to those dates, tell them.
        </p>
      </GuideNote>

      <H2>The stat cards</H2>
      <P>
        Events, signups and expected revenue at a glance. Expected revenue is what people{' '}
        <em>owe</em> based on signups, not what has come in — the Payments page has that.
      </P>

      <H2>Deleting a reunion</H2>
      <P>
        <strong>Admins only.</strong> A committee member can run a reunion but cannot destroy one.
      </P>
      <P>
        Pressing <UI>Delete this reunion</UI> opens a preview of exactly what will be removed —
        events, signups, balances, payments, photos, messages — and requires you to type the
        reunion&apos;s name to confirm. The typing is not ceremony; it is there because this
        cannot be undone.
      </P>
      <List>
        <li>Everything belonging to the reunion goes with it.</li>
        <li>Members, profiles and relationships are untouched — those belong to the family, not the reunion.</li>
        <li>You are returned to the dashboard with a confirmation.</li>
      </List>

      <GuideNote variant="warning" title="Payment records go too">
        <p>
          If money has moved through this reunion, deleting it removes the record of who paid what.
          Export the report to CSV from the Report page first. A refund argument six months later
          is much easier with a spreadsheet than without one.
        </p>
      </GuideNote>

      <div className="mt-4">
        <Button variant="destructive" size="sm" disabled>Delete this reunion</Button>
      </div>
    </>
  )
}
