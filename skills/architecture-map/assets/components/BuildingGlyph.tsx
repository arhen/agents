'use client'

import { memo } from 'react'
import { buildingFaces, chipAnchor } from '../core/archetypes'
import { pointsAttr } from '../core/iso'
import type { ArchNode } from '../core/types'
import { motion, paint, type as typeface } from './theme'

/**
 * One subsystem, extruded.
 *
 * Paint comes from `theme.ts` through SVG attributes rather than classes, so
 * the map re-themes with the app and works in a repo with no utility CSS at
 * all. The face ramp is deliberately flat — top, one lit wall, one shaded —
 * because the buildings have to read as mass at a glance, not as renders.
 *
 * The roof chip answers "which building is this" at two levels of attention: a
 * short code at rest, the full name whenever the building matters right now.
 * The expanded width is arithmetic rather than measurement, because the label
 * is set in a monospace face — 0.6em per character.
 */

const FACE = {
  top: paint.surface,
  left: paint.border,
  right: `color-mix(in srgb, ${paint.structure} 40%, ${paint.surface})`,
} as const

const CHIP_ADVANCE = 3

export type BuildingState = 'rest' | 'hover' | 'selected'

function strokeFor(state: BuildingState): string {
  if (state === 'selected') return paint.accent
  if (state === 'hover') return paint.inkPrimary
  return paint.structure
}

function BuildingGlyphInner({
  node,
  state,
  dimmed,
  visited,
  narrated,
  onSelect,
  onHover,
}: {
  node: ArchNode
  state: BuildingState
  /** True while a flow is lit and this building is not on it. */
  dimmed: boolean
  /** The narration has already arrived here this cycle. */
  visited: boolean
  /** The beat being told right now is about this building. */
  narrated: boolean
  onSelect: () => void
  onHover: (hovering: boolean) => void
}) {
  const faces = buildingFaces(node.archetype, node.footprint, node.height, node.params)
  const chip = chipAnchor(node.footprint, node.height)
  const effective: BuildingState = state === 'rest' && narrated ? 'hover' : state
  const stroke = strokeFor(effective)

  const expanded = effective !== 'rest'
  const label = expanded ? `${node.code} · ${node.name}` : node.code
  const half = 7 + label.length * CHIP_ADVANCE + (expanded ? 2 : 3)
  const chipStroke = effective === 'selected' || (visited && effective === 'rest') ? paint.accent : paint.structure

  return (
    <g
      role="button"
      tabIndex={-1}
      aria-label={node.name}
      style={{ cursor: 'pointer', outline: 'none', transition: `opacity ${motion.base}ms ${motion.ease}` }}
      opacity={dimmed ? 0.35 : 1}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      {faces.map((face, i) => (
        <g key={i}>
          <polygon
            points={pointsAttr(face.points)}
            fill={FACE[face.shade]}
            stroke={stroke}
            strokeWidth={effective === 'rest' ? 1 : 1.5}
            strokeOpacity={effective === 'rest' ? 0.75 : 1}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{ transition: `stroke ${motion.hover}ms ease-in-out, stroke-width ${motion.hover}ms ease-in-out` }}
          />
          {face.hatch && face.shade !== 'top' && (
            <polygon points={pointsAttr(face.points)} fill="url(#am-hatch)" stroke="none" />
          )}
        </g>
      ))}

      <g transform={`translate(${chip.x} ${chip.y - 12})`}>
        <rect
          x={-half}
          y={-9}
          width={half * 2}
          height={18}
          rx={4}
          fill={paint.surface}
          stroke={chipStroke}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily={typeface.mono}
          fontSize={10}
          style={{ textTransform: 'uppercase' }}
          fill={effective === 'selected' ? paint.accent : paint.inkPrimary}
        >
          {label}
        </text>
      </g>
    </g>
  )
}

/** Memoised: with two dozen buildings re-rendering on every hover, the map stutters on paper cuts. */
export default memo(BuildingGlyphInner)
