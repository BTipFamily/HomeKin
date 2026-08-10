import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalHeading } from '@/components/legal-page'
import { MODERATION_RESPONSE_HOURS, legalContactEmail } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Terms of Use — HomeKin',
  description: 'The rules for using HomeKin, and what happens when somebody breaks them.',
}

/**
 * Terms of Use, doubling as the end-user licence agreement.
 *
 * App Store guideline 1.2 requires an app with user-generated content to publish
 * terms somebody agrees to, state that abusive content is not tolerated, and say
 * what happens to people who post it. Apple's default EULA covers the licence
 * but says nothing about content, which is why this exists.
 */
// Rendered per request rather than baked at build time. The contact address
// comes from CONTACT_EMAIL, and a statically prerendered page would read that
// once during the build — so setting the variable in the hosting dashboard
// afterwards would change nothing, and the page would keep showing the
// placeholder while the variable looked correctly set. Two paragraphs of text
// cost nothing to render.
export const dynamic = 'force-dynamic'

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <p>
        HomeKin is a private app for one family to keep a directory, plan reunions and share
        photographs. Using it means agreeing to what follows. If you do not agree, do not use it —
        and you can delete your account at any time from <strong>Your Account</strong>.
      </p>

      <LegalHeading>Getting in</LegalHeading>
      <p>
        Access is by invitation. You need an invite code from an administrator, the account is
        yours alone, and you should not share your password or pass your login to anybody else. You
        must be 13 or older to have your own login. Profiles for younger children are created and
        managed by a parent or guardian.
      </p>

      <LegalHeading>What you may not post</LegalHeading>
      <p className="font-medium">
        There is no tolerance for abusive content or abusive behaviour here.
      </p>
      <p>Do not post, send or upload:</p>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Anything that harasses, bullies, threatens or intimidates another person.</li>
        <li>Hateful content aimed at anyone&rsquo;s race, religion, sex, sexuality or disability.</li>
        <li>Nudity or sexual content.</li>
        <li>Anything depicting or encouraging violence.</li>
        <li>
          Somebody else&rsquo;s private information — an address, a phone number, a medical detail —
          without their permission.
        </li>
        <li>Photographs of other people, and especially of children, that they would not want shared.</li>
        <li>Anything unlawful, and anything that is not yours to post.</li>
        <li>Spam, chain messages, and attempts to sell things or collect money outside the reunion.</li>
      </ul>

      <LegalHeading>Reporting and blocking</LegalHeading>
      <p>
        Every photograph, comment, message and profile can be reported, and every member can be
        blocked. Reports go to the committee, who aim to look at them within{' '}
        {MODERATION_RESPONSE_HOURS} hours. Blocking is immediate, hides you and the other person
        from each other, and does not tell them.
      </p>
      <p>
        If something is urgent, or it concerns a child, write to{' '}
        <a className="underline" href={`mailto:${legalContactEmail()}`}>
          {legalContactEmail()}
        </a>{' '}
        as well as reporting it.
      </p>

      <LegalHeading>What happens when somebody breaks these rules</LegalHeading>
      <p>
        The committee and administrators may remove any content without warning, and may remove a
        person from the directory entirely — which ends their access and deletes their profile.
        Serious matters will be reported to the police. Neither a warning nor a second chance is
        promised.
      </p>

      <LegalHeading>What you post stays yours</LegalHeading>
      <p>
        Your photographs and words remain yours. Posting them here grants HomeKin permission to
        store and display them to the other members of your family directory, and to nobody else,
        for as long as you leave them up.
      </p>

      <LegalHeading>Money</LegalHeading>
      <p>
        Payments made here are for real-world reunion costs — meals, venues, activities — set by
        your family&rsquo;s committee, not by HomeKin. Card payments are processed by Stripe.
        Refunds, deadlines and what a payment covers are matters between you and your committee.
        HomeKin records what was paid; it does not hold the money and does not arbitrate disputes
        about it.
      </p>

      <LegalHeading>No guarantees</LegalHeading>
      <p>
        HomeKin is provided as it is, without warranty of any kind. It may be unavailable, it may
        lose data, and it should not be the only copy of a photograph that matters to you. Keep
        your own copies of anything irreplaceable.
      </p>

      <LegalHeading>Leaving</LegalHeading>
      <p>
        Delete your account whenever you like from <strong>Your Account</strong>. What is removed
        and what remains is set out in the{' '}
        <Link className="underline" href="/privacy">
          Privacy Policy
        </Link>
        .
      </p>
    </LegalPage>
  )
}
