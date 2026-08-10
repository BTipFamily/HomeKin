import type { Metadata } from 'next'
import { LegalPage, LegalHeading } from '@/components/legal-page'
import { MODERATION_RESPONSE_HOURS, SUBPROCESSORS, legalContactEmail } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Privacy Policy — HomeKin',
  description: 'What HomeKin collects about you, who can see it, and how to have it deleted.',
}

// Rendered per request rather than baked at build time. The contact address
// comes from CONTACT_EMAIL, and a statically prerendered page would read that
// once during the build — so setting the variable in the hosting dashboard
// afterwards would change nothing, and the page would keep showing the
// placeholder while the variable looked correctly set. Two paragraphs of text
// cost nothing to render.
export const dynamic = 'force-dynamic'

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        HomeKin is a private directory and planning tool for one family. It is not a social
        network, there is no advertising in it, and nothing in it is sold or shared with anyone
        outside the services listed at the bottom of this page.
      </p>

      <LegalHeading>What is collected</LegalHeading>
      <p>Some of this you type in yourself. Some is created by using the app.</p>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong>Your profile:</strong> name, email address, phone number, postal address, date of
          birth, a photograph, a short biography, links to social accounts, and which branch of the
          family you belong to.
        </li>
        <li>
          <strong>Health and dietary notes,</strong> if you choose to record them — allergies,
          dietary requirements, medical notes and mobility needs, so the committee can plan meals
          and venues. You decide whether to share these with the family or keep them to yourself.
        </li>
        <li>
          <strong>Location:</strong>{' '}
          your postal address is converted into map coordinates so you can appear on
          the travel map. This is done from the address you typed. HomeKin never
          reads your device&rsquo;s location.
        </li>
        <li>
          <strong>Family relationships</strong> — who is whose parent, child, sibling or spouse.
        </li>
        <li>
          <strong>What you post:</strong> photographs and videos, captions, who is tagged in them,
          comments, likes, reunion chat and direct messages.
        </li>
        <li>
          <strong>Reunion activity:</strong> which events you signed up for, how many people you
          are bringing, what you owe and what you have paid, survey and interest-form answers.
        </li>
        <li>
          <strong>Technical:</strong> anonymous page-view counts, and the ordinary server logs any
          website keeps.
        </li>
      </ul>

      <LegalHeading>Children</LegalHeading>
      <p>
        A family directory contains children. Profiles for people under 13 should be created and
        managed by a parent or guardian, who is responsible for what appears on them. HomeKin does
        not knowingly let a child under 13 create their own login. If you believe a child&rsquo;s
        information is here without a parent&rsquo;s knowledge, write to{' '}
        <a className="underline" href={`mailto:${legalContactEmail()}`}>
          {legalContactEmail()}
        </a>{' '}
        and it will be removed.
      </p>

      <LegalHeading>Who can see it</LegalHeading>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong>Other members of your family directory</strong> can see profiles, the family tree,
          photographs, and reunion plans. Access requires an invitation — nobody can sign up
          without an invite code.
        </li>
        <li>
          <strong>Committee members and admins</strong>{' '}
          can additionally see what everyone owes and has paid, everyone&rsquo;s survey answers with names attached, and any health or dietary
          notes you chose to share.
        </li>
        <li>
          <strong>Direct messages</strong> are visible only to the two people in them.
        </li>
        <li>
          <strong>Nobody outside the directory</strong> can see any of it. There is no public
          profile page and nothing is indexed by search engines.
        </li>
      </ul>

      <LegalHeading>Deleting your account</LegalHeading>
      <p>
        You can delete your account yourself, at any time, from <strong>Your Account</strong> in the
        menu under your photograph. It removes your profile, your contact details, your health and
        dietary notes, your family connections, your signups, your balances and your survey
        answers, and it revokes your login. It cannot be undone and no copy is kept for an
        administrator to restore.
      </p>
      <p>
        Photographs you uploaded and messages you sent remain, because they are part of other
        people&rsquo;s conversations and albums — but they stop carrying your name.
      </p>

      <LegalHeading>Reporting and blocking</LegalHeading>
      <p>
        Any photograph, comment, message or profile can be reported from the app, and any member
        can be blocked. Reports go to the committee, who aim to look at them within{' '}
        {MODERATION_RESPONSE_HOURS} hours and can remove content and remove people. Blocking is
        immediate, works in both directions, and the person is not told.
      </p>

      <LegalHeading>Payments</LegalHeading>
      <p>
        Payments for reunion costs are handled by Stripe. Card numbers are never sent to HomeKin
        and never stored by it — HomeKin records only that a payment of a given amount succeeded.
      </p>

      <LegalHeading>Services the data passes through</LegalHeading>
      <ul className="list-disc space-y-1.5 pl-5">
        {SUBPROCESSORS.map((s) => (
          <li key={s.name}>
            <strong>{s.name}</strong> — {s.purpose}
          </li>
        ))}
      </ul>
      <p>
        Each holds data only to provide that service. None of them is given family data for their
        own purposes, and none of it is sold.
      </p>

      <LegalHeading>How long it is kept</LegalHeading>
      <p>
        For as long as the account exists. Delete the account and it goes, apart from the shared
        content described above. Backups roll off within 30 days.
      </p>

      <LegalHeading>Asking for a copy</LegalHeading>
      <p>
        Write to{' '}
        <a className="underline" href={`mailto:${legalContactEmail()}`}>
          {legalContactEmail()}
        </a>{' '}
        and you will be sent everything held about you, in a readable format, within 30 days.
      </p>
    </LegalPage>
  )
}
