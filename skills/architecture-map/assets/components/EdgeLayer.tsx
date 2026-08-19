'use client'

import { arrowhead, type EdgeGeometry } from '../core/routes'
import { pointsAttr } from '../core/iso'
import { edgeTenses, positionAt, type EdgeTense, type FlowProgram } from '../core/program'
import type { ArchEdge } from '../core/types'
import { useClockTimeMs } from '../stores/useFlowClock'
import type { Selection } from '../stores/useMapView'
import { motion, paint, type as typeface } from './theme'

/**
 * The call paths, and the payload travelling one.
 *
 * Edges paint *under* the buildings, which is the whole reason the port anchor
 * sits at a footprint's front corner: a dot reaching a facade disappears into
 * the module rather than sliding over its roof. That reads as entering.
 *
 * A line's weight says what it is — solid for a call, dashed for a retry, thin
 * grey for support wiring — and its *tense* says where the story is: the edge
 * being travelled marches, the ones already walked stay lit, the rest wait.
 */

const DASH: Record<string, string | undefined> = {
  call: undefined,
  data: undefined,
  support: '4 4',
  retry: '2 5',
}

function paintFor(
  edge: ArchEdge,
  tense: EdgeTense | null,
  emphasized: boolean,
  flowLit: boolean,
): { stroke: string; width: number; opacity: number } {
  if (tense === 'current') return { stroke: paint.accent, width: 2, opacity: 1 }
  if (tense === 'visited') return { stroke: paint.accent, width: 1.5, opacity: 0.75 }
  if (tense === 'upcoming') return { stroke: paint.structure, width: 1, opacity: 0.5 }
  if (emphasized) return { stroke: paint.inkPrimary, width: 1.5, opacity: 1 }
  return { stroke: paint.structure, width: 1, opacity: flowLit ? 0.2 : 0.6 }
}

export default function EdgeLayer({
  edges,
  geometry,
  program,
  beatIndex,
  hover,
  selection,
  onSelect,
  onHover,
}: {
  edges: readonly ArchEdge[]
  geometry: ReadonlyMap<string, EdgeGeometry>
  program: FlowProgram | null
  beatIndex: number
  hover: Selection | null
  selection: Selection | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const tenses = edgeTenses(program, beatIndex)

  return (
    <g>
      {edges.map((edge) => {
        const geom = geometry.get(edge.id)
        if (!geom) return null
        const tense = tenses.get(edge.id) ?? null
        const emphasized =
          (hover?.kind === 'edge' && hover.id === edge.id) ||
          (selection?.kind === 'edge' && selection.id === edge.id)
        const style = paintFor(edge, tense, emphasized, program !== null)
        const head = edge.kind === 'support' ? null : arrowhead(geom)

        return (
          <g key={edge.id}>
            <polyline
              points={pointsAttr(geom.pts)}
              fill="none"
              stroke={style.stroke}
              strokeWidth={style.width}
              strokeOpacity={style.opacity}
              strokeDasharray={tense === 'current' ? '10 8' : DASH[edge.kind]}
              vectorEffect="non-scaling-stroke"
              style={{
                transition: `stroke-opacity ${motion.base}ms ${motion.ease}`,
                animation: tense === 'current' ? `am-dash 0.5s linear infinite` : undefined,
              }}
            />
            {head && (
              <path
                d="M 0 0 L -7 3.4 L -7 -3.4 Z"
                transform={`translate(${head.at.x} ${head.at.y}) rotate(${head.angle})`}
                fill={style.stroke}
                fillOpacity={style.opacity}
              />
            )}
            {/* A 1px line is not a click target anyone should have to hit. */}
            <polyline
              points={pointsAttr(geom.pts)}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation()
                onSelect(edge.id)
              }}
              onPointerEnter={() => onHover(edge.id)}
              onPointerLeave={() => onHover(null)}
            >
              <title>{edge.label}</title>
            </polyline>
          </g>
        )
      })}
    </g>
  )
}

/**
 * The travelling payload, and a number on each step so the order is readable.
 *
 * This is the only component that subscribes to the millisecond clock — the
 * dot moves every frame, and nothing else on the map needs to.
 */
export function FlowChoreography({
  program,
  beatIndex,
}: {
  program: FlowProgram | null
  beatIndex: number
}) {
  const timeMs = useClockTimeMs()
  if (!program) return null
  const at = positionAt(program, timeMs)

  return (
    <g aria-hidden="true">
      {program.beats.map((beat, i) => {
        if (beat.kind !== 'travel') return null
        const geom = program.geoms[beat.edgeIndex]
        const mid = geom.pts[Math.floor(geom.pts.length / 2)]
        const done = i < beatIndex
        return (
          <g key={beat.edgeId} opacity={done || i === beatIndex ? 1 : 0.45}>
            <circle
              cx={mid.x}
              cy={mid.y}
              r={8}
              fill={paint.surface}
              stroke={i === beatIndex ? paint.accent : paint.structure}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={mid.x}
              y={mid.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily={typeface.mono}
              fontSize={9}
              fill={i === beatIndex ? paint.accent : paint.inkTertiary}
            >
              {beat.edgeIndex + 1}
            </text>
          </g>
        )
      })}

      <circle cx={at.x} cy={at.y} r={5} fill={paint.accent} />
      <circle cx={at.x} cy={at.y} r={9} fill={paint.accent} opacity={0.25} />
    </g>
  )
}
