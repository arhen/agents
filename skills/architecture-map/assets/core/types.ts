import type { Archetype, ArchetypeParams } from './archetypes'
import type { Footprint, GridPt } from './iso'

/**
 * The shape of the map's content: the contract the authored table fills in and
 * every consumer reads through.
 *
 * Kept apart from the data so the schema can be taken in on one screen, and so
 * the generated measurements have something to be merged *into* rather than a
 * file they have to rewrite.
 *
 * Prose fields may use `[[term]]` to mark words the explainer highlights.
 */

export type Group = { id: string; label: string }

export type ArchNode = {
  id: string
  /** Two or three letters. What the roof chip shows at rest. */
  code: string
  name: string
  /** A short noun phrase — "the session gate" — for the flow captions. */
  role: string
  group: string
  /** Derived from the measurement unless a human overrode it. */
  archetype: Archetype
  params?: ArchetypeParams
  footprint: Footprint
  height: number
  /** One or two sentences. What this does, in plain language. */
  whatItDoes: string
  /** One or two sentences. How it is put together, and why that way. */
  howItsBuilt: string
  /** Real paths, so the reader can go and look. */
  files: string[]
  /** Libraries and services this leans on. Names, not versions. */
  stack?: string[]
  /** Filled in by the scanner — never authored. */
  count?: number
  loc?: number
}

export type EdgeKind = 'call' | 'data' | 'support' | 'retry'

export type ArchEdge = {
  id: string
  from: string
  to: string
  kind: EdgeKind
  /** What travels — "session cookie", "H.264 frames". */
  label: string
  /** Which flows travel this edge. */
  flowIds: string[]
  /** Grid waypoints, when the default elbow routes through a building. */
  via?: GridPt[]
}

export type ArchFlow = {
  id: string
  name: string
  /** What moves along it, shown in the rail beside the name. */
  payload: string
  /** One sentence: what this flow accomplishes. */
  summary: string
  /** Edge ids in order. The narration walks them. */
  route: string[]
}
