import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { GuideNote, H2, P, Screen, Step, Steps, UI } from '@/components/guides'
import { Search, Cake } from 'lucide-react'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'browsing-the-directory',
  title: 'Browsing and searching the directory',
  summary: 'Find anyone in the family, and understand what you can and cannot see about them.',
  section: 'directory',
}

export default function Guide() {
  return (
    <>
      <P>
        The directory is every person the family has recorded — including the ones who have never
        signed in. It is the backbone of everything else: signups, the family tree and the map all
        draw from it.
      </P>

      <Steps>
        <Step n={1} title="Search by name">
          <p>
            Type any part of a name into the search box and press <UI>Filter</UI>. It matches
            anywhere in the name, so &quot;ann&quot; finds both Ann and Susannah.
          </p>
          <Screen label="Directory">
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input defaultValue="carter" className="pl-9" readOnly />
                </div>
                <Button variant="outline">Filter</Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['Rose Carter', "Grandma Rose's side", 'admin'],
                  ['Michael Carter', "Grandma Rose's side", null],
                ].map(([name, branch, role]) => (
                  <Card key={name as string}>
                    <CardContent className="flex flex-col items-center pt-6 text-center">
                      <Avatar className="mb-3 h-16 w-16">
                        <AvatarFallback>
                          {(name as string)
                            .split(' ')
                            .map((p) => p[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      <p className="font-semibold">{name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{branch}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Cake className="h-3 w-3" /> Jun 14
                      </p>
                      {role && (
                        <Badge className="mt-2 border-transparent bg-primary text-xs capitalize text-primary-foreground">
                          {role}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </Screen>
        </Step>

        <Step n={2} title="Narrow it to one branch of the family">
          <p>
            The dropdown beside the search box lists every family branch anyone has been given —
            &quot;Grandma Rose&apos;s side&quot; and so on. Pick one to see only those people.{' '}
            <UI>Clear</UI> puts everything back.
          </p>
        </Step>

        <Step n={3} title="Open somebody's profile">
          <p>
            Click any card. You get their bio, contact details, social links, and — if they have
            filled it in and chosen to share it — a note about dietary, health or mobility needs.
          </p>
        </Step>
      </Steps>

      <H2>Why you cannot always see a phone number</H2>
      <P>
        Each person&apos;s phone, address, email and date of birth carry their own visibility
        setting: visible to the whole family, visible to the committee only, or hidden. When a
        field is set beyond your reach it simply isn&apos;t there — the directory doesn&apos;t
        show you a blanked-out row, because that would still tell you something.
      </P>
      <P>
        This is applied when the information is fetched, not merely hidden on screen, so it holds
        wherever the data goes.
      </P>

      <GuideNote title="Setting your own visibility">
        <p>
          There is currently no control on the profile page for changing these settings yourself.
          They are set when a directory is loaded from a spreadsheet, using the{' '}
          <UI>visibility_*</UI> columns, and otherwise take the default. If you want yours
          changed, ask an admin.
        </p>
      </GuideNote>

      <H2>Birthdays</H2>
      <P>
        Cards show the month and day only. The year lives on the full profile, so the directory is
        useful for spotting a birthday coming up without publishing everyone&apos;s age.
      </P>
    </>
  )
}
