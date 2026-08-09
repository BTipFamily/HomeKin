import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GuideNote, H2, List, P, Screen, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'how-an-event-is-booked',
  title: 'Choosing how an event is booked',
  summary: 'The three booking modes, and which one means HomeKin asks people for money.',
  section: 'events',
  role: 'committee',
}

export default function Guide() {
  return (
    <>
      <P>
        Every event answers one question: <strong>who takes the money?</strong> The answer decides
        whether HomeKin creates a balance for each household or simply notes who is coming. Pick it
        on the event form under <UI>How is this booked?</UI>.
      </P>

      <H2>1. We collect the money</H2>
      <P>
        The default, and the right choice for anything the family is paying for as a group — the
        caterer, the hall, the coach. HomeKin bills each household for their headcount, tracks
        what they have paid, and chases what is outstanding.
      </P>
      <Screen label="Booking mode — we collect">
        <div className="max-w-md space-y-2">
          <label className="flex items-start gap-2 rounded-lg border border-primary bg-primary/5 p-3">
            <span className="mt-0.5 h-4 w-4 rounded-full border-4 border-primary" />
            <span>
              <span className="text-sm font-medium">We collect the money</span>
              <span className="block text-xs text-muted-foreground">
                Members are billed in HomeKin and can pay by card.
              </span>
            </span>
          </label>
        </div>
      </Screen>

      <H2>2. They book with the vendor</H2>
      <P>
        For the things people pay for themselves — hotel rooms, a theme-park ticket, a golf tee
        time. HomeKin records who is going so the committee can plan numbers, but{' '}
        <strong>creates no balance and asks for no money</strong>.
      </P>
      <P>Choosing this reveals three more fields:</P>
      <List>
        <li>
          <UI>Vendor name</UI> — who they are actually booking with.
        </li>
        <li>
          <UI>Booking link</UI> — sent straight to the member, so nobody has to hunt for it.
        </li>
        <li>
          <UI>Book by</UI> — the date the vendor&apos;s hold expires. This is the one people miss.
        </li>
      </List>
      <Screen label="Booking mode — they book with the vendor">
        <div className="max-w-md space-y-3">
          <label className="flex items-start gap-2 rounded-lg border border-primary bg-primary/5 p-3">
            <span className="mt-0.5 h-4 w-4 rounded-full border-4 border-primary" />
            <span>
              <span className="text-sm font-medium">They book with the vendor</span>
              <span className="block text-xs text-muted-foreground">
                HomeKin tracks who&apos;s going. No money changes hands here.
              </span>
            </span>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Vendor name</Label>
              <Input defaultValue="Peachtree Inn" className="h-9" readOnly />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Book by</Label>
              <Input defaultValue="2027-05-01" className="h-9" readOnly />
            </div>
          </div>
        </div>
      </Screen>

      <H2>3. Group booking with a discount</H2>
      <P>
        For anything that gets cheaper the more of you there are — a coach, a block of tickets, a
        group rate at a restaurant. You set a minimum group size and a ladder of price tiers, and{' '}
        <strong>everyone is re-priced automatically</strong> whenever somebody joins or drops out.
      </P>
      <Screen label="Booking mode — group rate">
        <div className="max-w-md space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Price tiers</p>
          {[
            ['10 or more', '$32 each'],
            ['25 or more', '$27 each'],
            ['40 or more', '$22 each'],
          ].map(([n, price]) => (
            <div key={n} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>{n}</span>
              <span className="font-medium">{price}</span>
            </div>
          ))}
          <p className="pt-1 text-xs text-muted-foreground">
            Currently 28 going — everyone is on the $27 tier.
          </p>
        </div>
      </Screen>

      <GuideNote variant="warning" title="Group prices move, in both directions">
        <p>
          If someone cancels and the headcount drops below a tier, everybody&apos;s price goes{' '}
          <em>up</em> — including people who already paid, who will then owe a little more. That
          is genuinely how group rates work, but it surprises people. Say so when you announce the
          event, and watch the headcount as the deadline approaches.
        </p>
      </GuideNote>

      <H2>Telling them apart afterwards</H2>
      <P>
        The agenda badges each event so nobody has to remember:{' '}
        <Badge variant="outline">Book with vendor</Badge> means it is on you to book and pay
        elsewhere, and <Badge variant="outline">Group rate</Badge> means the price shown is
        provisional until numbers settle. Events with no badge are billed by HomeKin in the
        ordinary way.
      </P>

      <H2>Changing mode later</H2>
      <P>
        You can, by editing the event — but think first if people have signed up. Switching{' '}
        <em>away from</em> &quot;we collect&quot; removes balances that may already have payments
        against them. Switching <em>to</em> it creates balances for people who never agreed to pay
        HomeKin anything.
      </P>
    </>
  )
}
