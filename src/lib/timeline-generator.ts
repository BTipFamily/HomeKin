import { subDays, addDays, format } from 'date-fns'
import type { TimelineItemCategory } from '@/types/database'

export type TimelineCondition = 'always' | 'multiDay' | 'lodging' | 'merchandise' | 'heritage'

export type TimelineOptions = {
  multiDay: boolean
  lodging: boolean
  merchandise: boolean
  heritage: boolean
}

type TemplateItem = {
  offsetDays: number
  title: string
  phaseLabel: string
  category: TimelineItemCategory
  condition: TimelineCondition
}

// offsetDays counts backward from the reunion's start date (positive = before,
// negative = after). Conditional items are only included when the matching
// TimelineOptions flag is set.
export const TIMELINE_TEMPLATE: TemplateItem[] = [
  {
    offsetDays: 365,
    title: 'Form planning committee & set target budget',
    phaseLabel: '12+ months before',
    category: 'logistics',
    condition: 'always',
  },
  {
    offsetDays: 270,
    title: 'Confirm host city & venue',
    phaseLabel: '9 months before',
    category: 'venue',
    condition: 'always',
  },
  {
    offsetDays: 240,
    title: 'Negotiate hotel group rate / room block',
    phaseLabel: '8 months before',
    category: 'lodging',
    condition: 'lodging',
  },
  {
    offsetDays: 180,
    title: 'Send save-the-dates; open RSVP signup',
    phaseLabel: '6 months before',
    category: 'rsvp',
    condition: 'always',
  },
  {
    offsetDays: 150,
    title: 'Book photographer/videographer & entertainment',
    phaseLabel: '5 months before',
    category: 'vendor',
    condition: 'always',
  },
  {
    offsetDays: 120,
    title: 'Order reunion shirts/merchandise — set vendor & sizing deadline',
    phaseLabel: '4 months before',
    category: 'merchandise',
    condition: 'merchandise',
  },
  {
    offsetDays: 100,
    title: 'Set up heritage/genealogy activity — memory table, family tree, slideshow',
    phaseLabel: '3-4 months before',
    category: 'heritage',
    condition: 'heritage',
  },
  {
    offsetDays: 90,
    title: 'Finalize multi-day itinerary & activities',
    phaseLabel: '3 months before',
    category: 'logistics',
    condition: 'multiDay',
  },
  {
    offsetDays: 45,
    title: 'RSVP deadline; collect final payments',
    phaseLabel: '6-8 weeks before',
    category: 'rsvp',
    condition: 'always',
  },
  {
    offsetDays: 21,
    title: 'Confirm final headcount with caterer/venue',
    phaseLabel: '2-3 weeks before',
    category: 'venue',
    condition: 'always',
  },
  {
    offsetDays: 7,
    title: 'Reconfirm all vendors; prepare welcome packets',
    phaseLabel: '1 week before',
    category: 'vendor',
    condition: 'always',
  },
  {
    offsetDays: 0,
    title: 'Reunion day — check-in, setup & run of show',
    phaseLabel: 'Day of',
    category: 'final',
    condition: 'always',
  },
  {
    offsetDays: -7,
    title: 'Send thank-yous; share photos; collect feedback',
    phaseLabel: 'After the reunion',
    category: 'final',
    condition: 'always',
  },
]

function conditionMet(condition: TimelineCondition, options: TimelineOptions): boolean {
  if (condition === 'always') return true
  return options[condition]
}

export type GeneratedTimelineItem = {
  title: string
  phase_label: string
  category: TimelineItemCategory
  due_date: string
  sort_order: number
}

export function generateTimeline(
  startDate: Date | string,
  options: TimelineOptions
): GeneratedTimelineItem[] {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate

  return TIMELINE_TEMPLATE.filter((item) => conditionMet(item.condition, options))
    .map((item) => {
      const dueDate = item.offsetDays >= 0 ? subDays(start, item.offsetDays) : addDays(start, -item.offsetDays)
      return {
        title: item.title,
        phase_label: item.phaseLabel,
        category: item.category,
        due_date: format(dueDate, 'yyyy-MM-dd'),
      }
    })
    .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0))
    .map((item, index) => ({ ...item, sort_order: index }))
}
