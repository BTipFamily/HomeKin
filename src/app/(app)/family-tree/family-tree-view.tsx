'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Crosshair, Minus, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buildKinshipIndex, describeKinship, pluralizeKinship } from '@/lib/kinship'
import { DEFAULT_METRICS, buildTreeLayout, type ExpansionState } from '@/lib/tree-layout'
import { cn } from '@/lib/utils'
import { TreeCard, type TreeCardMember } from './tree-card'
import type { Gender } from '@/types/database'

const { cardWidth: CARD_WIDTH, cardHeight: CARD_HEIGHT } = DEFAULT_METRICS

const MIN_ZOOM = 0.4
const MAX_ZOOM = 1.6
const ZOOM_STEP = 0.15

/** The subset of a relationship row the tree needs on the client. */
export type TreeRelationship = {
  member_id: string
  related_member_id: string
  relationship_type: 'parent_child' | 'partner' | 'custom'
  parent_child_kind: string | null
  partner_status: string | null
}

export type TreeMember = TreeCardMember & { gender: Gender | null }

interface FamilyTreeViewProps {
  members: Record<string, TreeMember>
  relationships: TreeRelationship[]
  defaultRootId: string
  /** The signed-in member, so the hover panel can say what someone is to them. */
  viewerId: string | null
}

const EMPTY_EXPANSION: ExpansionState = { up: new Set(), down: new Set() }

export function FamilyTreeView({
  members,
  relationships,
  defaultRootId,
  viewerId,
}: FamilyTreeViewProps) {
  const [rootId, setRootId] = useState(defaultRootId)
  const [expansion, setExpansion] = useState<ExpansionState>(EMPTY_EXPANSION)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const viewportRef = useRef<HTMLDivElement>(null)
  const dragOrigin = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  const index = useMemo(
    // The rows are already the shape buildKinshipIndex reads; the cast is only
    // to satisfy the fuller Relationship type it is declared against.
    () => buildKinshipIndex(relationships as never),
    [relationships]
  )

  const visibleIds = useMemo(() => new Set(Object.keys(members)), [members])

  const compareByName = useCallback(
    (a: string, b: string) => {
      const nameA = members[a]?.name ?? a
      const nameB = members[b]?.name ?? b
      return nameA.localeCompare(nameB) || (a < b ? -1 : a > b ? 1 : 0)
    },
    [members]
  )

  const layout = useMemo(
    () =>
      buildTreeLayout({
        focusId: rootId,
        index,
        visibleIds,
        expansion,
        compare: compareByName,
      }),
    [rootId, index, visibleIds, expansion, compareByName]
  )

  const cardById = useMemo(
    () => new Map(layout.cards.map((c) => [c.id, c])),
    [layout]
  )

  const genderOf = useCallback((id: string) => members[id]?.gender ?? null, [members])

  /**
   * Captions under each row, named from the focus person: "Will's grandparents".
   * A row can hold more than one kind of relative — parents alongside aunts and
   * uncles — so each distinct term gets its own caption centred on its own
   * group, rather than one label for the whole row.
   */
  const bandCaptions = useMemo(() => {
    const focusFirstName = members[rootId]?.name.split(' ')[0] ?? 'this person'

    return layout.bands.flatMap((band) => {
      const groups = new Map<string, number[]>()

      for (const id of band.memberIds) {
        if (id === rootId) continue
        const term = describeKinship(rootId, id, index, { genderOf: () => null })
        if (!term || term === 'You') continue
        const card = cardById.get(id)
        if (!card) continue
        const xs = groups.get(term) ?? []
        xs.push(card.x + CARD_WIDTH / 2)
        groups.set(term, xs)
      }

      // Two groups can sit close enough for their captions to collide, so
      // they stack onto separate lines instead of printing over each other.
      const placed: { right: number; row: number }[] = []

      return [...groups.entries()]
        .map(([term, xs]) => ({
          term,
          label: `${focusFirstName}'s ${pluralizeKinship(term)}`,
          x: xs.reduce((sum, x) => sum + x, 0) / xs.length,
        }))
        .sort((a, b) => a.x - b.x)
        .map(({ term, label, x }) => {
          const halfWidth = label.length * 3 + 6 // ~6px per char at 10px, halved
          let row = 0
          while (placed.some((p) => p.row === row && p.right > x - halfWidth)) row += 1
          placed.push({ right: x + halfWidth, row })

          return {
            key: `${band.generation}:${term}`,
            label,
            x,
            y: band.y + CARD_HEIGHT + 8 + row * 13,
          }
        })
    })
  }, [layout, rootId, index, members, cardById])

  const recentre = useCallback(() => {
    const focus = cardById.get(rootId)
    const viewport = viewportRef.current
    if (!focus || !viewport) return
    setPan({
      x: viewport.clientWidth / 2 - (focus.x + CARD_WIDTH / 2) * zoom,
      y: viewport.clientHeight / 2 - (focus.y + CARD_HEIGHT / 2) * zoom,
    })
  }, [cardById, rootId, zoom])

  // Re-centre when the focus person changes — but not on zoom, which should
  // leave you looking at whatever you were looking at.
  useEffect(() => {
    recentre()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootId, layout])

  const focusOn = (id: string) => {
    if (id === rootId) return
    setRootId(id)
    // A different focus means a different tree; carrying the old expansions
    // over would reveal a scatter of unrelated branches.
    setExpansion(EMPTY_EXPANSION)
  }

  const toggleExpansion = (id: string, direction: 'up' | 'down') => {
    setExpansion((current) => {
      const next = new Set(current[direction])
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...current, [direction]: next }
    })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    dragOrigin.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    setIsDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const origin = dragOrigin.current
    if (!origin) return
    setPan({
      x: origin.panX + (e.clientX - origin.x),
      y: origin.panY + (e.clientY - origin.y),
    })
  }

  const endDrag = (e: React.PointerEvent) => {
    if (!dragOrigin.current) return
    dragOrigin.current = null
    setIsDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const sortedMembers = useMemo(
    () => Object.entries(members).sort((a, b) => a[1].name.localeCompare(b[1].name)),
    [members]
  )

  const hovered = hoveredId ? members[hoveredId] : null
  const hoveredCard = hoveredId ? cardById.get(hoveredId) : null
  const hoveredKinship =
    hovered && hoveredId && viewerId
      ? describeKinship(viewerId, hoveredId, index, { genderOf })
      : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-muted-foreground" htmlFor="center-on">
          Center on
        </label>
        <select
          id="center-on"
          value={rootId}
          onChange={(e) => focusOn(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          {sortedMembers.map(([id, m]) => (
            <option key={id} value={id}>
              {m.name}
            </option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">
          {layout.cards.length} of {sortedMembers.length} shown
        </span>
      </div>

      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative touch-none select-none overflow-hidden rounded-lg border"
        style={{
          height: '70vh',
          background: 'hsl(var(--tree-canvas))',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <svg
            className="absolute left-0 top-0 overflow-visible"
            width={Math.max(layout.width, 1)}
            height={Math.max(layout.height, 1)}
            aria-hidden="true"
          >
            {layout.edges.map((edge) => (
              <polyline
                key={edge.key}
                points={edge.points.map(([x, y]) => `${x},${y}`).join(' ')}
                fill="none"
                stroke="hsl(var(--tree-line))"
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={edge.dashed ? '5 4' : undefined}
              />
            ))}
            {layout.bonds.map((bond) => (
              <line
                key={bond.key}
                x1={bond.x1}
                y1={bond.y}
                x2={bond.x2}
                y2={bond.y}
                stroke="hsl(var(--tree-line))"
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray={bond.ended ? '3 3' : undefined}
              />
            ))}
          </svg>

          {bandCaptions.map((caption) => (
            <div
              key={caption.key}
              className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground"
              style={{ left: caption.x, top: caption.y }}
            >
              {caption.label}
            </div>
          ))}

          {layout.cards.map((card) => {
            const member = members[card.id]
            if (!member) return null
            const isExpandedUp = expansion.up.has(card.id)
            const isExpandedDown = expansion.down.has(card.id)

            return (
              <div key={card.id} className="absolute" style={{ left: card.x, top: card.y }}>
                <TreeCard
                  member={member}
                  isFocus={card.id === rootId}
                  onSelect={() => focusOn(card.id)}
                  onHoverChange={(isHovered) => setHoveredId(isHovered ? card.id : null)}
                />

                {(card.canExpandUp || isExpandedUp) && (
                  <ExpandButton
                    direction="up"
                    active={isExpandedUp}
                    label={
                      isExpandedUp
                        ? `Hide ${member.name}'s parents`
                        : `Show ${member.name}'s parents`
                    }
                    onClick={() => toggleExpansion(card.id, 'up')}
                  />
                )}
                {(card.canExpandDown || isExpandedDown) && (
                  <ExpandButton
                    direction="down"
                    active={isExpandedDown}
                    label={
                      isExpandedDown
                        ? `Hide ${member.name}'s children`
                        : `Show ${member.name}'s children`
                    }
                    onClick={() => toggleExpansion(card.id, 'down')}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Positioned in screen space rather than inside the transformed layer,
            so the text stays the same size at any zoom. */}
        {hovered && hoveredCard && (
          <div
            className="pointer-events-none absolute z-10 w-52 rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-lg"
            style={{
              left: Math.max(8, (hoveredCard.x + CARD_WIDTH / 2) * zoom + pan.x - 104),
              top: (hoveredCard.y + CARD_HEIGHT) * zoom + pan.y + 8,
            }}
          >
            <p className="truncate text-sm font-semibold">{hovered.name}</p>
            {hoveredKinship && (
              <p className="text-xs font-medium text-primary">
                {hoveredKinship === 'You' ? 'You' : `${hoveredKinship} to you`}
              </p>
            )}
            {hovered.family_branch && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {hovered.family_branch}
              </p>
            )}
            {hovered.lifespan && (
              <p className="text-xs tabular-nums text-muted-foreground">{hovered.lifespan}</p>
            )}
            {hovered.isProxy && (
              <p className="mt-1 text-xs text-muted-foreground">Profile not yet claimed</p>
            )}
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-col gap-1 rounded-md border bg-card/90 p-1 shadow-sm backdrop-blur">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Center on the selected member"
            onClick={recentre}
          >
            <Crosshair className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Drag to move around. Click anyone to centre the tree on them, or use the arrows on a card
        to show their parents and children.
      </p>
    </div>
  )
}

function ExpandButton({
  direction,
  active,
  label,
  onClick,
}: {
  direction: 'up' | 'down'
  active: boolean
  label: string
  onClick: () => void
}) {
  const Icon = active ? Minus : direction === 'up' ? ChevronUp : ChevronDown
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'absolute left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-border bg-card text-muted-foreground'
          : 'border-transparent bg-[hsl(var(--success))] text-white'
      )}
      style={direction === 'up' ? { top: -10 } : { top: CARD_HEIGHT - 10 }}
    >
      <Icon className="h-3 w-3" />
    </button>
  )
}
