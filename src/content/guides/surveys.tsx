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
            Questions are either free text or multiple choice. Anything marked with a{' '}
            <span className="text-destructive">*</span> has to be answered; everything else can be
            left blank, and skipping it will not stop you submitting.
          </p>
          <p>
            Some questions only appear once they apply — a &quot;which other location?&quot;
            follow-up shows up when, and only when, you pick <UI>Other Location</UI> above it. If
            you change that answer afterwards, the follow-up disappears again and what you typed
            in it is discarded rather than quietly submitted.
          </p>
          <p>
            Submitting again <strong>replaces</strong> your previous answers rather than adding a
            second response, so it is safe to change your mind.
          </p>
        </Step>
      </Steps>

      <H2>Building one</H2>
      <P>
        <UI>New Survey</UI> on the surveys page — committee and admins only. Give the survey a
        title, then add questions one at a time, choosing free text or multiple choice. Multiple
        choice questions take as many options as you need.
      </P>
      <P>
        Each question has two further settings. <UI>Must be answered</UI> makes it required —
        leave it off and people can skip the question, which is the right default for anything
        you are merely curious about. <UI>Only ask this if…</UI> hides the question until an
        earlier multiple-choice question is answered a particular way, which is how you pair
        &quot;Other Location&quot; with a box asking where.
      </P>
      <GuideNote variant="tip" title="Ask for the follow-up, not from everybody">
        <p>
          A required free-text box that everyone must fill in is the fastest way to get a survey
          full of &quot;n/a&quot;. Make the follow-up conditional instead: then it is only
          required of the people it is actually for, and everyone else never sees it.
        </p>
      </GuideNote>
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

      <H2>Removing one</H2>
      <P>
        Committee members and admins can remove a survey — the bin icon beside it on the surveys
        list, or <UI>Remove</UI> at the top of the survey&apos;s own page. Both ask first, and the
        question tells you how many people have already answered, because those answers go with
        it. There is no undo and no archive: a removed survey and its responses are gone.
      </P>
      <GuideNote variant="warning" title="A survey people have answered is a record">
        <p>
          Removing one that has responses destroys what those people said, not just the questions.
          If the survey has served its purpose but the answers still matter, read the results
          first and write down what you need — or simply leave it in place. An old survey sitting
          on the list costs nothing.
        </p>
      </GuideNote>

      <H2>Nobody is emailed</H2>
      <P>
        Creating a survey does not notify anyone. If you want responses, post an announcement
        pointing at it — otherwise it waits quietly for people who happen to look.
      </P>
    </>
  )
}
