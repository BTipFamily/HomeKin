import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { GuideNote, H2, List, P, Screen, Step, Steps, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'announcements',
  title: 'Posting an announcement',
  summary: 'Tell the whole family something — in the app, and optionally by email.',
  section: 'keeping-in-touch',
  role: 'committee',
}

export default function Guide() {
  return (
    <>
      <P>
        Announcements are for the things people must not miss: the date is settled, the deadline
        moved, the hall changed. They appear on the reunion home page, and they can email every
        member at once.
      </P>
      <P>Everyone reads them. Committee members and admins post them.</P>

      <Steps>
        <Step n={1} title="Write it">
          <p>
            A title and a body. Put the actual news in the title — &quot;Banquet moved to
            Sunday&quot; rather than &quot;Update&quot; — because the title is what appears in the
            email subject line and in the notification.
          </p>
          <Screen label="Post an announcement">
            <div className="max-w-lg space-y-3">
              <div className="space-y-1">
                <Label>Title</Label>
                <Input defaultValue="Banquet moved to Sunday evening" readOnly />
              </div>
              <div className="space-y-1">
                <Label>Announcement</Label>
                <Textarea
                  defaultValue="The hall had a double booking on Saturday. Same time, same place, one day later. Your signup carries over — nothing to redo."
                  readOnly
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <span className="h-4 w-4 rounded border border-input" /> Pin to top
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className="flex h-4 w-4 items-center justify-center rounded border border-primary bg-primary text-[10px] text-primary-foreground">
                  ✓
                </span>
                Email to all 63 members
              </label>
              <Button>Post announcement</Button>
            </div>
          </Screen>
        </Step>

        <Step n={2} title="Decide whether to pin it">
          <p>
            <UI>Pin to top</UI> holds it above everything else. Use it for the one thing that
            stays true for weeks — the date, the deadline — and unpin it once it is stale, or the
            pin stops meaning anything.
          </p>
        </Step>

        <Step n={3} title="Decide whether to email">
          <p>
            <UI>Email to all N members</UI> is <strong>ticked by default</strong>, and the count is
            shown so you know exactly how many people you are about to write to. Untick it for
            something that only matters to whoever happens to look.
          </p>
        </Step>
      </Steps>

      <GuideNote variant="warning" title="The email goes the moment you post">
        <p>
          There is no draft, no preview, no recall. Read it back before pressing the button — the
          number beside the checkbox is a real count of real inboxes. The announcement itself is
          saved first, so if the email fails you are told plainly rather than being left to guess
          whether it went.
        </p>
      </GuideNote>

      <H2>What members see</H2>
      <List>
        <li>Pinned announcements first, then newest.</li>
        <li>An unread count on the dashboard and the reunion tile.</li>
        <li>Opening the reunion page marks them read.</li>
      </List>

      <H2>Deleting</H2>
      <P>
        Committee members and admins get a delete icon on each post. Deleting removes it from the
        app — it cannot unsend an email that has already gone out.
      </P>

      <H2>A note on the daily limit</H2>
      <P>
        Family mail goes through a Gmail account capped at roughly 500 recipients a day. A big
        family, a couple of announcements and a round of invitations can reach it, at which point
        later emails simply do not send. Spread them out if you have a lot to say.
      </P>
    </>
  )
}
