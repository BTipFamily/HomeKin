import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { GuideNote, P, Screen, Step, Steps, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'joining-with-an-invite-code',
  title: 'Joining with an invite code',
  summary: 'Turn the code someone sent you into an account of your own.',
  section: 'getting-started',
}

export default function Guide() {
  return (
    <>
      <P>
        HomeKin is invite only — nobody can wander in off the internet. Somebody in the family
        sends you an eight-character code, either as a link or on its own, and that code is what
        lets you make an account. It works once, and it usually expires after 30 days.
      </P>

      <Steps>
        <Step n={1} title="Open the link, or go to the sign-up page">
          <p>
            If you were emailed a link it looks like <UI>homekin.app/signup?code=ABCD2345</UI>.
            Opening it fills the code in for you and checks it straight away, so you can skip to
            step 3. Otherwise go to the sign-up page and type the code yourself.
          </p>
        </Step>

        <Step n={2} title="Type the code and press Check">
          <p>
            The code is eight characters and case doesn&apos;t matter — it is capitalised as you
            type. It never contains the letters O, I or L, or the digits 0 and 1, because those
            are the ones people misread. If you think you see an O it is a zero&apos;s absence,
            not a zero.
          </p>
          <Screen label="Sign up — checking your code">
            <div className="max-w-sm space-y-2">
              <Label>Invite code</Label>
              <div className="flex gap-2">
                <Input defaultValue="ABCD2345" className="font-mono tracking-widest" readOnly />
                <Button variant="outline">Check</Button>
              </div>
              <p className="text-xs text-success">✓ That code is valid — carry on below.</p>
            </div>
          </Screen>
          <p>
            If it fails, the message tells you which of the three things went wrong: the code
            isn&apos;t recognised, it has already been used by somebody else, or it has expired.
            All three are fixed the same way — ask whoever invited you for a fresh one.
          </p>
        </Step>

        <Step n={3} title="Fill in the rest of the form">
          <p>
            The remaining fields only appear once the code checks out. Name and email are
            required; phone and family branch are optional and you can add them later. Your
            password needs at least eight characters, and the eye icon shows what you have typed
            if you want to check it.
          </p>
          <Screen label="Sign up — your details">
            <div className="max-w-sm space-y-3">
              <div className="space-y-1">
                <Label>Full name</Label>
                <Input defaultValue="Jane Smith" readOnly />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input defaultValue="jane@example.com" readOnly />
              </div>
              <div className="space-y-1">
                <Label>Password</Label>
                <Input defaultValue="••••••••" readOnly />
              </div>
              <Button className="w-full">Create my account</Button>
            </div>
          </Screen>
        </Step>

        <Step n={4} title="Confirm your email address">
          <p>
            You will usually be sent a confirmation email — the screen says &quot;Almost
            there!&quot; and waits. Click the link in that email and you are in. If it
            hasn&apos;t arrived after a minute or two, check the spam folder first, then use
            <UI>Resend the email</UI> on that same screen.
          </p>
        </Step>
      </Steps>

      <GuideNote variant="tip" title="Your profile may already exist">
        <p>
          If somebody has already added you to the directory — which is common, because families
          often get typed in from a spreadsheet first — signing up with{' '}
          <strong>the same email address they used</strong> claims that existing profile rather
          than making a second one. Your history, and anything already recorded about you, comes
          with it. Use the address the family knows you by.
        </p>
      </GuideNote>

      <P>
        Once you are in you will land on the dashboard, and your row in the directory changes
        from <Badge variant="outline">Not joined</Badge> to{' '}
        <Badge variant="secondary">Active</Badge>.
      </P>
    </>
  )
}
