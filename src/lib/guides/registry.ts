import type { ComponentType } from 'react'
import { SECTIONS, type GuideMeta, type GuideModule, type SectionId } from '@/lib/guides/types'

/**
 * Every guide, in reading order.
 *
 * Statically imported rather than lazily resolved by slug: it keeps the index
 * page's metadata and the guide page's component coming from one source, and it
 * means a missing or misnamed module is a build error rather than a 404 nobody
 * notices. The pages are prerendered, so there is nothing to gain from splitting
 * them up.
 */

import * as joiningWithAnInviteCode from '@/content/guides/joining-with-an-invite-code'
import * as signingIn from '@/content/guides/signing-in'
import * as findingYourWayAround from '@/content/guides/finding-your-way-around'

import * as browsingTheDirectory from '@/content/guides/browsing-the-directory'
import * as editingYourProfile from '@/content/guides/editing-your-profile'
import * as sharingSupportNeeds from '@/content/guides/sharing-support-needs'
import * as recordingRelationships from '@/content/guides/recording-relationships'
import * as readingTheFamilyTree from '@/content/guides/reading-the-family-tree'
import * as importingMembers from '@/content/guides/importing-members'

import * as creatingAReunion from '@/content/guides/creating-a-reunion'
import * as askingTheFamily from '@/content/guides/asking-the-family'
import * as settlingDateAndPlace from '@/content/guides/settling-date-and-place'
import * as thePlanningTimeline from '@/content/guides/the-planning-timeline'
import * as estimatingTheBudget from '@/content/guides/estimating-the-budget'
import * as managingAReunion from '@/content/guides/managing-a-reunion'

import * as addingAnEvent from '@/content/guides/adding-an-event'
import * as howAnEventIsBooked from '@/content/guides/how-an-event-is-booked'
import * as paymentDeadlines from '@/content/guides/payment-deadlines'
import * as readingTheAgenda from '@/content/guides/reading-the-agenda'

import * as signingUpForAnEvent from '@/content/guides/signing-up-for-an-event'
import * as payingByCard from '@/content/guides/paying-by-card'
import * as reportingAPayment from '@/content/guides/reporting-a-payment'
import * as confirmingPayments from '@/content/guides/confirming-payments'
import * as invitationsAndRsvp from '@/content/guides/invitations-and-rsvp'

import * as photosAndVideo from '@/content/guides/photos-and-video'
import * as chat from '@/content/guides/chat'
import * as announcements from '@/content/guides/announcements'
import * as surveys from '@/content/guides/surveys'
import * as theTravelMap from '@/content/guides/the-travel-map'

import * as addingAMemberProfile from '@/content/guides/adding-a-member-profile'
import * as inviteCodes from '@/content/guides/invite-codes'
import * as roles from '@/content/guides/roles'
import * as mergingDuplicates from '@/content/guides/merging-duplicates'

const MODULES: GuideModule[] = [
  joiningWithAnInviteCode,
  signingIn,
  findingYourWayAround,

  browsingTheDirectory,
  editingYourProfile,
  sharingSupportNeeds,
  recordingRelationships,
  readingTheFamilyTree,
  importingMembers,

  creatingAReunion,
  askingTheFamily,
  settlingDateAndPlace,
  thePlanningTimeline,
  estimatingTheBudget,
  managingAReunion,

  addingAnEvent,
  howAnEventIsBooked,
  paymentDeadlines,
  readingTheAgenda,

  signingUpForAnEvent,
  payingByCard,
  reportingAPayment,
  confirmingPayments,
  invitationsAndRsvp,

  photosAndVideo,
  chat,
  announcements,
  surveys,
  theTravelMap,

  addingAMemberProfile,
  inviteCodes,
  roles,
  mergingDuplicates,
]

export type Guide = GuideMeta & { Component: ComponentType }

export const GUIDES: Guide[] = MODULES.map((m) => ({ ...m.meta, Component: m.default }))

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug)
}

/** Guides grouped for the index, in section order, skipping empty sections. */
export function guidesBySection(): { id: SectionId; title: string; blurb: string; guides: Guide[] }[] {
  return SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    blurb: section.blurb,
    guides: GUIDES.filter((g) => g.section === section.id),
  })).filter((s) => s.guides.length > 0)
}

/** Previous and next in reading order, for the footer links on a guide. */
export function neighbours(slug: string): { previous?: Guide; next?: Guide } {
  const i = GUIDES.findIndex((g) => g.slug === slug)
  if (i === -1) return {}
  return { previous: GUIDES[i - 1], next: GUIDES[i + 1] }
}
