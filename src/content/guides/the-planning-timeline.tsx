import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GuideNote, H2, P, Screen, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'the-planning-timeline',
  title: 'The planning timeline',
  summary: 'A shared checklist of what needs doing, counted back from the reunion date.',
  section: 'planning',
}

export default function Guide() {
  return (
    <>
      <P>
        Once the reunion has a start date, HomeKin builds a checklist of the things families
        usually need to do, grouped by how far out they are. It is a shared list —{' '}
        <strong>any member can tick an item off</strong>, not just the committee, because plenty
        of the work gets done by whoever offered.
      </P>

      <Screen label="Timeline">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Six months out</p>
            <p className="text-xs text-muted-foreground">3 of 5 done</p>
          </div>
          {[
            ['Confirm the venue booking', true],
            ['Get quotes from two caterers', true],
            ['Send save-the-dates', true],
            ['Decide on merchandise', false],
            ['Book the photographer', false],
          ].map(([label, done]) => (
            <label key={label as string} className="flex items-center gap-3 rounded-md border px-3 py-2">
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border ${
                  done ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
                }`}
              >
                {done ? '✓' : ''}
              </span>
              <span className={`text-sm ${done ? 'text-muted-foreground line-through' : ''}`}>{label}</span>
            </label>
          ))}
        </div>
      </Screen>

      <H2>If the page says to set a date</H2>
      <P>
        The whole list is counted backwards from the reunion&apos;s start date, so without one
        there is nothing to schedule. Set it on Manage Reunion, or settle it properly on the
        planning page, and the timeline fills in.
      </P>

      <H2>Adding your own items</H2>
      <P>
        Committee and admins get <UI>Add item</UI> — a title, a due date, and a category
        (logistics, venue, lodging, RSVP, vendor, merchandise, heritage, or final). Custom items
        sit alongside the generated ones and behave identically.
      </P>

      <H2>Regenerating</H2>
      <P>
        <UI>Regenerate</UI> rebuilds the generated steps from a few questions — is it multi-day,
        do you need lodging, is there merchandise, is there a family-history strand. Answer those
        and the list is rebuilt to match.
      </P>

      <GuideNote variant="warning" title="Regenerating replaces the generated items">
        <p>
          Anything HomeKin generated is discarded and rebuilt, including the ticks. Items{' '}
          <em>you</em> added are kept. There is a confirmation step before it happens, and it is
          worth reading — if the committee has been ticking things off for a month, regenerating
          loses that record.
        </p>
      </GuideNote>

      <H2>Printing it</H2>
      <P>
        The page prints cleanly, which is genuinely useful for a committee meeting where not
        everyone will have a laptop open. Use your browser&apos;s print command.{' '}
        <Badge variant="outline">Tip</Badge> the same trick works on the budget estimator.
      </P>
      <div className="mt-4">
        <Button variant="outline" size="sm" disabled>
          Add item
        </Button>
      </div>
    </>
  )
}
