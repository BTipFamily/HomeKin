import { Button } from '@/components/ui/button'
import { GuideNote, H2, List, P, Screen, Step, Steps, UI } from '@/components/guides'
import { Heart, Play } from 'lucide-react'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'photos-and-video',
  title: 'Photos and video',
  summary: 'Add to the album, and talk about what everyone else added.',
  section: 'keeping-in-touch',
}

export default function Guide() {
  return (
    <>
      <P>
        Every reunion has one shared album. Anybody can add to it, and everybody can see it. Find
        it under <UI>Photos</UI>.
      </P>

      <Steps>
        <Step n={1} title="Pick your files">
          <p>
            Drag them onto the page or use the file picker. Up to <strong>10 at a time</strong>,
            and you can mix photos and video in the same batch.
          </p>
          <List>
            <li>Images up to 10MB each.</li>
            <li>Video up to 100MB each, as MP4, MOV or WebM.</li>
          </List>
          <p>
            Anything rejected is named with the reason, so you know exactly which file was too big
            rather than having the whole upload fail silently.
          </p>
        </Step>

        <Step n={2} title="Add one caption for the batch">
          <p>
            The caption applies to everything in that upload — so upload the cookout photos
            together with &quot;Saturday cookout&quot; rather than captioning thirty files
            individually.
          </p>
        </Step>

        <Step n={3} title="Upload">
          <p>
            Progress reads &quot;file 3 of 10&quot; as it works. Video takes noticeably longer, and
            a still is grabbed from the start of each clip to use as its thumbnail.
          </p>
          <Screen label="Photos — album">
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div key={i} className="relative aspect-square rounded-md bg-muted">
                  {i === 2 && (
                    <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-foreground/70 px-1.5 py-0.5 text-[10px] text-background">
                      <Play className="h-2.5 w-2.5" /> 0:24
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Screen>
        </Step>
      </Steps>

      <H2>Looking through the album</H2>
      <P>
        Click any tile to open it full size. Arrow keys move between them, Escape closes. Video
        tiles carry a play badge and their length.
      </P>

      <H2>Likes and comments</H2>
      <P>
        In the open view there is a heart — one per person, click again to take it back — and a
        comment thread. You can delete your own comments; committee members and admins can delete
        anyone&apos;s.
      </P>
      <div className="my-4 flex items-center gap-2">
        <Button variant="outline" size="sm" disabled>
          <Heart className="mr-1.5 h-4 w-4" /> 12
        </Button>
        <span className="text-sm text-muted-foreground">3 comments</span>
      </div>

      <H2>Deleting</H2>
      <List>
        <li>Your own uploads, always.</li>
        <li>Anyone&apos;s, if you are on the committee or an admin.</li>
      </List>

      <GuideNote title="The album is private to the family">
        <p>
          Photos are stored privately and served through links that expire after an hour. There is
          no public gallery and no shareable URL that keeps working — if you want to show a photo
          to someone outside the family, download it and send it to them.
        </p>
      </GuideNote>
    </>
  )
}
