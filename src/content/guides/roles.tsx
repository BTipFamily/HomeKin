import { Badge } from '@/components/ui/badge'
import { GuideNote, H2, List, P, Screen, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'roles',
  title: 'Roles, and what each one can do',
  summary: 'Member, committee, admin — who can see and change what.',
  section: 'admin',
  role: 'admin',
}

export default function Guide() {
  return (
    <>
      <P>
        Everyone has exactly one of three roles. Change them on <UI>Manage Members</UI> using the
        arrow buttons on each row — the change takes effect immediately, with no invitation or
        acceptance step.
      </P>

      <Screen label="Manage Members — role buttons">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
          <p className="text-sm font-medium">Michael Carter</p>
          <div className="flex items-center gap-2">
            <Badge className="border-transparent bg-violet-600 text-white dark:bg-violet-400 dark:text-violet-950">
              committee
            </Badge>
            <span className="text-xs text-muted-foreground">→ Member</span>
            <span className="text-xs text-muted-foreground">→ Admin</span>
          </div>
        </div>
      </Screen>

      <H2>Member</H2>
      <P>The default, and what most of the family is.</P>
      <List>
        <li>Read the directory, the family tree and the map.</li>
        <li>Edit their own profile and record their own relationships.</li>
        <li>Answer the interest form and surveys, and tick off timeline items.</li>
        <li>Sign up for events, pay, and report payments made another way.</li>
        <li>Post in chat, upload photos, comment and like.</li>
      </List>

      <H2>Committee</H2>
      <P>Everything a member can do, plus running the reunion.</P>
      <List>
        <li>Create reunions, and edit their details and dates.</li>
        <li>Add, edit and delete events, including pricing and payment deadlines.</li>
        <li>Read the interest summary, and settle the date and place.</li>
        <li>Confirm reported payments and see every household&apos;s balance.</li>
        <li>Post announcements, send invitations, build surveys.</li>
        <li>Edit anyone&apos;s profile, and read everyone&apos;s dietary and health notes.</li>
        <li>Import a directory from a spreadsheet.</li>
        <li>See attendee names on the agenda, which members cannot.</li>
      </List>

      <H2>Admin</H2>
      <P>Everything, plus the things that are hard to undo.</P>
      <List>
        <li>Add member profiles, and delete members.</li>
        <li>Issue invite codes.</li>
        <li>Merge duplicate profiles.</li>
        <li>Change anybody&apos;s role.</li>
        <li>Delete a whole reunion — the one thing committee cannot do.</li>
      </List>

      <GuideNote variant="warning" title="Roles are global, not per-reunion">
        <p>
          There is one role per person for the whole app. Making somebody committee so they can
          help with next year&apos;s reunion makes them committee on <em>every</em> reunion, past
          and future — including the ability to read every household&apos;s balance and everyone&apos;s
          health notes. There is currently no way to scope a role to one reunion.
        </p>
      </GuideNote>

      <H2>Choosing sensibly</H2>
      <List>
        <li>
          Committee is the right default for anyone actually organising. It covers everything
          except destroying things.
        </li>
        <li>
          Keep admins few. The distinguishing powers — deleting members, deleting reunions,
          changing roles — are the ones with no undo.
        </li>
        <li>
          You cannot change your own role, which is deliberate: it stops the last admin
          accidentally demoting themselves and locking everyone out.
        </li>
      </List>

      <H2>How to tell what someone is</H2>
      <P>
        Role badges appear beside names in the directory and on profiles.{' '}
        <Badge className="border-transparent bg-primary text-primary-foreground">admin</Badge>{' '}
        <Badge className="border-transparent bg-violet-600 text-white dark:bg-violet-400 dark:text-violet-950">
          committee
        </Badge>{' '}
        <Badge className="border-transparent bg-muted text-muted-foreground">member</Badge>. The
        quickest check for your own is the reunion nav: if you can see Budget and Manage, you are
        at least committee.
      </P>
    </>
  )
}
