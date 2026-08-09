import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { GuideNote, H2, List, P, Screen, Step, Steps, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'adding-an-event',
  title: 'Adding an event',
  summary: 'Put a gathering on the schedule — the cookout, the banquet, the cemetery visit.',
  section: 'events',
  role: 'committee',
}

export default function Guide() {
  return (
    <>
      <P>
        A reunion is made of events. Each one is separately signed up for and separately paid for,
        which is what lets one household come to the Saturday banquet and skip the Friday golf.
      </P>
      <P>
        Go to <UI>Events</UI> on the reunion and press <UI>Add Event</UI>.
      </P>

      <Steps>
        <Step n={1} title="Name it and date it">
          <p>
            Only <UI>Event Name</UI> and <UI>Date</UI> are required. Everything else can be filled
            in as it firms up, which means you can put a placeholder on the schedule now and
            finish it later.
          </p>
          <Screen label="Add event — the basics">
            <div className="grid max-w-lg gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label>Event Name *</Label>
                <Input defaultValue="Saturday Banquet" readOnly />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Description</Label>
                <Textarea defaultValue="Sit-down dinner, speeches, and the group photo." readOnly />
              </div>
              <div className="space-y-1">
                <Label>Date *</Label>
                <Input defaultValue="2027-07-10" readOnly />
              </div>
              <div className="space-y-1">
                <Label>Time</Label>
                <Input defaultValue="18:00" readOnly />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Approximate Length</Label>
                <Input defaultValue="3 hours" readOnly />
              </div>
            </div>
          </Screen>
          <p>
            Leave the time blank if you genuinely don&apos;t know — the agenda says &quot;Time to
            be confirmed&quot; rather than inventing one.
          </p>
        </Step>

        <Step n={2} title="Say where">
          <p>
            A location name and an address. The address is looked up and pinned on the reunion&apos;s
            travel map, so it is worth entering properly rather than as &quot;the usual place&quot;.
          </p>
        </Step>

        <Step n={3} title="Set the cost and the capacity">
          <p>
            <UI>Cost Per Person</UI> is what one head costs. It is multiplied by the number of
            people in each signup to work out what that household owes — so for a family of four
            at $25, that is $100.
          </p>
          <p>
            <UI>Max Capacity</UI> is optional. Leave it blank for unlimited. If you set it,
            HomeKin enforces it when people sign up, counting heads rather than households.
          </p>
          <Screen label="Add event — cost and capacity">
            <div className="grid max-w-lg gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Cost Per Person ($)</Label>
                <Input defaultValue="25.00" readOnly />
              </div>
              <div className="space-y-1">
                <Label>Max Capacity</Label>
                <Input placeholder="Leave blank for unlimited" readOnly />
              </div>
            </div>
          </Screen>
        </Step>

        <Step n={4} title="Choose how it's booked">
          <p>
            Three modes, and the choice changes whether HomeKin asks anyone for money at all. This
            is significant enough to have its own guide — see{' '}
            <strong>Choosing how an event is booked</strong>.
          </p>
        </Step>

        <Step n={5} title="Add payment deadlines, if you need them">
          <p>
            Optional. For a large event you can stage the payment — a deposit now, the balance
            later — and have HomeKin email reminders before each date. Covered in{' '}
            <strong>Payment deadlines and reminders</strong>.
          </p>
        </Step>
      </Steps>

      <GuideNote variant="warning" title="Changing the cost changes what people owe">
        <p>
          Editing <UI>Cost Per Person</UI> on an event people have already signed up for
          recalculates their balances. If someone has already paid the old amount they end up over
          or under. Say something in chat before you do it — a silently changed price is the
          fastest way to lose the family&apos;s trust in the numbers.
        </p>
      </GuideNote>

      <H2>What people see afterwards</H2>
      <P>
        The event appears on the Events list with its date, time, location, cost per head and
        spots remaining. A <Badge variant="destructive">Full</Badge> badge shows once capacity is
        reached, and anyone already signed up sees their own{' '}
        <Badge variant="secondary">Signed up</Badge> badge.
      </P>

      <H2>Editing and deleting</H2>
      <List>
        <li>
          Open the event and press <UI>Edit</UI> — the same form, pre-filled.
        </li>
        <li>
          <UI>Delete</UI> is on the event detail page and removes the event, its signups and its
          balances. There is no undo, so prefer editing where you can.
        </li>
      </List>
    </>
  )
}
