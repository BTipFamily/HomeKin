import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { GuideNote, H2, P, Screen } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'chat',
  title: 'Chat',
  summary: 'Talk to the whole reunion, or about one event, without starting a group text.',
  section: 'keeping-in-touch',
}

export default function Guide() {
  return (
    <>
      <P>
        Each reunion has a chat that everyone can read and post in. It exists so the planning
        conversation stays with the reunion instead of scattering across a group text nobody can
        search later.
      </P>

      <Screen label="Chat">
        <div className="space-y-3">
          <div className="space-y-2">
            {[
              ['Rose Carter', 'Has anyone heard back from the hall about parking?'],
              ['Michael Carter', "Yes — they've got 40 spaces, overflow is on the street."],
              ['Jane Smith', 'Perfect. I&apos;ll put that in the announcement.'],
            ].map(([who, msg]) => (
              <div key={who} className="flex gap-2">
                <span className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-muted" />
                <div>
                  <p className="text-xs font-medium">{who}</p>
                  <p className="text-sm text-muted-foreground">{msg}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t pt-3">
            <Input placeholder="Write a message…" readOnly />
            <Button size="sm">Send</Button>
          </div>
        </div>
      </Screen>

      <H2>Per-event channels</H2>
      <P>
        Opening chat from an event gives you a conversation about just that event. Handy for
        &quot;who is driving to the cemetery&quot; without it landing in front of the eighty people
        who aren&apos;t going.
      </P>

      <H2>Unread badges</H2>
      <P>
        Red numbers on the dashboard and the reunion tile count what you have not read. Opening the
        chat clears them. Messages refresh every few seconds while the tab is open, so you do not
        need to reload.
      </P>

      <H2>Who&apos;s around</H2>
      <P>
        A roster panel lists the family and shows who has been active recently. It is a rough
        signal — useful for knowing whether a question will get answered now or tomorrow.
      </P>

      <GuideNote title="Chat does not email anybody">
        <p>
          Messages appear in the app and raise an unread badge, and that is all. If something must
          reach the whole family — a date change, a deadline — post an announcement with the email
          option ticked instead. Chat is for conversation; announcements are for things people have
          to know.
        </p>
      </GuideNote>
    </>
  )
}
