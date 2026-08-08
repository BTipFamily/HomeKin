import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GuideNote, H2, P, Screen, Step, Steps, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'surveys',
  title: 'Surveys',
  summary: 'Ask the family a question the interest form did not cover.',
  section: 'keeping-in-touch',
}

export default function Guide() {
  return (
    <>
      <P>
        The interest form asks the big planning questions once. Surveys are for everything after
        that — t-shirt sizes, which Saturday activity people would prefer, what went well last
        time. Anyone can answer; committee members and admins build them.
      </P>

      <H2>Answering one</H2>
      <Steps>
        <Step n={1} title="Open it from the Surveys list">
          <p>
            Each survey shows how many questions it has and whether you have already answered —{' '}
            <Badge variant="secondary">Responded</Badge> if you have. The button reads{' '}
            <UI>Respond</UI>, <UI>View</UI> or <UI>Results</UI> depending on where you stand.
          </p>
        </Step>
        <Step n={2} title="Answer and submit">
          <p>
            Questions are either free text or multiple choice. Submitting again{' '}
            <strong>replaces</strong> your previous answers rather than adding a second response,
            so it is safe to change your mind.
          </p>
        </Step>
      </Steps>

      <H2>Building one</H2>
      <P>
        <UI>New Survey</UI> on the surveys page — committee and admins only. Give the survey a
        title, then add questions one at a time, choosing free text or multiple choice. Multiple
        choice questions take as many options as you need.
      </P>
      <Screen label="New survey">
        <div className="max-w-lg space-y-3">
          <div className="space-y-1">
            <Label>Survey title</Label>
            <Input defaultValue="Saturday afternoon — what would you rather do?" readOnly />
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Question 1 · Multiple choice</p>
            <p className="mt-1 text-sm">Which would you prefer?</p>
            <div className="mt-2 space-y-1">
              {['Lake trip', 'Museum and lunch', 'Stay at the hall', 'No preference'].map((o) => (
                <div key={o} className="rounded border px-2 py-1 text-xs text-muted-foreground">
                  {o}
                </div>
              ))}
            </div>
          </div>
          <Button variant="outline" size="sm">Add a question</Button>
        </div>
      </Screen>

      <GuideNote variant="tip" title="Answers are not anonymous">
        <p>
          Committee members and admins see every response <em>with the name of who gave it</em>.
          That is usually what a family wants — you need to know whose t-shirt is which size — but
          it makes surveys the wrong tool for anything people would only say anonymously. Say up
          front that names are attached.
        </p>
      </GuideNote>

      <H2>Seeing the results</H2>
      <P>
        Committee members and admins see all responses and a running count on the survey page.
        Ordinary members see their own answers only.
      </P>

      <H2>Nobody is emailed</H2>
      <P>
        Creating a survey does not notify anyone. If you want responses, post an announcement
        pointing at it — otherwise it waits quietly for people who happen to look.
      </P>
    </>
  )
}
