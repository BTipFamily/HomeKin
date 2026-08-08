import { Badge } from '@/components/ui/badge'
import { GuideNote, H2, List, P, Screen, UI } from '@/components/guides'
import { MapPin } from 'lucide-react'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'the-travel-map',
  title: 'The travel map',
  summary: 'See where the family is spread, and how far people are coming.',
  section: 'keeping-in-touch',
}

export default function Guide() {
  return (
    <>
      <P>
        The map plots three things at once: where family members live, where the reunion is, and
        where each event is happening. It is the quickest way to answer &quot;is this location
        fair to everybody?&quot; — a place that is convenient for the committee is not always
        convenient for the family.
      </P>

      <Screen label="Travel map">
        <div className="relative h-56 rounded-lg border bg-muted/40">
          <span className="absolute left-[22%] top-[38%] text-primary"><MapPin className="h-5 w-5" /></span>
          <span className="absolute left-[46%] top-[28%] text-primary"><MapPin className="h-5 w-5" /></span>
          <span className="absolute left-[58%] top-[54%] text-primary"><MapPin className="h-5 w-5" /></span>
          <span className="absolute left-[63%] top-[48%] text-foreground"><MapPin className="h-6 w-6" /></span>
          <span className="absolute right-3 top-3 flex gap-1">
            <Badge className="border-transparent bg-primary text-[10px] text-primary-foreground">Explore</Badge>
            <Badge variant="outline" className="bg-card text-[10px]">Satellite</Badge>
          </span>
        </div>
      </Screen>

      <H2>What the pins are</H2>
      <List>
        <li>
          <strong>Family homes</strong> — anyone whose address has been entered and looked up.
        </li>
        <li>
          <strong>The reunion location</strong> — once the committee has settled one.
        </li>
        <li>
          <strong>Each event</strong> — wherever an address was given on the event.
        </li>
      </List>
      <P>
        Click a pin for a popup, which links through to that person or event.{' '}
        <UI>Explore</UI> and <UI>Satellite</UI> switch the map style.
      </P>

      <GuideNote title="Not everybody appears">
        <p>
          You only see a member&apos;s home if their address visibility allows it — the same rule
          as the directory. Your own pin is always shown to you. So a sparse map may mean people
          have kept their addresses private, or simply that they never entered one; it does not
          mean the family is small.
        </p>
      </GuideNote>

      <H2>Getting yourself on it</H2>
      <P>
        Add your address on your profile. It is looked up and placed when you save. If you change
        it later, the pin moves on the next save.
      </P>
    </>
  )
}
