/**
 * Projection and routing math for the architecture map.
 *
 * Pure and DOM-free so the node test suite can pin it, in the same spirit as
 * `lib/editor/maskGeometry`. Everything on the map — floor, buildings, edges,
 * payload dots — projects through `toScreen`, which is what keeps a building
 * and the grid cell it claims from ever disagreeing about where that cell is.
 *
 * The projection is the classic 2:1 dimetric: one grid step along `gx` moves
 * half a tile right and half a tile-height down, one step along `gy` mirrors
 * it leftward, and `z` is a straight lift. Integer grid coordinates are the
 * authoring format; fractions are legal everywhere (slab insets, fin pitches,
 * edge lanes on half-cell offsets).
 */

export const TILE_W = 48
export const TILE_H = 24
export const ELEV = 14

export type GridPt = { gx: number; gy: number }
export type ScreenPt = { x: number; y: number }

/** A claimed rectangle of cells: `w` runs along `gx`, `d` along `gy`. */
export type Footprint = { gx: number; gy: number; w: number; d: number }

export function toScreen(gx: number, gy: number, z = 0): ScreenPt {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2) - z * ELEV,
  }
}

/**
 * Painter's key: buildings render in ascending order of their front corner's
 * grid sum. Footprints never overlap (the graph test enforces it), so the rule
 * is sufficient — a building can only occlude one whose front corner sits
 * strictly behind its own. Ties break on `gx` for a stable sort.
 */
export function depthKey(fp: Footprint): number {
  return fp.gx + fp.w + fp.gy + fp.d
}

/** Half-open interval overlap on both axes — shared borders are legal. */
export function footprintsOverlap(a: Footprint, b: Footprint): boolean {
  return a.gx < b.gx + b.w && b.gx < a.gx + a.w && a.gy < b.gy + b.d && b.gy < a.gy + a.d
}

/**
 * An axis-aligned route from `a` to `b` through optional `via` waypoints.
 * Whenever two consecutive waypoints differ on both axes, an elbow is inserted
 * at (next.gx, current.gy) — gx first, then gy — so a plain two-point edge is
 * an L whose bend the author can flip by supplying the other corner as `via`.
 */
export function manhattan(a: GridPt, b: GridPt, via: GridPt[] = []): GridPt[] {
  const route: GridPt[] = [a]
  for (const next of [...via, b]) {
    const cur = route[route.length - 1]
    if (cur.gx !== next.gx && cur.gy !== next.gy) {
      route.push({ gx: next.gx, gy: cur.gy })
    }
    const tail = route[route.length - 1]
    if (tail.gx !== next.gx || tail.gy !== next.gy) route.push(next)
  }
  return route
}

/** The route, projected onto the floor. */
export function routeToPolyline(route: GridPt[]): ScreenPt[] {
  return route.map((p) => toScreen(p.gx, p.gy))
}

/**
 * Cumulative arc lengths, computed once per polyline so that placing a payload
 * dot is pure arithmetic — no `getPointAtLength`, no DOM read, no layout work
 * on the animation path.
 */
export function polylineLengths(pts: ScreenPt[]): { total: number; cum: number[] } {
  const cum: number[] = [0]
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  }
  return { total: cum[cum.length - 1], cum }
}

/** The point `len` px along the polyline, clamped to its ends. */
export function pointAtLength(pts: ScreenPt[], cum: number[], len: number): ScreenPt {
  const total = cum[cum.length - 1]
  const at = Math.max(0, Math.min(len, total))
  let i = 1
  while (i < cum.length - 1 && cum[i] < at) i++
  const span = cum[i] - cum[i - 1]
  const t = span === 0 ? 0 : (at - cum[i - 1]) / span
  return {
    x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
    y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
  }
}

/** SVG `points` attribute for a polyline/polygon. */
export function pointsAttr(pts: ScreenPt[]): string {
  return pts.map((p) => `${round2(p.x)},${round2(p.y)}`).join(' ')
}


function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * The screen box that contains every footprint at every height, for sizing the
 * scene's viewBox. Computed from data rather than authored, so repositioning a
 * building never silently crops the map.
 */
export function sceneBounds(
  items: { footprint: Footprint; height: number }[],
  margin = 48,
): { x: number; y: number; width: number; height: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const { footprint: fp, height } of items) {
    const corners = [
      toScreen(fp.gx, fp.gy, height),
      toScreen(fp.gx + fp.w, fp.gy, 0),
      toScreen(fp.gx + fp.w, fp.gy + fp.d, 0),
      toScreen(fp.gx, fp.gy + fp.d, 0),
    ]
    for (const c of corners) {
      minX = Math.min(minX, c.x)
      minY = Math.min(minY, c.y)
      maxX = Math.max(maxX, c.x)
      maxY = Math.max(maxY, c.y)
    }
  }
  return {
    x: minX - margin,
    y: minY - margin,
    width: maxX - minX + margin * 2,
    height: maxY - minY + margin * 2,
  }
}
