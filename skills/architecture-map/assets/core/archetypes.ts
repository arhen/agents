/**
 * Building shapes for the architecture map.
 *
 * Each archetype turns a footprint plus a few knobs into a list of screen-space
 * faces, back to front. The vocabulary is deliberately small and physical:
 *
 * - `slab-stack` — broad layers with an inset per level; the big subsystems
 *   that accreted (the pipeline, the design section).
 * - `tower` — one tall extrusion; deep single-purpose piles (the UI kit).
 * - `fin-row` — one thin fin per member; collections of similar things whose
 *   count is the point (the nine asset editors, the API routes).
 * - `cube` — an ordinary mid-rise for ordinary subsystems.
 * - `low-slab` — a flat plate; small libraries and the outside-world services.
 *
 * Pure functions of their inputs, like `iso.ts` — the React layer only maps
 * faces to `<polygon>`s. Face order within a building is already paint order:
 * boxes are emitted back to front, and within a box the two visible sides
 * come before the top.
 */

import { toScreen, type Footprint, type ScreenPt } from './iso'

export type Archetype = 'slab-stack' | 'tower' | 'fin-row' | 'cube' | 'low-slab'

export type FaceShade = 'top' | 'left' | 'right'

export type Face = {
  points: ScreenPt[]
  shade: FaceShade
  /** Fine line texture, used on the big shapes so their mass reads at a glance. */
  hatch?: boolean
}

export type ArchetypeParams = {
  /** slab-stack: how many layers. */
  levels?: number
  /** fin-row: how many fins. */
  count?: number
}

/**
 * The three visible faces of a box spanning the footprint between elevations
 * `z0` and `z1`. With the camera at the standard dimetric angle, the visible
 * sides are the two adjacent to the front corner (gx+w, gy+d).
 */
export function boxFaces(fp: Footprint, z0: number, z1: number, hatch = false): Face[] {
  const { gx, gy, w, d } = fp
  const a1 = toScreen(gx, gy, z1)
  const b1 = toScreen(gx + w, gy, z1)
  const c1 = toScreen(gx + w, gy + d, z1)
  const d1 = toScreen(gx, gy + d, z1)
  const b0 = toScreen(gx + w, gy, z0)
  const c0 = toScreen(gx + w, gy + d, z0)
  const d0 = toScreen(gx, gy + d, z0)
  return [
    { points: [d1, c1, c0, d0], shade: 'left', hatch },
    { points: [b1, c1, c0, b0], shade: 'right', hatch },
    { points: [a1, b1, c1, d1], shade: 'top' },
  ]
}

export function buildingFaces(
  archetype: Archetype,
  fp: Footprint,
  height: number,
  params: ArchetypeParams = {},
): Face[] {
  switch (archetype) {
    case 'cube':
    case 'low-slab':
      return boxFaces(fp, 0, height)
    case 'tower':
      return boxFaces(fp, 0, height, true)
    case 'slab-stack': {
      const levels = Math.max(1, params.levels ?? 3)
      const step = height / levels
      const inset = Math.min(fp.w, fp.d) * 0.35 / levels
      const faces: Face[] = []
      for (let i = 0; i < levels; i++) {
        const pad = inset * i
        faces.push(
          ...boxFaces(
            { gx: fp.gx + pad, gy: fp.gy + pad, w: fp.w - pad * 2, d: fp.d - pad * 2 },
            step * i,
            step * (i + 1),
            true,
          ),
        )
      }
      return faces
    }
    case 'fin-row': {
      const count = Math.max(1, params.count ?? 3)
      const pitch = fp.w / count
      const finW = pitch * 0.55
      const faces: Face[] = []
      for (let i = 0; i < count; i++) {
        faces.push(
          ...boxFaces({ gx: fp.gx + i * pitch, gy: fp.gy, w: finW, d: fp.d }, 0, height, true),
        )
      }
      return faces
    }
  }
}

/** Where the roof label chip sits: the top face's centre, lifted to full height. */
export function chipAnchor(fp: Footprint, height: number): ScreenPt {
  return toScreen(fp.gx + fp.w / 2, fp.gy + fp.d / 2, height)
}

/**
 * Where edges attach: the middle of the footprint's front corner cell, on the
 * floor. Stubbing every edge into the same corner is what lets the edge layer
 * paint under the buildings — a dot that reaches the stub disappears behind
 * the facade, which reads as entering the building.
 */
export function portAnchor(fp: Footprint): { gx: number; gy: number } {
  return { gx: fp.gx + fp.w / 2, gy: fp.gy + fp.d }
}
