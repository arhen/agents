import { pointAtLength, type ScreenPt } from './iso'
import type { ArchEdge, ArchFlow, ArchNode } from './types'
import type { EdgeGeometry } from './routes'

/**
 * The beat timeline the narration runs on.
 *
 * A flow becomes a *program*: dwell at the first node, travel the first edge,
 * dwell, travel, … final dwell, loop. Every beat carries its caption and its
 * millisecond start, all computed here — pure and DOM-free so the test suite
 * can pin beat boundaries, positions, and step targets, and so the clock can
 * stay a dumb wrapping counter. Components derive everything from
 * `(program, timeMs)` with the lookup functions below; nothing about the
 * choreography lives in component state.
 */

/*
 * Paced for reading, not for showing off. Every beat has to last long enough
 * to read its caption — a dwell is a full sentence about a module, a travel is
 * a step number, two names, and a payload. The speed control multiplies the
 * clock rather than these numbers, so 1× is the pace the captions were written
 * for and the other settings are departures from it.
 */
export const DWELL_MS = 1600
export const LOOP_PAUSE_MS = 1800
export const TRAVEL_MS_PER_PX = 5
export const TRAVEL_MIN_MS = 900
export const TRAVEL_MAX_MS = 2000

export type Beat =
  | { kind: 'dwell'; start: number; duration: number; nodeId: string; caption: string }
  | {
      kind: 'travel'
      start: number
      duration: number
      /** Index into the program's `geoms`. */
      edgeIndex: number
      edgeId: string
      payload?: string
      caption: string
    }

export type FlowProgram = {
  /** Identity — the flow id — so memo hooks can compare cheaply. */
  key: string
  beats: Beat[]
  totalMs: number
  geoms: EdgeGeometry[]
  /** The node chain, one longer than the edge list. */
  nodeIds: string[]
}

type Step = {
  edgeId: string
  fromId: string
  fromName: string
  toId: string
  toName: string
  toRole: string
  label: string
  payload?: string
  geom: EdgeGeometry
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function travelDuration(pxLength: number): number {
  return Math.max(TRAVEL_MIN_MS, Math.min(TRAVEL_MAX_MS, pxLength * TRAVEL_MS_PER_PX))
}

function buildProgram(key: string, firstNode: { id: string; name: string; role: string }, steps: Step[]): FlowProgram {
  const beats: Beat[] = []
  let at = 0
  const dwell = (nodeId: string, name: string, role: string, extraMs = 0) => {
    beats.push({
      kind: 'dwell',
      start: at,
      duration: DWELL_MS + extraMs,
      nodeId,
      caption: `at ${name} — ${role}`,
    })
    at += DWELL_MS + extraMs
  }
  dwell(firstNode.id, firstNode.name, firstNode.role)
  steps.forEach((step, i) => {
    const duration = travelDuration(step.geom.total)
    const payloadBit = step.payload ? ` · ${step.payload}` : ''
    beats.push({
      kind: 'travel',
      start: at,
      duration,
      edgeIndex: i,
      edgeId: step.edgeId,
      payload: step.payload,
      caption: `step ${i + 1}/${steps.length} · ${step.fromName} → ${step.toName}${payloadBit} · ${step.label}`,
    })
    at += duration
    dwell(step.toId, step.toName, step.toRole, i === steps.length - 1 ? LOOP_PAUSE_MS : 0)
  })
  return {
    key,
    beats,
    totalMs: at,
    geoms: steps.map((s) => s.geom),
    nodeIds: [firstNode.id, ...steps.map((s) => s.toId)],
  }
}

/**
 * A flow, turned into a timeline. The lookups are passed in rather than read
 * from a module table, so the same builder serves the live map and any
 * filtered view of it.
 */
export function buildFlowProgram(
  flow: ArchFlow,
  nodes: readonly ArchNode[],
  edges: readonly ArchEdge[],
  geometry: ReadonlyMap<string, EdgeGeometry>,
): FlowProgram | null {
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const edgeById = new Map(edges.map((e) => [e.id, e]))

  const steps: Step[] = []
  for (const edgeId of flow.route) {
    const edge = edgeById.get(edgeId)
    const geom = geometry.get(edgeId)
    if (!edge || !geom) return null
    const from = nodeById.get(edge.from)
    const to = nodeById.get(edge.to)
    if (!from || !to) return null
    steps.push({
      edgeId,
      fromId: from.id,
      fromName: from.name,
      toId: to.id,
      toName: to.name,
      toRole: to.role,
      label: edge.label,
      payload: flow.payload,
      geom,
    })
  }
  if (steps.length === 0) return null

  const first = nodeById.get(steps[0].fromId)
  if (!first) return null
  return buildProgram(flow.id, first, steps)
}

/** Which beat owns `timeMs`; a boundary belongs to the beat it starts. */
export function beatIndexAt(program: FlowProgram, timeMs: number): number {
  const t = Math.max(0, Math.min(timeMs, program.totalMs - 1))
  for (let i = program.beats.length - 1; i >= 0; i--) {
    if (program.beats[i].start <= t) return i
  }
  return 0
}

/** Where the payload is: parked at a node during a dwell, easing along an edge during a travel. */
export function positionAt(program: FlowProgram, timeMs: number): ScreenPt {
  const i = beatIndexAt(program, timeMs)
  const beat = program.beats[i]
  if (beat.kind === 'travel') {
    const geom = program.geoms[beat.edgeIndex]
    const phase = Math.max(0, Math.min((timeMs - beat.start) / beat.duration, 1))
    return pointAtLength(geom.pts, geom.cum, easeInOutCubic(phase) * geom.total)
  }
  // A dwell parks at the end of the previous edge — or the very start.
  const prevTravel = program.beats
    .slice(0, i)
    .reverse()
    .find((b) => b.kind === 'travel')
  if (prevTravel?.kind === 'travel') {
    const geom = program.geoms[prevTravel.edgeIndex]
    return geom.pts[geom.pts.length - 1]
  }
  return program.geoms[0].pts[0]
}

/** The next beat's start; past the end it wraps to 0. */
export function nextBoundary(program: FlowProgram, timeMs: number): number {
  const i = beatIndexAt(program, timeMs)
  return i + 1 < program.beats.length ? program.beats[i + 1].start : 0
}

/**
 * The current beat's start — unless the press lands within its first 150ms,
 * in which case the previous beat's, so a double-press actually goes back.
 */
export function prevBoundary(program: FlowProgram, timeMs: number): number {
  const i = beatIndexAt(program, timeMs)
  const beat = program.beats[i]
  if (timeMs - beat.start < 150 && i > 0) return program.beats[i - 1].start
  return beat.start
}

export function flowNodeIdSet(program: FlowProgram): Set<string> {
  return new Set(program.nodeIds)
}

/**
 * Where each edge of the flow stands in the story right now: the one being
 * travelled, the ones already walked, the ones still to come.
 *
 * Lives here rather than in the edge layer because it is a fact about the
 * program, not about painting.
 */
export type EdgeTense = 'current' | 'visited' | 'upcoming'

export function edgeTenses(
  program: FlowProgram | null,
  beatIndex: number,
): ReadonlyMap<string, EdgeTense> {
  const tenses = new Map<string, EdgeTense>()
  if (!program || beatIndex < 0) return tenses
  program.beats.forEach((beat, i) => {
    if (beat.kind !== 'travel') return
    tenses.set(beat.edgeId, i === beatIndex ? 'current' : i < beatIndex ? 'visited' : 'upcoming')
  })
  return tenses
}

/** Nodes the payload has already arrived at, up to and including the current beat. */
export function visitedNodeIds(program: FlowProgram, beatIndex: number): Set<string> {
  const visited = new Set<string>([program.nodeIds[0]])
  for (let i = 0; i <= Math.min(beatIndex, program.beats.length - 1); i++) {
    const beat = program.beats[i]
    if (beat.kind === 'dwell') visited.add(beat.nodeId)
  }
  return visited
}

/** Who the story is about right now: a travel's destination, or the dwelt node. */
export function currentTargetNodeId(program: FlowProgram, beatIndex: number): string | null {
  const beat = program.beats[beatIndex]
  if (!beat) return null
  if (beat.kind === 'dwell') return beat.nodeId
  return program.nodeIds[beat.edgeIndex + 1] ?? null
}
