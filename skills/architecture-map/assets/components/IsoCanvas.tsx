'use client'

import { useEffect, useMemo } from 'react'
import { buildEdgeGeometry } from '../core/routes'
import { buildFlowProgram, currentTargetNodeId, flowNodeIdSet, visitedNodeIds } from '../core/program'
import { buildScene } from '../core/scene'
import type { ArchEdge, ArchFlow, ArchNode, Group } from '../core/types'
import { configureClock, useClockBeatIndex } from '../stores/useFlowClock'
import { useMapCamera } from '../stores/useMapCamera'
import { select, setHover, setHoverGroup, useMapView } from '../stores/useMapView'
import BuildingGlyph, { type BuildingState } from './BuildingGlyph'
import { DistrictFlags, DistrictPlates } from './DistrictLayer'
import EdgeLayer, { FlowChoreography } from './EdgeLayer'
import { paint } from './theme'

/**
 * The stage: one SVG, one camera, one scene.
 *
 * The camera is a translate+scale on a single group, in *element pixels* — the
 * SVG has no viewBox, so client coordinates and user units are the same thing
 * and the gesture math never has to guess what `preserveAspectRatio` did.
 *
 * Paint order is the whole trick. Plates go down with the floor so a plot never
 * covers what stands on it; edges run under the buildings so a payload reaching
 * a facade disappears *into* the module; flags and step numbers go on last,
 * because a marker a tower can bury is no marker.
 */

function stateOf(id: string, hover: ReturnType<typeof useMapView>['hover'], selection: ReturnType<typeof useMapView>['selection']): BuildingState {
  if (selection?.kind === 'node' && selection.id === id) return 'selected'
  if (hover?.kind === 'node' && hover.id === id) return 'hover'
  return 'rest'
}

export default function IsoCanvas({
  groups,
  nodes,
  edges,
  flows,
}: {
  groups: readonly Group[]
  nodes: readonly ArchNode[]
  edges: readonly ArchEdge[]
  flows: readonly ArchFlow[]
}) {
  const view = useMapView()
  // Only the beat index here — it changes about once a second. The payload
  // subscribes to the millisecond clock itself, so a 60fps dot does not drag
  // two dozen buildings through a re-render with it.
  const beatIndex = useClockBeatIndex()

  const scene = useMemo(() => buildScene(groups, nodes), [groups, nodes])
  const geometry = useMemo(() => buildEdgeGeometry(nodes, edges), [nodes, edges])
  const program = useMemo(() => {
    const flow = flows.find((f) => f.id === view.activeFlowId)
    return flow ? buildFlowProgram(flow, nodes, edges, geometry) : null
  }, [flows, view.activeFlowId, nodes, edges, geometry])

  // The clock is told what to narrate here, where the program is built; the
  // cleanup is what stops a flow that was playing when the page unmounts.
  useEffect(() => {
    configureClock(program)
    return () => configureClock(null)
  }, [program])

  const { attachRef, camera, smooth, zoomBy, panBy, recentre, surfaceProps } = useMapCamera(
    scene,
    view.resetTick,
  )

  const flowSet = program ? flowNodeIdSet(program) : null
  const visited = program && beatIndex >= 0 ? visitedNodeIds(program, beatIndex) : null
  const target = program && beatIndex >= 0 ? currentTargetNodeId(program, beatIndex) : null

  // A neighborhood lights when it is pointed at, or when the thing being
  // pointed at lives there — so rail and floor always agree.
  const litGroup =
    view.hoverGroup ??
    (view.selection?.kind === 'node'
      ? (nodes.find((n) => n.id === view.selection?.id)?.group ?? null)
      : null)

  const onKeyDown = (e: React.KeyboardEvent) => {
    const nudge = e.shiftKey ? 120 : 40
    switch (e.key) {
      case '+': case '=': zoomBy(1.25); break
      case '-': zoomBy(1 / 1.25); break
      case '0': recentre(); break
      case 'ArrowLeft': panBy(nudge, 0); break
      case 'ArrowRight': panBy(-nudge, 0); break
      case 'ArrowUp': panBy(0, nudge); break
      case 'ArrowDown': panBy(0, -nudge); break
      default: return
    }
    e.preventDefault()
  }

  return (
    <div
      ref={attachRef}
      tabIndex={0}
      role="application"
      aria-label="System map"
      onKeyDown={onKeyDown}
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        touchAction: 'none',
        userSelect: 'none',
        outline: 'none',
      }}
    >
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        onClick={() => select(null)}
        {...surfaceProps}
      >
        <defs>
          <pattern id="am-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke={paint.structure} strokeWidth="0.6" strokeOpacity="0.3" />
          </pattern>
        </defs>

        {camera && (
          <g
            transform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}
            /* Stepped zoom and recentring glide so you keep your bearings; a
               drag or a wheel must track the hand exactly, so `smooth` is
               false for those and the transition is simply absent. */
            style={smooth ? { transition: 'transform 200ms cubic-bezier(0.32, 0.72, 0, 1)' } : undefined}
          >
            <g aria-hidden="true">
              {scene.grid.map(({ key, a, b }) => (
                <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={paint.border} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
            </g>

            <DistrictPlates
              districts={scene.districts}
              lit={litGroup}
              flowLit={program !== null}
              onHover={setHoverGroup}
            />

            <EdgeLayer
              edges={edges}
              geometry={geometry}
              program={program}
              beatIndex={beatIndex}
              hover={view.hover}
              selection={view.selection}
              onSelect={(id) => select({ kind: 'edge', id })}
              onHover={(id) => setHover(id ? { kind: 'edge', id } : null)}
            />

            {scene.shapes.map((node) => (
              <BuildingGlyph
                key={node.id}
                node={node}
                state={stateOf(node.id, view.hover, view.selection)}
                dimmed={flowSet !== null && !flowSet.has(node.id)}
                visited={visited?.has(node.id) ?? false}
                narrated={target === node.id}
                onSelect={() => select({ kind: 'node', id: node.id })}
                onHover={(hovering) => setHover(hovering ? { kind: 'node', id: node.id } : null)}
              />
            ))}

            <DistrictFlags districts={scene.districts} lit={litGroup} flowLit={program !== null} />
            <FlowChoreography program={program} beatIndex={beatIndex} />
          </g>
        )}
      </svg>
    </div>
  )
}
