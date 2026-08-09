import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GuideNote, H2, List, P, Screen, Step, Steps, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'adding-a-member-profile',
  title: 'Adding someone to the directory',
  summary: 'Create a profile for a relative who has not signed up — or never will.',
  section: 'admin',
  role: 'admin',
}

export default function Guide() {
  return (
    <>
      <P>
        Not everyone in a family is going to make an account, and the directory should still know
        they exist. A profile created this way is a real directory entry — it can be signed up for
        events, linked into the family tree, and given a balance — it just has nobody logged into
        it yet.
      </P>
      <P>
        Find it on <UI>Manage Members</UI> under <UI>Add a Member Profile</UI>.
      </P>

      <Steps>
        <Step n={1} title="Fill in what you know">
          <p>
            Name and email are required; phone, family branch and date of birth are optional.
          </p>
          <Screen label="Add a member profile">
            <div className="grid max-w-lg gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Full Name *</Label>
                <Input defaultValue="Thomas Carter" readOnly />
              </div>
              <div className="space-y-1">
                <Label>Email *</Label>
                <Input defaultValue="thomas@example.com" readOnly />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input defaultValue="(555) 555-5555" readOnly />
              </div>
              <div className="space-y-1">
                <Label>Family Branch</Label>
                <Input defaultValue="Grandma Rose's side" readOnly />
              </div>
              <div className="sm:col-span-2">
                <Button>Create Profile</Button>
              </div>
            </div>
          </Screen>
        </Step>

        <Step n={2} title="Get the email right">
          <p>
            This is the field that matters most, and it is worth checking twice. When that person
            eventually signs up using <strong>the same address</strong>, they take over this
            profile — with its relationships, history and any balances intact. A typo means they
            get a blank second profile instead, and somebody has to merge them later.
          </p>
        </Step>
      </Steps>

      <H2>What it looks like afterwards</H2>
      <P>
        The person appears in the directory with a <Badge variant="outline">Not joined</Badge>{' '}
        badge, and a mail icon shows on their row in Manage Members — one click emails them an
        invite code so they can claim it.
      </P>

      <GuideNote variant="tip" title="Adding more than a handful?">
        <p>
          Use the spreadsheet import instead. It takes the same information plus relationships in
          one file, previews everything before writing, and skips anybody already there. Typing
          forty relatives in one at a time is not the intended path.
        </p>
      </GuideNote>

      <H2>What they cannot do yet</H2>
      <List>
        <li>Sign in — there is no account until they use an invite code.</li>
        <li>Receive chat or announcements in the app, though they can be emailed.</li>
        <li>
          Edit their own details. Until they claim the profile, that is on you or the committee.
        </li>
      </List>
    </>
  )
}
