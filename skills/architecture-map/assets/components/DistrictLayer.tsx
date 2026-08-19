'use client'

import { pointsAttr, toScreen, type Footprint } from '../core/iso'
import type { District } from '../core/districts'
import { motion, paint, type as typeface } from './theme'

/**
 * The neighborhoods, drawn on the ground.
 *
 * Two layers rather than one, because they belong at opposite ends of the
 * paint order. Plates go down with the floor, under every building, so a plot
 * can never cover the thing standing on it. Flags go on last, because a
 * building hides whatever is behind it and a marker a tower can bury is no
 * marker at all.
 *
 * The flag is drawn flat rather than projected into the floor plane. Type laid
 * out isometrically has to be read at an angle *and* through a shear, which
 * costs more legibility than the depth cue is worth; a pole is enough to plant
 * a name on the ground. Pointing at a plot runs the flag up its pole — the
 * neighborhood puts its hand up.
 */

const POLE_REST = 46
const POLE_LIT = 68
const FLAG_H = 17
/** Monospace advance at the flag's 11px type. */
const CHAR_W = 6.6
const PAD_LEFT = 7
/** Wide enough to clear the swallowtail's notch. */
const PAD_RIGHT = 20
const NOTCH = 8

function plateCorners(rect: Footprint) {
  return [
    toScreen(rect.gx, rect.gy),
    toScreen(rect.gx + rect.w, rect.gy),
    toScreen(rect.gx + rect.w, rect.gy + rect.d),
    toScreen(rect.gx, rect.gy + rect.d),
  ]
}

export function DistrictPlates({
  districts,
  lit,
  flowLit,
  onHover,
}: {
  districts: District[]
  lit: string | null
  flowLit: boolean
  onHover: (id: string | null) => void
}) {
  return (
    <g>
      {districts.map((district) => {
        const isLit = lit === district.id
        return (
          <polygon
            key={district.id}
            points={pointsAttr(plateCorners(district.rect))}
            fill={isLit ? paint.accentWash : paint.border}
            fillOpacity={isLit ? 0.55 : flowLit ? 0.25 : 0.45}
            stroke={isLit ? paint.accent : paint.structure}
            strokeOpacity={isLit ? 0.9 : flowLit ? 0.25 : 0.5}
            strokeWidth={isLit ? 1.5 : 1}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{ transition: `fill-opacity ${motion.base}ms ${motion.ease}, stroke-opacity ${motion.base}ms ${motion.ease}` }}
            onPointerEnter={() => onHover(district.id)}
            onPointerLeave={() => onHover(null)}
          />
        )
      })}
    </g>
  )
}

export function DistrictFlags({
  districts,
  lit,
  flowLit,
}: {
  districts: District[]
  lit: string | null
  flowLit: boolean
}) {
  return (
    <g aria-hidden="true">
      {districts.map((district) => {
        const isLit = lit === district.id
        const at = toScreen(district.flagAt.gx, district.flagAt.gy)
        const poleH = isLit ? POLE_LIT : POLE_REST
        const flagY = -poleH - FLAG_H / 2
        const flagW = district.label.length * CHAR_W + PAD_LEFT + PAD_RIGHT
        const ink = isLit ? paint.accent : paint.structure

        return (
          <g
            key={district.id}
            transform={`translate(${at.x} ${at.y})`}
            opacity={isLit ? 1 : flowLit ? 0.4 : 0.9}
          >
            <ellipse cx={0} cy={0} rx={3.5} ry={1.75} fill={ink} />
            {/* A rect, not a line: x/y/width/height are the SVG geometry
                properties CSS can actually transition. */}
            <rect
              x={-0.75}
              width={1.5}
              fill={ink}
              style={{
                y: `${-poleH}px`,
                height: `${poleH}px`,
                transition: `y ${motion.base}ms ${motion.ease}, height ${motion.base}ms ${motion.ease}`,
              }}
            />
            <g
              transform={`translate(0 ${flagY})`}
              style={{ transition: `transform ${motion.base}ms ${motion.ease}` }}
            >
              {/* Swallowtail: the notch in the fly end is what makes the shape
                  read as a flag rather than a label on a stick. */}
              <path
                d={`M0 0 H${flagW} L${flagW - NOTCH} ${FLAG_H / 2} L${flagW} ${FLAG_H} H0 Z`}
                fill={isLit ? paint.accentWash : paint.surface}
                stroke={ink}
                strokeWidth={1}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={PAD_LEFT}
                y={FLAG_H / 2}
                dominantBaseline="central"
                fontFamily={typeface.mono}
                fontSize={11}
                letterSpacing={0.6}
                style={{ textTransform: 'uppercase' }}
                fill={isLit ? paint.accent : paint.inkSecondary}
              >
                {district.label}
              </text>
            </g>
          </g>
        )
      })}
    </g>
  )
}
