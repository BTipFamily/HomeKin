'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import calcTree from 'relatives-tree'
import type { RelData } from 'relatives-tree/lib/types'
import { Crosshair, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { FamilyTreeNode } from '@/lib/family-tree'
import { CARD_HEIGHT, CARD_WIDTH, TreeCard, type TreeCardMember } from './tree-card'

/** The slot each node occupies. Cards are centred inside it; the surplus is the gutter. */
const NODE_WIDTH = 136
const NODE_HEIGHT = 196
const HALF_W = NODE_WIDTH / 2
const HALF_H = NODE_HEIGHT / 2
const CARD_OFFSET_X = (NODE_WIDTH - CARD_WIDTH) / 2
const CARD_OFFSET_Y = (NODE_HEIGHT - CARD_HEIGHT) / 2

/** relatives-tree lays out on a grid where one node is SIZE units across. */
const UNIT_SIZE = 2

const MIN_ZOOM = 0.4
const MAX_ZOOM = 1.6
const ZOOM_STEP = 0.15

export type TreeMember = TreeCardMember & {
  /** What this person is to the signed-in member, e.g. "Aunt". Null when unrelated. */
  kinship: string | null
}

interface FamilyTreeViewProps {
  nodes: FamilyTreeNode[]
  members: Record<string, TreeMember>
  defaultRootId: string
}

export function FamilyTreeView({ nodes, members, defaultRootId }: FamilyTreeViewProps) {
  const [rootId, setRootId] = useState(defaultRootId)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const viewportRef = useRef<HTMLDivElement>(null)
  const dragOrigin = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  const tree: RelData | null = useMemo(() => {
    try {
      // relatives-tree's Node type uses a `const enum` for gender/relation
      // types that can't cross a module boundary under isolatedModules; our
      // plain-string node shape (family-tree.ts) is structurally identical
      // to it at runtime, so we cast at this single boundary.
      return calcTree(nodes as never, { rootId })
    } catch {
      // relatives-tree can still throw on relationship shapes it doesn't
      // model well (e.g. certain remarriage/half-sibling combinations) —
      // fail into a message instead of crashing the whole page.
      return null
    }
  }, [nodes, rootId])

  const sortedMembers = useMemo(
    () => Object.entries(members).sort((a, b) => a[1].name.localeCompare(b[1].name)),
    [members]
  )

  /** Spouse edges keyed by member, read from our own node shape rather than
      relatives-tree's (whose `const enum` types don't survive the cast). */
  const spousesById = useMemo(() => new Map(nodes.map((n) => [n.id, n.spouses])), [nodes])

  /** Centres the viewport on whoever is currently the root. */
  const recentre = useCallback(() => {
    if (!tree) return
    const focus = tree.nodes.find((n) => n.id === rootId)
    const viewport = viewportRef.current
    if (!focus || !viewport) return

    const cardCentreX = focus.left * HALF_W + CARD_OFFSET_X + CARD_WIDTH / 2
    const cardCentreY = focus.top * HALF_H + CARD_OFFSET_Y + CARD_HEIGHT / 2

    setPan({
      x: viewport.clientWidth / 2 - cardCentreX * zoom,
      y: viewport.clientHeight / 2 - cardCentreY * zoom,
    })
  }, [tree, rootId, zoom])

  // Re-centre when the focus person changes, but not on every zoom nudge —
  // zooming should keep you where you were looking.
  useEffect(() => {
    recentre()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootId, tree])

  const onPointerDown = (e: React.PointerEvent) => {
    // Only pan from the background; a pointerdown on a card is a click on it.
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

  const centreOnSelect = (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm text-muted-foreground" htmlFor="center-on">
        Center on
      </label>
      <select
        id="center-on"
        value={rootId}
        onChange={(e) => setRootId(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        {sortedMembers.map(([id, m]) => (
          <option key={id} value={id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  )

  if (!tree) {
    return (
      <div className="space-y-3">
        {centreOnSelect}
        <div className="rounded-lg border bg-muted/20 py-16 text-center text-muted-foreground">
          <p>This family&apos;s tree can&apos;t be drawn from here.</p>
          <p className="mt-1 text-sm">
            This usually happens when someone has an unusual set of recorded relationships (for
            example, more than two parents). Try centering on a different member, or check that
            relationship for a possible duplicate or mistake.
          </p>
        </div>
      </div>
    )
  }

  const canvasWidth = tree.canvas.width * HALF_W + NODE_WIDTH
  const canvasHeight = tree.canvas.height * HALF_H + NODE_HEIGHT

  // Node lookup by grid position, used to recognise which connector segments
  // are the short horizontal bond drawn between two partners.
  const nodeAtPosition = new Map(tree.nodes.map((n) => [`${n.left},${n.top}`, n]))

  /** A partner bond spans exactly one node width at the vertical middle of a row. */
  const partnerBondFor = (x1: number, y1: number, x2: number, y2: number) => {
    if (y1 !== y2 || x2 - x1 !== UNIT_SIZE) return null
    const left = nodeAtPosition.get(`${x1 - 1},${y1 - 1}`)
    const right = nodeAtPosition.get(`${x2 - 1},${y1 - 1}`)
    if (!left || !right) return null
    const edge = spousesById.get(left.id)?.find((s) => s.id === right.id)
    return edge ?? null
  }

  const hovered = hoveredId ? members[hoveredId] : null
  const hoveredNode = hoveredId ? tree.nodes.find((n) => n.id === hoveredId) : null

  return (
    <div className="space-y-3">
      {centreOnSelect}

      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative overflow-hidden rounded-lg border touch-none select-none"
        style={{
          height: '70vh',
          background: 'hsl(var(--tree-canvas))',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: canvasWidth,
            height: canvasHeight,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <svg
            className="absolute left-0 top-0 overflow-visible"
            width={canvasWidth}
            height={canvasHeight}
            aria-hidden="true"
          >
            {tree.connectors.map(([x1, y1, x2, y2], i) => {
              const bond = partnerBondFor(x1, y1, x2, y2)
              return (
                <line
                  key={i}
                  x1={x1 * HALF_W}
                  y1={y1 * HALF_H}
                  x2={x2 * HALF_W}
                  y2={y2 * HALF_H}
                  stroke="hsl(var(--tree-line))"
                  strokeWidth={bond ? 2 : 1.5}
                  strokeLinecap="round"
                  // A partnership that ended is drawn broken. Other
                  // parent-child kinds (step, adopted) can't be told apart
                  // from this flat connector list — they wait for the layout
                  // engine to be ours.
                  strokeDasharray={bond?.type === 'divorced' ? '4 4' : undefined}
                />
              )
            })}
          </svg>

          {tree.nodes.map((node) => {
            const member = members[node.id]
            if (!member) return null
            return (
              <div
                key={node.id}
                className="absolute"
                style={{
                  left: node.left * HALF_W + CARD_OFFSET_X,
                  top: node.top * HALF_H + CARD_OFFSET_Y,
                }}
              >
                <TreeCard
                  member={member}
                  isFocus={node.id === rootId}
                  onSelect={() => setRootId(node.id)}
                  onHoverChange={(isHovered) => setHoveredId(isHovered ? node.id : null)}
                />
              </div>
            )
          })}
        </div>

        {/* Hover detail. Positioned in screen space rather than inside the
            transformed layer so the text stays the same size at any zoom. */}
        {hovered && hoveredNode && (
          <div
            className="pointer-events-none absolute z-10 w-52 rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-lg"
            style={{
              left: Math.max(
                8,
                (hoveredNode.left * HALF_W + CARD_OFFSET_X) * zoom + pan.x + (CARD_WIDTH * zoom) / 2 - 104
              ),
              top:
                (hoveredNode.top * HALF_H + CARD_OFFSET_Y + CARD_HEIGHT) * zoom + pan.y + 8,
            }}
          >
            <p className="truncate text-sm font-semibold">{hovered.name}</p>
            {hovered.kinship && (
              <p className="text-xs font-medium text-primary">{hovered.kinship}</p>
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

        {/* Canvas controls */}
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
        Drag to move around the tree. Click anyone to centre the tree on them.
      </p>
    </div>
  )
}
