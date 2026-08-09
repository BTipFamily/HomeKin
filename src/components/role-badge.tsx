import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Role } from '@/types/database'

/**
 * One badge for a member's role, in one place.
 *
 * This was rebuilt at four call sites with three different rules about when to
 * show it, so the colours drifted apart from the meaning. Roles are a privilege
 * ramp, and the badge should read as one at a glance.
 *
 * Violet is the only literal colour here. The status tokens
 * (success/warning/danger) own green, amber and red, and a role is not a
 * status — borrowing one of those would say "something is wrong with this
 * person". Admin uses --primary so it tracks the brand, and member uses --muted
 * so it stays quiet; both follow the theme without any help.
 */
const ROLE_STYLES: Record<Role, string> = {
  admin: 'border-transparent bg-primary text-primary-foreground',
  committee:
    'border-transparent bg-violet-600 text-white dark:bg-violet-400 dark:text-violet-950',
  member: 'border-transparent bg-muted text-muted-foreground',
}

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <Badge className={cn('capitalize', ROLE_STYLES[role], className)}>{role}</Badge>
  )
}
