import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GuideNote, H2, List, P, Screen, Step, Steps, UI } from '@/components/guides'
import { ArrowRight } from 'lucide-react'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'merging-duplicates',
  title: 'Merging duplicate profiles',
  summary: 'When one person ends up in the directory twice, join them without losing anything.',
  section: 'admin',
  role: 'admin',
}

export default function Guide() {
  return (
    <>
      <P>
        Duplicates happen — someone is imported from a spreadsheet as &quot;Mike Carter&quot; and
        then signs up as &quot;Michael Carter&quot; with a different address. Merging joins the two
        into one profile and carries everything across rather than making you pick which history to
        throw away.
      </P>
      <P>
        <UI>Merge Duplicates</UI> on the Manage Members page. Admins only.
      </P>

      <Steps>
        <Step n={1} title="Look at the suggestions">
          <p>
            HomeKin proposes likely pairs, most confident first, based on similar names, shared
            email or phone, and relatives in common. It is a suggestion — the judgement is yours.
          </p>
          <Screen label="Merge duplicates — suggestions">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="text-sm">
                  <p className="font-medium">Michael Carter</p>
                  <p className="text-xs text-muted-foreground">michael@example.com · Has login</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="text-sm">
                  <p className="font-medium">Mike Carter</p>
                  <p className="text-xs text-muted-foreground">Never signed in</p>
                </div>
                <Badge className="ml-auto border-transparent bg-success/10 text-success-foreground">
                  Very likely the same person
                </Badge>
              </div>
            </div>
          </Screen>
        </Step>

        <Step n={2} title="Preview the merge">
          <p>
            Nothing happens yet. You get a full review: which profile survives, what every field
            will end up as, and what moves across — signups, balances, payments, relationships,
            photos.
          </p>
          <p>
            Blanks on the surviving profile are filled in from the one being removed;{' '}
            <strong>nothing already set is overwritten</strong>. So a merge can only ever add
            detail, never quietly replace it.
          </p>
        </Step>

        <Step n={3} title="Check which one survives">
          <p>
            HomeKin picks the better candidate — usually the one with a login attached — but there
            is a <UI>Swap</UI> control if it has chosen wrong. Get this right before confirming:
            the surviving profile keeps its ID, and that is what everything else points at.
          </p>
        </Step>

        <Step n={4} title="Confirm">
          <p>
            Press the merge button. The duplicate is removed, everything moves across, and the
            pair disappears from the suggestion list along with any other suggestion that
            referenced it.
          </p>
        </Step>
      </Steps>

      <GuideNote variant="warning" title="A merge cannot be undone">
        <p>
          There is no unmerge. Read the preview properly — particularly the field table and the
          swap control — because putting two people together who were never the same person means
          separating them by hand afterwards, and their signups and payments will already have been
          combined.
        </p>
      </GuideNote>

      <H2>Blockers and warnings</H2>
      <P>
        Some pairs cannot be merged at all, and the preview says why — for example when both
        profiles have their own login, since that would leave an account pointing at nothing.
        Warnings are softer: things worth a look that do not stop you.
      </P>

      <H2>Preferring a merge to a delete</H2>
      <List>
        <li>
          Deleting a duplicate destroys its signups, balances and relationships.
        </li>
        <li>
          Merging keeps all of it and attaches it to the surviving person.
        </li>
        <li>
          The delete dialog on Manage Members says as much, and it is right — if the two are the
          same person, merge.
        </li>
      </List>

      <div className="mt-4">
        <Button size="sm" disabled>Merge and delete Mike Carter</Button>
      </div>
    </>
  )
}
