import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { GuideNote, H2, List, P, Screen, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'sharing-support-needs',
  title: 'Dietary, health and mobility notes',
  summary: 'Tell the people catering and booking what you need — and control who reads it.',
  section: 'directory',
}

export default function Guide() {
  return (
    <>
      <P>
        Three free-text boxes at the bottom of your profile edit page cover the things that change
        what the committee has to book: what you can eat, anything medical worth knowing, and how
        far you can comfortably walk.
      </P>

      <Screen label="Edit profile — dietary, health and mobility">
        <div className="max-w-lg space-y-3">
          <div className="space-y-1">
            <Label>Dietary needs</Label>
            <Textarea defaultValue="Coeliac — needs genuinely gluten-free, not just 'no bread'." readOnly />
          </div>
          <div className="space-y-1">
            <Label>Health considerations</Label>
            <Textarea placeholder="Anything worth the committee knowing" readOnly />
          </div>
          <div className="space-y-1">
            <Label>Mobility</Label>
            <Textarea defaultValue="Fine on the flat, but stairs are slow. Ground floor if possible." readOnly />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="h-4 w-4 rounded border border-input" />
            Share this with the whole family
          </label>
        </div>
      </Screen>

      <H2>Who reads it</H2>
      <P>
        By default, only the committee and admins — the people who actually book the caterer and
        the venue. The checkbox at the bottom, <UI>Share this with the whole family</UI>, widens it
        to everyone, and it is <strong>off unless you turn it on</strong>.
      </P>
      <P>
        This is enforced when the information is read, not merely hidden on the page. A member
        looking at your profile does not receive the text at all.
      </P>

      <GuideNote variant="tip" title="Be specific rather than polite">
        <p>
          &quot;No dairy&quot; is easier to cater for than &quot;I try to avoid dairy&quot;, and
          &quot;stairs are slow, ground floor if possible&quot; is far more useful than
          &quot;limited mobility&quot;. The person reading this is trying to book a room, and
          they would rather have the detail than guess.
        </p>
      </GuideNote>

      <H2>Removing it</H2>
      <P>
        Clear all three boxes and save, and the record is deleted rather than kept as an empty
        shell. That matters: a committee reading the list can then tell the difference between
        &quot;has no needs&quot; and &quot;was never asked&quot;.
      </P>

      <H2>Someone else&apos;s needs</H2>
      <List>
        <li>You can always read and write your own.</li>
        <li>Committee and admins can read everyone&apos;s, and can fill them in on someone&apos;s behalf.</li>
        <li>
          Other members see only what has been explicitly shared with the whole family.
        </li>
      </List>
    </>
  )
}
