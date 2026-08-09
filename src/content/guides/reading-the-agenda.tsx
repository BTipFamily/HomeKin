import { Badge } from '@/components/ui/badge'
import { GuideNote, H2, P, Screen, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'reading-the-agenda',
  title: 'Reading the agenda',
  summary: 'The whole reunion as a day-by-day schedule, with your own events marked.',
  section: 'events',
}

export default function Guide() {
  return (
    <>
      <P>
        The Events page is a list you act on. The agenda is the same events arranged as a
        schedule — what is happening on each day, in order. It is read-only, and it is the page to
        print or send to someone who just wants to know the plan.
      </P>

      <Screen label="Agenda">
        <div className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between border-b pb-1">
              <p className="font-semibold">Saturday 10 July</p>
              <p className="text-xs text-muted-foreground">46 people</p>
            </div>
            <div className="mt-2 space-y-2">
              <div className="rounded-lg border border-primary bg-primary/5 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">10:00 — Cemetery visit</p>
                  <Badge className="border-transparent bg-primary text-xs text-primary-foreground">
                    You&apos;re going
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Oakland Cemetery · 22 going · free
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">18:00 — Saturday Banquet</p>
                  <Badge variant="outline" className="text-xs">Group rate</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Peachtree Hall · 41 going of 60 · $27 each before group rate
                </p>
              </div>
            </div>
          </div>
        </div>
      </Screen>

      <H2>What each line tells you</H2>
      <P>
        The time — or <UI>Time to be confirmed</UI> when the committee hasn&apos;t fixed one — then
        the location, how many are going against the capacity, and the cost per head. Events you
        have signed up for are highlighted and marked <UI>You&apos;re going</UI>, so you can find
        your own reunion inside the family&apos;s.
      </P>

      <H2>The badges</H2>
      <P>
        <Badge variant="outline">Book with vendor</Badge> means you book and pay elsewhere — the
        committee is only counting heads.{' '}
        <Badge variant="outline">Group rate</Badge> means the price moves with the number of people
        going, so what you see is provisional until numbers settle.
      </P>

      <GuideNote title="Attendee names are committee-only">
        <p>
          Everyone sees the headcounts. Only committee members and admins see the list of who
          those people are — the agenda is a schedule for the family, not a register.
        </p>
      </GuideNote>
    </>
  )
}
