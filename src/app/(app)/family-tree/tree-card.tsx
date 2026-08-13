'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { BranchTint } from '@/lib/branch-tint'

export const CARD_WIDTH = 112
export const CARD_HEIGHT = 152
const PHOTO_HEIGHT = 104

export type TreeCardMember = {
  id: string
  name: string
  photo_url: string | null
  family_branch: string | null
  tint: BranchTint
  /** Pre-formatted server-side so `date_of_birth` visibility rules are applied there. */
  lifespan: string | null
  /** A profile nobody has claimed yet. */
  isProxy: boolean
}

function Silhouette() {
  return (
    <svg
      viewBox="0 0 112 104"
      className="h-full w-full"
      style={{ fill: 'hsl(var(--tree-tint-ink))' }}
      aria-hidden="true"
    >
      <circle cx="56" cy="39" r="17" />
      <path d="M18 104c0-23 17-35 38-35s38 12 38 35z" />
    </svg>
  )
}

interface TreeCardProps {
  member: TreeCardMember
  isFocus: boolean
  onSelect: () => void
  onHoverChange: (hovered: boolean) => void
}

export function TreeCard({ member, isFocus, onSelect, onHoverChange }: TreeCardProps) {
  const [photoFailed, setPhotoFailed] = useState(false)
  const showPhoto = member.photo_url && !photoFailed

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onFocus={() => onHoverChange(true)}
      onBlur={() => onHoverChange(false)}
      aria-current={isFocus ? 'true' : undefined}
      className={cn(
        'group absolute flex flex-col overflow-hidden rounded-sm border bg-card text-left shadow-sm',
        'transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-ring focus-visible:ring-offset-1',
        isFocus && 'ring-2 ring-primary ring-offset-1'
      )}
      style={
        {
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          borderColor: 'hsl(var(--tree-line))',
          // Set once here so the photo panel and the silhouette inside it can
          // both read the branch colour without prop-drilling it further.
          '--tree-tint': `hsl(var(--tree-tint-${member.tint}))`,
          '--tree-tint-ink': `var(--tree-tint-${member.tint}-ink)`,
        } as React.CSSProperties
      }
    >
      <div
        className="relative w-full shrink-0"
        style={{ height: PHOTO_HEIGHT, background: 'var(--tree-tint)' }}
      >
        {showPhoto ? (
          // Avatars come from Supabase storage at unknown dimensions;
          // next/image would need a remote pattern configured per project and
          // buys nothing at 112px.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.photo_url!}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <Silhouette />
        )}

        <span
          className="absolute right-1 top-1 h-3 w-3 rounded-[2px] border"
          style={{
            background: member.isProxy ? 'hsl(var(--warning))' : 'hsl(var(--success))',
            borderColor: member.isProxy
              ? 'hsl(var(--warning-border))'
              : 'hsl(var(--success-border))',
          }}
          aria-hidden="true"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center px-1.5 py-1 text-center">
        <span className="line-clamp-2 text-[10.5px] font-semibold leading-tight">
          {member.name}
        </span>
        {member.lifespan && (
          <span className="mt-px text-[9.5px] tabular-nums text-muted-foreground">
            {member.lifespan}
          </span>
        )}
      </div>
    </button>
  )
}
