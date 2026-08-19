'use client'

import { useSyncExternalStore } from 'react'

/**
 * What the map is currently pointing at: a selection, a hover, and the flow
 * being narrated.
 *
 * A module singleton read through `useSyncExternalStore` rather than context,
 * because three separated surfaces — the rail, the canvas and the panel — all
 * read and write it, and threading a provider between them buys nothing.
 *
 * `getSnapshot` must return a referentially stable value or React will loop:
 * the state object is replaced only when something actually changes.
 */

export type Selection = { kind: 'node'; id: string } | { kind: 'edge'; id: string }

export type MapView = {
  selection: Selection | null
  hover: Selection | null
  /** The neighborhood being pointed at, from the rail or the floor. */
  hoverGroup: string | null
  activeFlowId: string | null
  /** Bumped by `clearView`, so a derived camera can key off it and refit. */
  resetTick: number
}

const EMPTY: MapView = {
  selection: null,
  hover: null,
  hoverGroup: null,
  activeFlowId: null,
  resetTick: 0,
}

let state: MapView = EMPTY
const listeners = new Set<() => void>()

function set(next: Partial<MapView>) {
  const merged = { ...state, ...next }
  // Cheap identity guard: hovering the same thing twice must not re-render.
  if (
    merged.selection === state.selection &&
    merged.hover === state.hover &&
    merged.hoverGroup === state.hoverGroup &&
    merged.activeFlowId === state.activeFlowId &&
    merged.resetTick === state.resetTick
  ) {
    return
  }
  state = merged
  for (const listener of listeners) listener()
}

export function select(selection: Selection | null): void {
  // Choosing a thing stops the narration: a flow talking over the module you
  // just asked about is the page arguing with itself.
  set({ selection, activeFlowId: selection ? null : state.activeFlowId })
}

export function setHover(hover: Selection | null): void {
  set({ hover })
}

export function setHoverGroup(hoverGroup: string | null): void {
  set({ hoverGroup })
}

export function setActiveFlow(activeFlowId: string | null): void {
  set({ activeFlowId, selection: null })
}

export function clearView(): void {
  set({ selection: null, hover: null, activeFlowId: null, resetTick: state.resetTick + 1 })
}

export function hasFocus(view: MapView): boolean {
  return view.selection !== null || view.activeFlowId !== null
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useMapView(): MapView {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY)
}
