import { Badge } from '@/components/ui/badge'
import { GuideNote, H2, List, P, Screen, UI } from '@/components/guides'
import { Home, Users, GitBranch, BookOpen, LayoutGrid, Calendar, MessageCircle, Camera, MoreHorizontal } from 'lucide-react'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'finding-your-way-around',
  title: 'Finding your way around',
  summary: 'What lives where — the top bar, a reunion’s own sections, and your account menu.',
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
        looking at. Pick another and you go straight to its Overview.
      </P>

      <H2>Inside a reunion</H2>
      <P>
        A reunion&apos;s own sections — Overview, Events, Signups &amp; Pay, Agenda, Chat, Photos,
        Map, Surveys, Interest — sit in a row of tabs just under the top bar. The tab you are on
        is highlighted, including on the pages inside it, so an event&apos;s own page still shows{' '}
        <UI>Events</UI>.
      </P>
      <P>
        Committee members also see their tools at the end of that row, after a divider:
        Planning, Timeline, Budget Estimator, Invitations, Payments, Report and Manage. Members
        see Timeline and Budget Estimator to read, but not the rest.
      </P>
      <P>
        The <UI>Overview</UI> page leads with whatever the reunion needs from you right now —
        telling the committee whether you can come, paying what is still due, or checking the
        schedule — with every section laid out underneath.
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
          Inside a reunion, the sections move to a bar along the bottom of the screen, where your
          thumb is: Overview, Events, Chat, Photos and More. <UI>More</UI> opens everything else,
          and a list of reunions to switch between.
        </p>
        <p>
          The ☰ button next to your photo holds Dashboard, Directory, Family Tree, the list of
          reunions, the guides and Sign Out.
        </p>
      </GuideNote>

      <Screen label="The bottom bar on a phone">
        <div className="mx-auto grid max-w-sm grid-cols-5 text-xs font-medium text-muted-foreground">
          <span className="flex flex-col items-center gap-1 text-primary">
            <LayoutGrid className="h-5 w-5" /> Overview
          </span>
          <span className="flex flex-col items-center gap-1">
            <Calendar className="h-5 w-5" /> Events
          </span>
          <span className="flex flex-col items-center gap-1">
            <MessageCircle className="h-5 w-5" /> Chat
          </span>
          <span className="flex flex-col items-center gap-1">
            <Camera className="h-5 w-5" /> Photos
          </span>
          <span className="flex flex-col items-center gap-1">
            <MoreHorizontal className="h-5 w-5" /> More
          </span>
        </div>
      </Screen>

      <H2>Badges you will see</H2>
      <P>
        Two show up throughout. <Badge variant="outline">Not joined</Badge> on a person means
        somebody added their details but they have never signed in — their profile is waiting to
        be claimed. A red number on a reunion means unread chat messages or announcements.
      </P>
    </>
  )
}
