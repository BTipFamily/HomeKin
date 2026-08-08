import { Button } from '@/components/ui/button'
import { GuideNote, H2, P, Screen, UI } from '@/components/guides'
import { ZoomIn, ZoomOut } from 'lucide-react'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'reading-the-family-tree',
  title: 'Reading the family tree',
  summary: 'Move around the tree, and re-centre it on whoever you are curious about.',
  section: 'directory',
}

export default function Guide() {
  return (
    <>
      <P>
        The tree is drawn from the relationships people have recorded on their profiles. It has no
        separate editor — if something looks wrong, the fix is on somebody&apos;s profile.
      </P>

      <Screen label="Family Tree">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Center on</span>
            <span className="rounded-md border px-3 py-1.5 text-sm">Rose Carter</span>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm">
              Include unrelated attendees
            </Button>
          </div>
          <div className="rounded-lg border bg-muted/30 p-6">
            <div className="mx-auto flex w-fit flex-col items-center gap-3">
              <div className="rounded-md border bg-card px-4 py-2 text-sm font-medium">Rose Carter</div>
              <div className="h-4 w-px bg-border" />
              <div className="flex gap-3">
                <div className="rounded-md border bg-card px-4 py-2 text-sm">Michael</div>
                <div className="rounded-md border bg-card px-4 py-2 text-sm">Jane</div>
                <div className="rounded-md border bg-card px-4 py-2 text-sm">Thomas</div>
              </div>
            </div>
          </div>
        </div>
      </Screen>

      <H2>Moving around</H2>
      <P>
        The tree is drawn <em>around one person</em> rather than from a single root, so who it
        centres on decides what you see. Use <UI>Center on</UI> to pick someone, or just click any
        box in the tree to re-centre on them. The zoom buttons do what they say.
      </P>

      <H2>Hidden relatives</H2>
      <P>
        By default the tree hides anyone with no recorded relationships — otherwise a family that
        has only half-filled its links gets a screen of scattered, unconnected boxes.{' '}
        <UI>Include unrelated attendees</UI> brings them back if you want to see who is still
        unlinked.
      </P>

      <GuideNote title="An empty or thin tree isn't a bug">
        <p>
          The tree can only show what people have entered. If it looks sparse, the relationships
          haven&apos;t been recorded yet — not a technical problem. The fastest way to fill it out
          is a spreadsheet import with the parent and spouse columns filled in; the slower, surer
          way is people adding their own on their profiles.
        </p>
      </GuideNote>
    </>
  )
}
