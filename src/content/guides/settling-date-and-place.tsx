import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GuideNote, H2, P, Screen, Step, Steps, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'settling-date-and-place',
  title: 'Settling the date and place',
  summary: "Turn the family's answers into a decision — and see who each option leaves out.",
  section: 'planning',
  role: 'committee',
}

export default function Guide() {
  return (
    <>
      <P>
        The planning page reads every date window the family submitted and works out which
        stretches the most households can cover <strong>in full</strong>. Partial overlap
        doesn&apos;t count — a household that can only make four days of a five-day reunion is
        counted as unable to come, because that is the truth.
      </P>
      <P>
        Members are sent to the interest form instead; this page is committee and admin only.
      </P>

      <Steps>
        <Step n={1} title="Look at the top date windows">
          <p>
            Each candidate window shows how many households and how many people it works for, and
            — the part worth reading slowly — a <UI>Cannot make it</UI> list naming who it
            excludes.
          </p>
          <Screen label="Planning — top preferred dates">
            <div className="space-y-2">
              {[
                ['9–13 July 2027', '14 households · 46 people', 'Cannot make it: the Hills, Tom Carter'],
                ['16–20 July 2027', '12 households · 39 people', 'Cannot make it: the Hills, Ana Ruiz, Jo Smith'],
              ].map(([when, who, missing], i) => (
                <div
                  key={when}
                  className={`rounded-lg border p-3 ${i === 0 ? 'border-primary bg-primary/5' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{when}</p>
                    <Badge variant={i === 0 ? undefined : 'outline'} className={i === 0 ? 'border-transparent bg-primary text-primary-foreground' : ''}>
                      {i === 0 ? 'Best fit' : `#${i + 1}`}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{who}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{missing}</p>
                </div>
              ))}
            </div>
          </Screen>
          <p>Clicking a window loads its dates into the decision form at the bottom.</p>
        </Step>

        <Step n={2} title="Shortlist the places">
          <p>
            Under the dates, every place the family suggested is ranked by how often it came up.
            Press <UI>Shortlist</UI> on the ones worth considering, or type a place of your own
            into the box. Shortlisted places appear in their own list with an <UI>×</UI> to remove.
          </p>
        </Step>

        <Step n={3} title="Settle it">
          <p>
            The form at the bottom takes a start date, an end date and one of the shortlisted
            places. Saving records the dates, recalculates the reunion&apos;s year from them, puts
            the location on the map, and moves the reunion from gathering interest into planning.
          </p>
          <Screen label="Planning — settle the date and place">
            <div className="flex max-w-lg flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start date</Label>
                <Input defaultValue="2027-07-09" className="h-9" readOnly />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End date</Label>
                <Input defaultValue="2027-07-13" className="h-9" readOnly />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Place</Label>
                <Input defaultValue="Atlanta, GA" className="h-9" readOnly />
              </div>
              <Button>Settle it</Button>
            </div>
          </Screen>
        </Step>
      </Steps>

      <GuideNote title="Vote counts are shown, but nobody can vote yet">
        <p>
          Shortlisted places display a vote count, and the machinery behind it works — but no page
          currently gives family members a way to cast one. Treat the shortlist as the
          committee&apos;s own working list, and gather opinions in chat or an announcement
          instead.
        </p>
      </GuideNote>

      <H2>Changing your mind later</H2>
      <P>
        Nothing here is one-way. Run it again with different dates and it simply saves the new
        ones. The dates can also be edited directly on the Manage Reunion page — worth knowing,
        because the start date is what the planning timeline counts backwards from.
      </P>
    </>
  )
}
