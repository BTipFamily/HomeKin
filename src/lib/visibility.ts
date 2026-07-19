import type { Role, VisibilitySettings } from '@/types/database'

/** Mirrors the visibility rule used on the member profile page. */
export function canViewField(
  settings: VisibilitySettings | null | undefined,
  field: keyof VisibilitySettings,
  viewerRole: Role | undefined
): boolean {
  const setting = settings?.[field]
  return (
    setting === 'members' ||
    (setting === 'committee' && ['committee', 'admin'].includes(viewerRole ?? ''))
  )
}
