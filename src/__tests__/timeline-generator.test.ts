import { generateTimeline, TIMELINE_TEMPLATE } from '@/lib/timeline-generator'

const baseOptions = { multiDay: false, lodging: false, merchandise: false, heritage: false }

describe('generateTimeline', () => {
  test('with all options off, only "always" items are included', () => {
    const alwaysCount = TIMELINE_TEMPLATE.filter((i) => i.condition === 'always').length
    const items = generateTimeline('2026-10-15', baseOptions)
    expect(items).toHaveLength(alwaysCount)
  })

  test('enabling an option adds its conditional item', () => {
    const withLodging = generateTimeline('2026-10-15', { ...baseOptions, lodging: true })
    const withoutLodging = generateTimeline('2026-10-15', baseOptions)
    expect(withLodging.length).toBe(withoutLodging.length + 1)
    expect(withLodging.some((i) => i.category === 'lodging')).toBe(true)
  })

  test('enabling all options includes every template item', () => {
    const items = generateTimeline('2026-10-15', {
      multiDay: true,
      lodging: true,
      merchandise: true,
      heritage: true,
    })
    expect(items).toHaveLength(TIMELINE_TEMPLATE.length)
  })

  test('due dates count backward from the start date', () => {
    const items = generateTimeline('2026-10-15', baseOptions)
    const dayOf = items.find((i) => i.title.startsWith('Reunion day'))
    expect(dayOf?.due_date).toBe('2026-10-15')

    const oneWeekBefore = items.find((i) => i.title.startsWith('Reconfirm all vendors'))
    expect(oneWeekBefore?.due_date).toBe('2026-10-08')
  })

  test('an "after" item lands after the start date', () => {
    const items = generateTimeline('2026-10-15', baseOptions)
    const after = items.find((i) => i.title.startsWith('Send thank-yous'))
    expect(after?.due_date).toBe('2026-10-22')
  })

  test('items are sorted chronologically by due date', () => {
    const items = generateTimeline('2026-10-15', {
      multiDay: true,
      lodging: true,
      merchandise: true,
      heritage: true,
    })
    const dates = items.map((i) => i.due_date)
    const sorted = [...dates].sort()
    expect(dates).toEqual(sorted)
  })

  test('sort_order is assigned sequentially starting at 0', () => {
    const items = generateTimeline('2026-10-15', baseOptions)
    items.forEach((item, index) => expect(item.sort_order).toBe(index))
  })

  test('accepts a Date object as well as a string', () => {
    const items = generateTimeline(new Date(2026, 9, 15), baseOptions)
    const dayOf = items.find((i) => i.title.startsWith('Reunion day'))
    expect(dayOf?.due_date).toBe('2026-10-15')
  })
})
