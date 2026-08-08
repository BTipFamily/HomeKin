import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GuideNote, P, Screen, Step, Steps, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'signing-in',
  title: 'Signing in, and what to do about a forgotten password',
  summary: 'Two ways in: your password, or a link emailed to you.',
  section: 'getting-started',
}

export default function Guide() {
  return (
    <>
      <P>
        There are two ways into HomeKin, and the second one exists precisely so that a forgotten
        password never locks you out of the family.
      </P>

      <Steps>
        <Step n={1} title="The ordinary way — email and password">
          <p>
            Type the email address you signed up with and your password. The eye icon at the end
            of the password box shows what you have typed, which is worth using before you decide
            the password is wrong.
          </p>
          <Screen label="Sign in to HomeKin">
            <div className="max-w-sm space-y-3">
              <div className="space-y-1">
                <Label>Email address</Label>
                <Input defaultValue="jane@example.com" readOnly />
              </div>
              <div className="space-y-1">
                <Label>Password</Label>
                <Input defaultValue="••••••••" readOnly />
              </div>
              <Button className="w-full">Sign in</Button>
              <p className="text-center text-sm text-primary">
                Forgot password? Use magic link instead
              </p>
            </div>
          </Screen>
        </Step>

        <Step n={2} title="The other way — a magic link">
          <p>
            Press <UI>Forgot password? Use magic link instead</UI> and give your email address.
            HomeKin emails you a link that signs you in when you click it — no password at all.
            The link lasts about an hour and works once.
          </p>
          <p>
            This is the answer to a forgotten password. There is no separate reset dance to go
            through: sign in with the link, and if you want a new password you can carry on
            using links instead.
          </p>
        </Step>
      </Steps>

      <GuideNote title="If it says you have no profile">
        <p>
          Occasionally you can sign in successfully and still be told there is no member profile
          for you. That means the account exists but it isn&apos;t attached to anybody in the
          directory — usually because it was created with a different email address from the one
          the family has on file. Sign out using the button on that screen and ask an admin to
          check which address your directory entry uses.
        </p>
      </GuideNote>
    </>
  )
}
