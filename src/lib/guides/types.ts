import type { ComponentType } from 'react'

/**
 * Guide metadata lives here rather than in the registry so a guide module can
 * import it without the registry importing itself back.
 */

export const SECTIONS = [
  {
    id: 'getting-started',
    title: 'Getting started',
    blurb: 'Joining the family directory and finding your way around.',
  },
  {
    id: 'directory',
    title: 'Your profile and the directory',
    blurb: 'Who everyone is, how you appear to them, and how the family fits together.',
  },
  {
    id: 'planning',
    title: 'Planning a reunion',
    blurb: 'From the first "would you come?" to a date and a place.',
  },
  {
    id: 'events',
    title: 'Events',
    blurb: 'Putting the individual gatherings on the schedule.',
  },
  {
    id: 'taking-part',
    title: 'Taking part',
    blurb: 'Signing up, paying, and keeping track of what you owe.',
  },
  {
    id: 'keeping-in-touch',
    title: 'Keeping in touch',
    blurb: 'Photos, chat, announcements and everything social.',
  },
  {
    id: 'admin',
    title: 'Running the family',
    blurb: 'Managing people, invitations and roles.',
  },
] as const

export type SectionId = (typeof SECTIONS)[number]['id']

export type GuideMeta = {
  /** URL segment. Lowercase, hyphens only. */
  slug: string
  title: string
  /** One line, shown on the index. Say what the reader will be able to do. */
  summary: string
  section: SectionId
  /** The role needed to *perform* this, when it isn't every member. */
  role?: 'committee' | 'admin'
}

export type GuideModule = {
  meta: GuideMeta
  default: ComponentType
}
