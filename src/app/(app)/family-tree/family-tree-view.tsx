'use client'

import { useMemo, useState } from 'react'
import calcTree from 'relatives-tree'
import type { RelData } from 'relatives-tree/lib/types'
import { ZoomIn, ZoomOut } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn, getInitials } from '@/lib/utils'
import type { FamilyTreeNode } from '@/lib/family-tree'

const NODE_WIDTH = 180
const NODE_HEIGHT = 96
const HALF_W = NODE_WIDTH / 2
const HALF_H = NODE_HEIGHT / 2

type MemberInfo = { name: string; photo_url: string | null; family_branch: string | null }

interface FamilyTreeViewProps {
  nodes: FamilyTreeNode[]
  members: Record<string, MemberInfo>
  defaultRootId: string
}

export function FamilyTreeView({ nodes, members, defaultRootId }: FamilyTreeViewProps) {
  const [rootId, setRootId] = useState(defaultRootId)
  const [zoom, setZoom] = useState(1)

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

  if (!tree) {
    return (
      <div className="space-y-3">
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

  return (
    <div className="space-y-3">
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
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)))}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.15).toFixed(2)))}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-auto rounded-lg border bg-muted/20" style={{ maxHeight: '70vh' }}>
        <div style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}>
          <div
            className="relative origin-top-left"
            style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})` }}
          >
            <svg className="absolute left-0 top-0" width={canvasWidth} height={canvasHeight}>
              {tree.connectors.map(([x1, y1, x2, y2], i) => (
                <line
                  key={i}
                  x1={x1 * HALF_W}
                  y1={y1 * HALF_H}
                  x2={x2 * HALF_W}
                  y2={y2 * HALF_H}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={2}
                />
              ))}
            </svg>
            {tree.nodes.map((node) => {
              const info = members[node.id]
              if (!info) return null
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setRootId(node.id)}
                  className={cn(
                    'absolute flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-left shadow-sm transition-shadow hover:shadow-md',
                    node.id === rootId && 'ring-2 ring-primary'
                  )}
                  style={{ left: node.left * HALF_W, top: node.top * HALF_H, width: NODE_WIDTH - 8 }}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    {info.photo_url && <AvatarImage src={info.photo_url} alt={info.name} />}
                    <AvatarFallback>{getInitials(info.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{info.name}</p>
                    {info.family_branch && (
                      <p className="truncate text-xs text-muted-foreground">{info.family_branch}</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
