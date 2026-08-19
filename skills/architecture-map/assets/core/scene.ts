import { deriveDistricts, type District } from './districts'
import { depthKey, sceneBounds, toScreen, type Footprint, type ScreenPt } from './iso'
import type { ArchNode, Group } from './types'

/**
 * What the canvas is looking at: a list of buildings in paint order, a floor to
 * rule, the plots, and a box for the camera to frame.
 *
 * Pure and DOM-free, so the geometry can be pinned by tests and the component
 * keeps nothing but interaction.
 */

export type Scene = {
  /** Identity, for camera keys and the cross-fade between scenes. */
  key: string
  shapes: ArchNode[]
  districts: District[]
  grid: GridLine[]
  bounds: ReturnType<typeof sceneBounds>
}

export type GridLine = { key: string; a: ScreenPt; b: ScreenPt }

export function buildScene(
  groups: readonly Group[],
  nodes: readonly ArchNode[],
  key = 'system',
): Scene {
  // Painter's algorithm: back to front, so a building can only ever occlude
  // one whose front corner sits strictly behind its own.
  const shapes = [...nodes].sort(
    (a, b) => depthKey(a.footprint) - depthKey(b.footprint) || a.footprint.gx - b.footprint.gx,
  )
  const districts = deriveDistricts(groups, nodes)

  // Plots extend past the buildings they hold, so the camera has to frame them
  // too — fitting to the buildings alone crops the plots and their flags.
  const extents = [
    ...shapes.map((s) => ({ footprint: s.footprint, height: s.height })),
    ...districts.map((d) => ({ footprint: d.rect, height: 0 })),
  ]

  return {
    key,
    shapes,
    districts,
    grid: gridLines(extents.map((e) => e.footprint)),
    bounds: sceneBounds(extents),
  }
}

/**
 * The floor. Snapped to whole cells: plot rects carry fractional padding, and a
 * grid ruled on those fractions would no longer line up with the buildings.
 */
function gridLines(footprints: Footprint[]): GridLine[] {
  if (footprints.length === 0) return []
  let minGx = Infinity
  let maxGx = -Infinity
  let minGy = Infinity
  let maxGy = -Infinity
  for (const fp of footprints) {
    minGx = Math.min(minGx, fp.gx)
    maxGx = Math.max(maxGx, fp.gx + fp.w)
    minGy = Math.min(minGy, fp.gy)
    maxGy = Math.max(maxGy, fp.gy + fp.d)
  }
  const x0 = Math.floor(minGx) - 2
  const x1 = Math.ceil(maxGx) + 2
  const y0 = Math.floor(minGy) - 2
  const y1 = Math.ceil(maxGy) + 2

  const lines: GridLine[] = []
  for (let gx = x0; gx <= x1; gx++) lines.push({ key: `x${gx}`, a: toScreen(gx, y0), b: toScreen(gx, y1) })
  for (let gy = y0; gy <= y1; gy++) lines.push({ key: `y${gy}`, a: toScreen(x0, gy), b: toScreen(x1, gy) })
  return lines
}

/* ------------------------------------------------------------------ camera */

export type Camera = { x: number; y: number; k: number }

export const MIN_ZOOM = 0.4
export const MAX_ZOOM = 3

export function clampZoom(k: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k))
}

/** The camera that frames the whole scene in a viewport of `w × h`. */
export function fitCamera(w: number, h: number, bounds: Scene['bounds']): Camera {
  const k = clampZoom(Math.min(w / bounds.width, h / bounds.height, 1.3))
  return {
    k,
    x: (w - bounds.width * k) / 2 - bounds.x * k,
    y: (h - bounds.height * k) / 2 - bounds.y * k,
  }
}

/** Zoom by `factor` about a fixed screen point, so that point stays put. */
export function zoomAbout(cam: Camera, factor: number, px: number, py: number): Camera {
  const k = clampZoom(cam.k * factor)
  const f = k / cam.k
  return { k, x: px - (px - cam.x) * f, y: py - (py - cam.y) * f }
}
