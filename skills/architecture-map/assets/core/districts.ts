import type { Group, ArchNode } from './types'
import type { Footprint, GridPt } from './iso'

/**
 * The neighborhoods: one plot of floor per group, named on the ground.
 *
 * Rects are *derived*, never authored — each is the bounding box of the
 * group's buildings plus padding. A hand-written rect would be a second claim
 * about where a group lives, and the moment a building moved the two would
 * disagree.
 *
 * The padding is deliberately asymmetric: the *front* edge gets extra room,
 * because that is where the plot plants its flag. The flag stands at the
 * front-left corner for a geometric reason rather than a stylistic one — a
 * building hides whatever lies on the floor behind it, so a marker at a
 * district's back edge is buried by that district's own towers. Planted at the
 * front, every building rises *away* from it.
 */

const PAD = 1.2
const PAD_FRONT = 2.2

export type District = {
  id: string
  label: string
  rect: Footprint
  /** Where the flagpole is planted: the plot's near-left corner. */
  flagAt: GridPt
  nodeIds: string[]
}

function derive(group: Group, nodes: readonly ArchNode[]): District | null {
  const members = nodes.filter((node) => node.group === group.id)
  if (members.length === 0) return null

  let gx0 = Infinity
  let gy0 = Infinity
  let gx1 = -Infinity
  let gy1 = -Infinity
  for (const { footprint: fp } of members) {
    gx0 = Math.min(gx0, fp.gx)
    gy0 = Math.min(gy0, fp.gy)
    gx1 = Math.max(gx1, fp.gx + fp.w)
    gy1 = Math.max(gy1, fp.gy + fp.d)
  }

  const rect: Footprint = {
    gx: gx0 - PAD,
    gy: gy0 - PAD,
    w: gx1 - gx0 + PAD * 2,
    d: gy1 - gy0 + PAD + PAD_FRONT,
  }

  return {
    id: group.id,
    label: group.label,
    rect,
    flagAt: { gx: rect.gx + 0.35, gy: rect.gy + rect.d - 0.35 },
    nodeIds: members.map((node) => node.id),
  }
}

/**
 * The neighborhoods a given set of buildings forms. Parameterised rather than
 * reading a module-level table, so a filtered view — one group, or one moment
 * in the repo's history — derives its own plots without a second code path.
 */
export function deriveDistricts(groups: readonly Group[], nodes: readonly ArchNode[]): District[] {
  return groups
    .map((group) => derive(group, nodes))
    .filter((district): district is District => district !== null)
}

export function districtIdOf(
  districts: readonly District[],
  nodeId: string | null | undefined,
): string | null {
  if (!nodeId) return null
  return districts.find((d) => d.nodeIds.includes(nodeId))?.id ?? null
}
