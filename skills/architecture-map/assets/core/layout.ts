import type { Archetype, ArchetypeParams } from './archetypes'
import type { Footprint } from './iso'

/**
 * Where the buildings stand and how big they are — derived from the
 * measurement rather than placed by hand.
 *
 * The version of this map that was hand-authored looked better for about a
 * week. Then a module tripled in size and its building stayed the same height,
 * because the height was a number somebody typed. Deriving the geometry from
 * what the scanner counts means the skyline re-proportions itself as the code
 * moves, and nobody has to remember to nudge it.
 *
 * What is derived: footprint, height, and archetype. What stays authored:
 * which modules exist, what they are called, what they do, and which of them
 * a flow travels through. No measurement can answer those.
 *
 * The output is plain data. A footprint that lands somewhere ugly can be
 * overridden in the authored table without fighting this file — the merge
 * prefers whatever a human wrote.
 */

/** What the scanner knows about one module. */
export type Measure = { count: number; loc: number }

/** Heights are a log ladder: a module ten times bigger is not ten times taller. */
const MIN_HEIGHT = 1
const MAX_HEIGHT = 6

export function deriveHeight({ loc }: Measure): number {
  if (loc <= 0) return MIN_HEIGHT
  const steps = Math.log2(loc / 180 + 1) * 1.25
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(steps)))
}

/**
 * The shape a module *is*, read off how its code is distributed.
 *
 * - Many files of similar size — a collection whose count is the point.
 *   Nine asset editors, twenty route handlers. Drawn as a row of fins.
 * - One dominant file — a deep single-purpose pile. Drawn as a tower.
 * - Lots of code across many files — something that accreted in layers.
 *   Drawn as a stepped stack.
 * - A handful of small files — an ordinary mid-rise.
 * - Almost nothing — a plate on the floor. Small libraries, and the
 *   outside-world services that are not code in this repo at all.
 */
export function deriveArchetype({ count, loc }: Measure): {
  archetype: Archetype
  params?: ArchetypeParams
} {
  if (count === 0 || loc < 60) return { archetype: 'low-slab' }
  const average = loc / count

  if (count >= 6 && average < 260) {
    // Fins get crowded past a dozen; beyond that the row reads as a comb.
    return { archetype: 'fin-row', params: { count: Math.min(count, 12) } }
  }
  if (count >= 5 && loc > 1200) {
    return { archetype: 'slab-stack', params: { levels: Math.min(2 + Math.floor(loc / 1800), 5) } }
  }
  if (count <= 2 && average > 400) return { archetype: 'tower' }
  return { archetype: 'cube' }
}

/** How much floor a building claims, before anything is placed. */
export function deriveSize(
  archetype: Archetype,
  params: ArchetypeParams | undefined,
  measure: Measure,
): { w: number; d: number } {
  switch (archetype) {
    case 'fin-row':
      // A full cell of pitch per fin. Tighter than this and a dozen members
      // read as one hatched wall instead of a row you can count.
      return { w: Math.max(3, params?.count ?? 3), d: 2 }
    case 'tower':
      return { w: 2, d: 2 }
    case 'slab-stack':
      return { w: 3, d: 3 }
    case 'low-slab':
      return { w: 3, d: 2 }
    case 'cube':
      return measure.loc > 700 ? { w: 3, d: 2 } : { w: 2, d: 2 }
  }
}

/* ------------------------------------------------------------- packing */

/**
 * Room between buildings inside a plot, and between the plots themselves.
 *
 * The district figure is not decoration. `deriveDistricts` grows each plate
 * past its buildings — 1.2 cells on three sides, 2.2 at the front where the
 * flag stands — so two plots packed closer than the sum of those paddings
 * produce *overlapping plates*, and the neighborhoods stop reading as separate
 * places. 6 clears 1.2 + 2.2 with room to spare, which is what lets a reader
 * see the seams.
 */
const BUILDING_GAP = 1.5
const DISTRICT_GAP = 6

type Placed<T> = { item: T; footprint: Footprint }
type Box = { w: number; d: number }

/**
 * Shelf packing: fill a row left to right until it would pass `maxWidth`,
 * then start the next row behind it. Deterministic, and good enough for the
 * dozen-odd buildings a readable district holds — the alternative is a
 * bin-packer whose output nobody can predict from one run to the next.
 */
function shelfPack<T>(items: { item: T; size: Box }[], maxWidth: number, gap: number): {
  placed: Placed<T>[]
  size: Box
} {
  const placed: Placed<T>[] = []
  let gx = 0
  let gy = 0
  let rowDepth = 0
  let widest = 0

  for (const { item, size } of items) {
    if (gx > 0 && gx + size.w > maxWidth) {
      gy += rowDepth + gap
      gx = 0
      rowDepth = 0
    }
    placed.push({ item, footprint: { gx, gy, w: size.w, d: size.d } })
    gx += size.w + gap
    rowDepth = Math.max(rowDepth, size.d)
    widest = Math.max(widest, gx - gap)
  }

  return { placed, size: { w: widest, d: gy + rowDepth } }
}

/** Roughly square is what reads best on a diamond grid. */
function targetWidth(sizes: Box[], gap: number): number {
  const area = sizes.reduce((sum, s) => sum + (s.w + gap) * (s.d + gap), 0)
  const side = Math.sqrt(area)
  return Math.max(Math.ceil(side), Math.max(...sizes.map((s) => s.w), 1))
}

export type LayoutInput<T> = { item: T; group: string; size: Box }

/**
 * Place every building on the world grid: pack each neighborhood on its own,
 * then pack the neighborhoods against each other in the order they are given
 * — which is the order the legend lists them, so reading down the rail walks
 * you across the map.
 */
export function packLayout<T>(
  inputs: LayoutInput<T>[],
  groupOrder: readonly string[],
): Map<T, Footprint> {
  const districts = groupOrder
    .map((group) => inputs.filter((i) => i.group === group))
    .filter((members) => members.length > 0)

  // Each plot, packed in isolation and biggest first so the small ones fill in.
  const packedDistricts = districts.map((members) => {
    const sorted = [...members].sort((a, b) => b.size.w * b.size.d - a.size.w * a.size.d)
    return shelfPack(
      sorted.map((m) => ({ item: m.item, size: m.size })),
      targetWidth(sorted.map((m) => m.size), BUILDING_GAP),
      BUILDING_GAP,
    )
  })

  // Then the plots themselves, on the same rule one scale up.
  // The gap here is what keeps the plates apart, not the target width — the
  // width only decides how many plots share a row.
  const plots = shelfPack(
    packedDistricts.map((d, i) => ({ item: i, size: d.size })),
    targetWidth(packedDistricts.map((d) => d.size), DISTRICT_GAP),
    DISTRICT_GAP,
  )

  const out = new Map<T, Footprint>()
  plots.placed.forEach(({ item: districtIndex, footprint: plot }) => {
    for (const { item, footprint } of packedDistricts[districtIndex].placed) {
      out.set(item, {
        gx: plot.gx + footprint.gx,
        gy: plot.gy + footprint.gy,
        w: footprint.w,
        d: footprint.d,
      })
    }
  })
  return out
}
