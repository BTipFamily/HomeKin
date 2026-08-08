import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GuideNote, H2, List, P, Screen, Step, Steps, UI } from '@/components/guides'
import type { GuideMeta } from '@/lib/guides/types'

export const meta: GuideMeta = {
  slug: 'invitations-and-rsvp',
  title: 'Sending invitations and tracking RSVPs',
  summary: 'Email the family about a reunion or one event, and see who actually opened it.',
  section: 'taking-part',
  role: 'committee',
}

export default function Guide() {
  return (
    <>
      <P>
        Invitations are for people who already have a profile — this is not how you get somebody
        into HomeKin in the first place (that is an invite code). It emails them about a reunion,
        or about one specific event, with a link that records whether they opened it.
      </P>
      <P>
        Find it under <UI>Invitations</UI> in the reunion nav.
      </P>

      <Steps>
        <Step n={1} title="Choose who">
          <p>
            Pick people from the directory list. Everyone, one branch, or the handful who
            haven&apos;t responded — whatever the situation calls for.
          </p>
        </Step>

        <Step n={2} title="Optionally narrow it to one event">
          <p>
            Leave it on the whole reunion for a general &quot;here is what we are planning&quot;,
            or select a sub-event when you are chasing numbers for the banquet specifically. The
            link then takes them straight to that event.
          </p>
        </Step>

        <Step n={3} title="Send, and watch the log">
          <p>
            Each person gets their own email with a unique <UI>View Invitation</UI> link. The log
            below tracks three states per person.
          </p>
          <Screen label="Invitations — sent log">
            <div className="space-y-2">
              {[
                ['Rose Carter', 'Responded', 'secondary'],
                ['Michael Carter', 'Opened', 'outline'],
                ['Jane Smith', 'Sent', 'outline'],
              ].map(([who, state, variant]) => (
                <div key={who} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-sm">{who}</span>
                  <Badge variant={variant as 'secondary' | 'outline'} className="text-xs">
                    {state}
                  </Badge>
                </div>
              ))}
            </div>
          </Screen>
          <List>
            <li>
              <strong>Sent</strong> — the email went out.
            </li>
            <li>
              <strong>Opened</strong> — they clicked the link.
            </li>
            <li>
              <strong>Responded</strong> — they clicked it while signed in, so HomeKin knows it was
              really them.
            </li>
          </List>
        </Step>
      </Steps>

      <GuideNote variant="warning" title="This sends real email immediately">
        <p>
          There is no draft and no preview step. Selecting fifty people and pressing send emails
          fifty people. Worth also knowing that the family&apos;s mail is sent through a Gmail
          account with a daily cap of around 500 recipients — a very large family plus a couple of
          announcements in one day can hit it.
        </p>
      </GuideNote>

      <H2>Addresses that failed</H2>
      <P>
        Any address that could not be emailed is reported back to you after sending, so you can
        pass the link on another way rather than assuming everyone got it.
      </P>

      <H2>What the recipient sees</H2>
      <P>
        The link works whether or not they are signed in — someone who has never logged in can
        still read it, which is the point. If they are signed in, opening it also records their
        response.
      </P>

      <div className="mt-4">
        <Button size="sm" disabled>Send invitations</Button>
      </div>
    </>
  )
}
