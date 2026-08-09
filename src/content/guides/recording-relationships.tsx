import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GuideNote, H2, List, P, Screen, Step, Steps, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'recording-relationships',
  title: 'Recording family relationships',
  summary: 'Say who your parents, children and partner are — the tree draws itself from this.',
  section: 'directory',
}

export default function Guide() {
  return (
    <>
      <P>
        Nobody draws the family tree by hand. It is assembled from individual statements like
        &quot;Rose is my mother&quot;, each recorded once by one person. Add yours on your profile
        edit page, in the <UI>Family Relationships</UI> card below the main form.
      </P>

      <Steps>
        <Step n={1} title="Choose what kind of link it is">
          <p>
            Four kinds: <UI>Parent</UI>, <UI>Child</UI>, <UI>Partner</UI>, and <UI>Custom</UI> for
            anything that doesn&apos;t fit — godmother, guardian, the cousin everyone calls an
            aunt.
          </p>
        </Step>

        <Step n={2} title="Find the person">
          <p>
            Start typing a name and matches appear as you type. Only people already in the
            directory can be linked, so if someone is missing they need adding first.
          </p>
          <Screen label="Add a relationship">
            <div className="max-w-md space-y-3">
              <div className="flex gap-2">
                <Badge className="border-transparent bg-primary text-primary-foreground">Parent</Badge>
                <Badge variant="outline">Child</Badge>
                <Badge variant="outline">Partner</Badge>
                <Badge variant="outline">Custom</Badge>
              </div>
              <div className="space-y-1">
                <Label>Who?</Label>
                <Input defaultValue="Rose Car" readOnly />
                <div className="rounded-md border">
                  <p className="border-b px-3 py-2 text-sm">Rose Carter</p>
                  <p className="px-3 py-2 text-sm text-muted-foreground">Rosemary Carter-Hill</p>
                </div>
              </div>
              <div className="space-y-1">
                <Label>What kind?</Label>
                <div className="flex gap-2">
                  <Badge className="border-transparent bg-primary text-primary-foreground">Biological</Badge>
                  <Badge variant="outline">Step</Badge>
                  <Badge variant="outline">Adoptive</Badge>
                  <Badge variant="outline">Foster</Badge>
                </div>
              </div>
              <Button>Add relationship</Button>
            </div>
          </Screen>
        </Step>

        <Step n={3} title="Say what kind of parent or partner">
          <p>
            For a parent or child: <UI>Biological</UI>, <UI>Step</UI>, <UI>Adoptive</UI> or{' '}
            <UI>Foster</UI>. For a partner: <UI>Married</UI>, <UI>Partnered</UI>,{' '}
            <UI>Engaged</UI>, <UI>Separated</UI>, <UI>Divorced</UI> or <UI>Widowed</UI>, with
            optional start and end dates.
          </p>
          <p>
            These distinctions are kept rather than flattened, which is the point — a family tree
            that turns every parent into &quot;parent&quot; loses exactly the history most
            families want recorded.
          </p>
        </Step>
      </Steps>

      <GuideNote variant="tip" title="Record it once, from either side">
        <p>
          A link is a fact about two people, not a possession of one. If your sister has already
          recorded your mother as her parent, that doesn&apos;t record yours — but if you record
          your mother, she doesn&apos;t need to record you as her child. Adding a partner from
          either side updates the same link rather than creating a duplicate.
        </p>
      </GuideNote>

      <H2>Removing one</H2>
      <P>
        Existing relationships are listed underneath with an <UI>×</UI> on each. Removing one
        deletes only that link — it never touches either person&apos;s profile.
      </P>

      <H2>What it feeds</H2>
      <List>
        <li>The family tree, which can be re-centred on anyone.</li>
        <li>
          Duplicate detection — two profiles sharing relatives are a strong sign of one person
          entered twice.
        </li>
        <li>
          A spreadsheet import, which can create relationships in bulk using the{' '}
          <UI>parent_1</UI>, <UI>parent_2</UI> and <UI>spouse</UI> columns.
        </li>
      </List>
    </>
  )
}
