import { Badge } from '@/components/ui/badge'
import { GuideNote, H2, List, P, Screen, UI } from '@/components/guides'
import { Home, Users, GitBranch, BookOpen } from 'lucide-react'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'finding-your-way-around',
  title: 'Finding your way around',
  summary: 'What lives where — the top bar, the reunion switcher, and your account menu.',
  section: 'getting-started',
}

export default function Guide() {
  return (
    <>
      <P>
        Everything hangs off the bar across the top. It has two halves: what the family has, on
        the left, and who you are, on the right.
      </P>

      <Screen label="The top bar">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="text-xl font-bold text-primary">HomeKin</span>
            <span className="flex items-center gap-1 rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
              <Home className="h-4 w-4" /> Dashboard
            </span>
            <span className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4" /> Directory
            </span>
            <span className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground">
              <GitBranch className="h-4 w-4" /> Family Tree
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md p-2 text-muted-foreground">
              <BookOpen className="h-5 w-5" />
            </span>
            <span className="h-9 w-9 rounded-full bg-muted" />
          </div>
        </div>
      </Screen>

      <H2>The three fixed places</H2>
      <List>
        <li>
          <strong>Dashboard</strong> — where you land. A card for each reunion, with a red badge
          when there is chat or an announcement you haven&apos;t read.
        </li>
        <li>
          <strong>Directory</strong> — everyone in the family, searchable.
        </li>
        <li>
          <strong>Family Tree</strong> — how everyone connects, drawn from the relationships
          people have recorded.
        </li>
      </List>

      <H2>The reunion switcher</H2>
      <P>
        Once a reunion exists, a dropdown appears next to those three showing which one you are
        looking at. Everything to the right of it — Events, Signups, Chat, Photos, Map, Surveys —
        belongs to <em>that</em> reunion. Switch reunions and those links follow you across.
      </P>
      <P>
        If you are on the committee you also see Invitations, Budget and Manage in that row.
        Members don&apos;t, which is the quickest way to tell what your role is.
      </P>

      <H2>The top right</H2>
      <List>
        <li>
          The <UI>book icon</UI> opens these guides. It is on every screen.
        </li>
        <li>
          Your <UI>photo</UI> opens your account menu: Edit Profile, Admin if you are an admin,
          and Sign Out.
        </li>
      </List>

      <GuideNote title="On a phone">
        <p>
          The nav collapses behind the ☰ button next to your photo. Everything is still there —
          the same links, in the same order, in a panel that drops down.
        </p>
      </GuideNote>

      <H2>Badges you will see</H2>
      <P>
        Two show up throughout. <Badge variant="outline">Not joined</Badge> on a person means
        somebody added their details but they have never signed in — their profile is waiting to
        be claimed. A red number on a reunion means unread chat messages or announcements.
      </P>
    </>
  )
}
