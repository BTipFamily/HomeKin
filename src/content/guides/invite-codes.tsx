import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GuideNote, H2, List, P, Screen, Step, Steps, UI } from '@/components/guides'
import { Mail } from 'lucide-react'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'invite-codes',
  title: 'Invite codes, and inviting someone by email',
  summary: 'The only way into HomeKin — issued one person at a time.',
  section: 'admin',
  role: 'admin',
}

export default function Guide() {
  return (
    <>
      <P>
        Nobody can create an account without a code. Codes are single-use, expire after a set
        number of days, and are issued by admins — which is what keeps the family&apos;s directory
        to the family.
      </P>

      <H2>The quick way: invite from their row</H2>
      <P>
        If the person already has a profile in the directory, go to <UI>Manage Members</UI> and
        press the mail icon on their row. That creates a fresh code, emails them the signup link,
        and tells you where it went — no retyping their address.
      </P>
      <Screen label="Manage Members — invite from a row">
        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
          <div>
            <p className="text-sm font-medium">Thomas Carter</p>
            <p className="text-xs text-muted-foreground">thomas@example.com</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">Not joined</Badge>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
              <Mail className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Screen>
      <P>
        The icon only appears for people who have not joined yet. Someone with an account already
        has a way in, so a code would be no use to them.
      </P>

      <H2>The general way: the Invite Codes page</H2>
      <Steps>
        <Step n={1} title="Generate a code">
          <p>
            On <UI>Invite Codes</UI>, optionally give an email address and a number of days before
            it expires (30 by default, anywhere from 1 to 365). Press <UI>Generate Code</UI>.
          </p>
          <Screen label="Generate new invite code">
            <div className="flex max-w-lg flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Email it to (optional)</Label>
                <Input defaultValue="thomas@example.com" className="h-9" readOnly />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expires in (days)</Label>
                <Input defaultValue="30" className="h-9 w-24" readOnly />
              </div>
              <Button>Generate Code</Button>
            </div>
          </Screen>
        </Step>
        <Step n={2} title="Send it, or copy it">
          <p>
            Give an address and HomeKin emails the signup link straight there. Leave it blank and
            you just get the code and link to pass on however you like — text, WhatsApp, or read
            aloud over the phone, which the alphabet was designed for.
          </p>
        </Step>
      </Steps>

      <GuideNote variant="tip" title="A failed email still gives you a working code">
        <p>
          If the email cannot be sent, the code is still created and shown to you with a copy
          button. You are told plainly that delivery failed rather than being left assuming it
          arrived — so you can send the link another way instead of wondering why nobody signed up.
        </p>
      </GuideNote>

      <H2>Reading the list</H2>
      <P>The last 50 codes are listed with their state:</P>
      <List>
        <li>
          <Badge className="border-transparent bg-success/10 text-success-foreground">Active</Badge>{' '}
          — issued, unused, not yet expired.
        </li>
        <li>
          <Badge variant="secondary">Used</Badge> — somebody has signed up with it. It cannot be
          used again.
        </li>
        <li>
          <Badge variant="destructive">Expired</Badge> — nobody used it in time. Generate a new one.
        </li>
      </List>
      <P>
        The <UI>Emailed To</UI> column shows where each went, with a{' '}
        <Badge variant="outline">Not delivered</Badge> flag if the email failed. That flag is the
        one to watch — it is the difference between &quot;they are ignoring us&quot; and &quot;they
        never got it&quot;.
      </P>

      <H2>If someone says their code does not work</H2>
      <List>
        <li>Check the list — it may show as already used, meaning somebody has claimed it.</li>
        <li>Check the expiry date.</li>
        <li>
          Codes never contain O, I, L, zero or one. If they are reading a handwritten note, that is
          usually the confusion.
        </li>
        <li>When in doubt, issue a fresh one. There is no cost to it.</li>
      </List>
    </>
  )
}
