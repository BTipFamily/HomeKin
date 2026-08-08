import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { GuideNote, H2, P, Screen, Step, Steps, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'creating-a-reunion',
  title: 'Creating a reunion',
  summary: 'Start a reunion before you know when or where it is.',
  section: 'planning',
  role: 'committee',
}

export default function Guide() {
  return (
    <>
      <P>
        HomeKin deliberately lets you create a reunion with <strong>no dates at all</strong>. That
        is the whole idea: you ask the family whether they would come and when they could travel,
        and the date comes out of their answers rather than being announced at them.
      </P>
      <P>
        Start from <UI>New Reunion</UI> on the dashboard or in the reunion switcher.
      </P>

      <Steps>
        <Step n={1} title="The basics">
          <p>
            A name, an optional description, a host city, and a year. Only the name and year are
            required, and the year defaults to next year.
          </p>
          <Screen label="New reunion — basics">
            <div className="max-w-lg space-y-3">
              <div className="space-y-1">
                <Label>Reunion Name *</Label>
                <Input defaultValue="Carter Family Reunion" readOnly />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea defaultValue="Our first one since 2019." readOnly />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Host City</Label>
                  <Input defaultValue="Atlanta, GA" readOnly />
                </div>
                <div className="space-y-1">
                  <Label>Year *</Label>
                  <Input defaultValue="2027" readOnly />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The exact dates come later, once the family has said when they can travel.
              </p>
              <Button>Create and gather interest</Button>
            </div>
          </Screen>
          <p>
            Host city is worth filling in even as a guess — it sets the cost-of-living baseline the
            budget estimator uses, and it centres the travel map.
          </p>
        </Step>

        <Step n={2} title="Review and create">
          <p>
            Confirm what you typed and press the button. You land straight on the interest page,
            because that is the next thing that needs to happen.
          </p>
        </Step>
      </Steps>

      <GuideNote variant="tip" title="Tell the family nothing is booked">
        <p>
          The most common worry when a reunion appears is that a decision has already been made
          without them. It hasn&apos;t — at this point the reunion has no dates and no events. Say
          so when you point people at the interest form; it is the difference between a good
          response rate and a suspicious one.
        </p>
      </GuideNote>

      <H2>What happens next</H2>
      <P>
        The reunion opens in its <em>gathering interest</em> stage. Point the family at the
        interest page, wait for answers, then use the planning page to pick the window that suits
        the most households and settle on a place. Events, signups and money all come after that.
      </P>
    </>
  )
}
