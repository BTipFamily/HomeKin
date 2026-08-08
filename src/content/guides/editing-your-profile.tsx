import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { GuideNote, H2, List, P, Screen, Step, Steps, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'editing-your-profile',
  title: 'Editing your profile and photo',
  summary: 'Keep your own details right — including the photo everyone sees.',
  section: 'directory',
}

export default function Guide() {
  return (
    <>
      <P>
        Your profile is what the rest of the family sees, and what the map and the family tree are
        built from. Get to it from your photo in the top right → <UI>Edit Profile</UI>.
      </P>

      <Steps>
        <Step n={1} title="Change your photo">
          <p>
            Press <UI>Change Photo</UI> at the top and pick an image. It must be an image file and
            under 5MB. It replaces immediately once uploaded — there is no separate save for the
            photo.
          </p>
          <Screen label="Edit profile — photo">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="text-xl">JS</AvatarFallback>
              </Avatar>
              <Button variant="outline">Change Photo</Button>
            </div>
          </Screen>
          <p>
            If you never set one you get your initials on a coloured circle, which is perfectly
            fine and is what most of the directory looks like.
          </p>
        </Step>

        <Step n={2} title="Fill in the details">
          <p>
            Only <UI>Full Name</UI> is required. The rest — family branch, date of birth, phone,
            address, bio — are all optional and can be added whenever.
          </p>
          <Screen label="Edit profile — details">
            <div className="grid max-w-lg gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Full Name *</Label>
                <Input defaultValue="Jane Smith" readOnly />
              </div>
              <div className="space-y-1">
                <Label>Family Branch</Label>
                <Input defaultValue="Grandma Rose's side" readOnly />
              </div>
              <div className="space-y-1">
                <Label>Date of Birth</Label>
                <Input defaultValue="1975-06-14" readOnly />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input defaultValue="(555) 555-5555" readOnly />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Bio</Label>
                <Textarea defaultValue="Lives in Atlanta. Two kids. Makes the potato salad." readOnly />
              </div>
            </div>
          </Screen>
        </Step>

        <Step n={3} title="Say whether you'd help out">
          <p>
            Tick <UI>I&apos;m generally willing to help out</UI> and then any of the nine areas —
            setup and cleanup, food, the registration table, games, youth, elder support,
            photography, family history, transportation. This is a standing offer, not a
            commitment to a particular reunion, and it is what the committee looks at when they
            need hands.
          </p>
        </Step>

        <Step n={4} title="Save">
          <p>
            Press <UI>Save Changes</UI>. Nothing is stored until you do — except the photo, which
            saves as soon as it uploads.
          </p>
        </Step>
      </Steps>

      <H2>Family branch is just a label</H2>
      <P>
        It is free text — whatever the family calls that side. Its only job is to power the branch
        filter in the directory, so what matters is that people who belong together spell it the
        same way.
      </P>

      <GuideNote title="Your address does two jobs">
        <p>
          If you enter an address it is looked up and turned into a point on the travel map, so
          the committee can see roughly where the family is spread. Whether anybody else can read
          the address itself is a separate matter, governed by your visibility settings.
        </p>
      </GuideNote>

      <H2>Who else can edit you</H2>
      <List>
        <li>You can always edit your own profile.</li>
        <li>
          Committee members and admins can edit anyone&apos;s — necessary for keeping the
          directory tidy, and for filling in details on behalf of relatives who aren&apos;t online.
        </li>
        <li>No one else can. Opening someone else&apos;s edit page just returns you to it.</li>
      </List>
    </>
  )
}
