// The sections of a reunion, in one place.
//
// The top bar and the reunion page used to keep their own lists, and they had
// drifted: the same page was "Budget" in one and "Payments" in the other,
// "Signups" against "Signups & Pay", and Agenda, Interest, Timeline, Planning
// and Report were missing from the bar entirely. Everything that links to a
// reunion section reads from here, so a section is named once.
//
// The reunion page itself is "Overview" rather than "Home": the app's own home
// is the dashboard, and two things called Home a tap apart is one too many.
//
// Pure apart from the icon components, so the list and the active-state rule
// can be tested without rendering anything.

import {
  CalendarDays,
  Calendar,
  Camera,
  ClipboardList,
  Compass,
  DollarSign,
  FileText,
  HeartHandshake,
  LayoutGrid,
  ListChecks,
  Mail,
  Map as MapIcon,
  MessageCircle,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export type ReunionSection = {
  /** Relative to /reunion/[id]; '' is the reunion page itself. */
  path: string
  label: string
  icon: LucideIcon
  /** 'family' is what everyone comes for; 'planning' is what it is organised with. */
  group: 'family' | 'planning'
  committeeOnly: boolean
}

const SECTIONS: ReunionSection[] = [
  { path: '', label: 'Overview', icon: LayoutGrid, group: 'family', committeeOnly: false },
  { path: 'events', label: 'Events', icon: Calendar, group: 'family', committeeOnly: false },
  { path: 'signups', label: 'Signups & Pay', icon: Users, group: 'family', committeeOnly: false },
  { path: 'agenda', label: 'Agenda', icon: CalendarDays, group: 'family', committeeOnly: false },
  { path: 'chat', label: 'Chat', icon: MessageCircle, group: 'family', committeeOnly: false },
  { path: 'photos', label: 'Photos', icon: Camera, group: 'family', committeeOnly: false },
  { path: 'map', label: 'Map', icon: MapIcon, group: 'family', committeeOnly: false },
  { path: 'surveys', label: 'Surveys', icon: ClipboardList, group: 'family', committeeOnly: false },
  { path: 'interest', label: 'Interest', icon: HeartHandshake, group: 'family', committeeOnly: false },

  { path: 'planning', label: 'Planning', icon: Compass, group: 'planning', committeeOnly: true },
  { path: 'timeline', label: 'Timeline', icon: ListChecks, group: 'planning', committeeOnly: false },
  {
    path: 'budget-estimator',
    label: 'Budget Estimator',
    icon: Wallet,
    group: 'planning',
    committeeOnly: false,
  },
  { path: 'invitations', label: 'Invitations', icon: Mail, group: 'planning', committeeOnly: true },
  { path: 'budget', label: 'Payments', icon: DollarSign, group: 'planning', committeeOnly: true },
  { path: 'report', label: 'Report', icon: FileText, group: 'planning', committeeOnly: true },
  { path: 'manage', label: 'Manage', icon: Settings, group: 'planning', committeeOnly: true },
]

/** Every section this person can open, in display order. */
export function reunionSections(canManage: boolean): ReunionSection[] {
  return SECTIONS.filter((s) => canManage || !s.committeeOnly)
}

/**
 * The phone's bottom bar: the four places people go most, then "More".
 * Four because five targets is the most that stay thumb-sized on a narrow
 * phone, and the fifth slot is the way to everything else.
 */
export const MOBILE_TAB_PATHS = ['', 'events', 'chat', 'photos'] as const

export function sectionHref(reunionId: string, path: string): string {
  return path ? `/reunion/${reunionId}/${path}` : `/reunion/${reunionId}`
}

/**
 * Whether `pathname` is inside a section.
 *
 * Nested pages count — an event's own page is still Events — but only on a
 * segment boundary, so /budget-estimator never lights up Payments (/budget).
 * Home matches only itself, or it would be lit on every page.
 */
export function isActiveSection(pathname: string, reunionId: string, path: string): boolean {
  const href = sectionHref(reunionId, path)
  const current = pathname.replace(/\/+$/, '')
  if (!path) return current === href
  return current === href || current.startsWith(href + '/')
}
