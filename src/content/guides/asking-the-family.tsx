import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GuideNote, H2, List, P, Screen, Step, Steps, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'asking-the-family',
  title: "Saying whether you'd come, and reading the answers",
  summary: 'The interest form: what each question is for, and what the committee does with it.',
  section: 'planning',
}

export default function Guide() {
  return (
    <>
      <P>
        Before anything is booked, the family is asked a single question in several parts: would
        you come, when could you travel, and what would make it work for you. Every member fills
        this in; the committee reads the totals.
      </P>
      <P>
        Find it on the reunion page under <UI>Interest</UI>.
      </P>

      <GuideNote variant="tip" title="Nothing is booked yet">
        <p>
          Answering is not a commitment. No dates exist at this point, no events, no money. You
          are telling the committee what would be possible for your household, and you can come
          back and change every answer later — re-submitting replaces what you said before.
        </p>
      </GuideNote>

      <Steps>
        <Step n={1} title="Would you come?">
          <p>
            Four answers: <UI>Yes</UI>, <UI>Probably</UI>, <UI>Not sure</UI>, <UI>No</UI>. If you
            pick No the rest of the form disappears — there is no point asking someone who
            isn&apos;t coming which months suit them.
          </p>
          <Screen label="Interest — would you come?">
            <div className="flex flex-wrap gap-2">
              <Badge className="border-transparent bg-primary px-4 py-1.5 text-primary-foreground">Yes</Badge>
              <Badge variant="outline" className="px-4 py-1.5">Probably</Badge>
              <Badge variant="outline" className="px-4 py-1.5">Not sure</Badge>
              <Badge variant="outline" className="px-4 py-1.5">No</Badge>
            </div>
          </Screen>
        </Step>

        <Step n={2} title="How many are you bringing?">
          <p>
            Adults, teens and children, counted separately because they cost different amounts to
            feed and house. Include yourself in the adults.
          </p>
        </Step>

        <Step n={3} title="When could you travel?">
          <p>
            Two levels of detail. The month pills are the broad brush — tap every month that could
            work. Then, if you can be more precise, add exact date windows with{' '}
            <UI>Add a window</UI>: a from and a to, as many as you like.
          </p>
          <Screen label="Interest — dates">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(
                  (m, i) => (
                    <Badge
                      key={m}
                      variant={[5, 6, 7].includes(i) ? undefined : 'outline'}
                      className={[5, 6, 7].includes(i) ? 'border-transparent bg-primary text-primary-foreground' : ''}
                    >
                      {m}
                    </Badge>
                  )
                )}
              </div>
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input defaultValue="2027-07-09" className="h-9" readOnly />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input defaultValue="2027-07-18" className="h-9" readOnly />
                </div>
                <Button variant="outline" size="sm">Add a window</Button>
              </div>
            </div>
          </Screen>
          <p>
            The exact windows are the ones that do the real work. The committee&apos;s tool looks
            for the stretch of days the most households can cover <em>in full</em>, so a precise
            answer from you genuinely changes the result.
          </p>
        </Step>

        <Step n={4} title="Where, and what would suit you">
          <p>
            Suggest places with <UI>Suggest a place</UI> — as many as you like. Then a handful of
            practical questions: what you could comfortably spend, how long you would want it to
            run, whether you need lodging found for you, and how you would rather eat (catered,
            potluck, cookout, restaurant, or a mix).
          </p>
        </Step>

        <Step n={5} title="Offer to help, and say anything else">
          <p>
            Tick <UI>I&apos;d be willing to help out</UI> and pick areas, note any interest in
            family history, and use the free-text box for anything the form didn&apos;t ask.
            People read it.
          </p>
        </Step>
      </Steps>

      <H2>What the committee sees</H2>
      <P>
        Committee members and admins get an extra panel on the same page,{' '}
        <UI>What the family has said</UI>: expected headcount, the split across yes / probably /
        not sure / no, what people said about budget, how many need lodging, preferred length, and
        who volunteered.
      </P>
      <P>
        Ordinary members see only their own answers — not because the page hides other people&apos;s,
        but because the data is never sent.
      </P>

      <H2>Then what</H2>
      <List>
        <li>The committee opens the planning page, which ranks date windows by how many households they suit.</li>
        <li>Suggested places are shortlisted there.</li>
        <li>A date and place get settled, and only then do events and money appear.</li>
      </List>
    </>
  )
}
