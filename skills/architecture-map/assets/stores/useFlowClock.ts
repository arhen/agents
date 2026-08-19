'use client'

import { useSyncExternalStore } from 'react'
import { beatIndexAt, nextBoundary, prevBoundary, type FlowProgram } from '../core/program'

/**
 * The clock the narration runs on: a wrapping millisecond counter over the
 * active beat program. All meaning — which beat, where the payload is, what
 * the caption says — is derived from `(program, timeMs)` by the pure functions
 * in `program.ts`; this module only owns time passing.
 *
 * One rAF loop, owned here rather than in a component, because the transport
 * buttons live in the header and the payload lives in the canvas and both must
 * agree on whether time is passing. Each frame advances by `min(elapsed,
 * 100ms)` — rAF starves in a hidden tab, and the clamp turns the return to a
 * foreground tab into one ordinary step instead of a teleport. The next frame
 * is scheduled *before* listeners run, so a throwing listener cannot kill the
 * loop silently.
 *
 * Subscription tiers keep 60fps re-renders contained: `useClockTimeMs` (and
 * its `If` variant, whose snapshot goes inert at -1 when disabled — a
 * lint-safe conditional subscription) is for the payload dot and the follow
 * camera only; `useClockBeatIndex` snapshots a small integer that changes
 * about once a second, for captions and lighting; `useClockPlaying` and
 * `useClockProgram` change only on button presses and flow switches.
 *
 * Deliberately no all-listeners-gone auto-stop: under StrictMode's
 * mount–unmount–mount the listener count touches zero between phases and a
 * silent stop left `playing` true with a dead loop. `FlowChoreography` owns
 * the lifecycle — its effect cleanup calls `configureClock(null)`.
 *
 * Under `prefers-reduced-motion` the loop never starts: the payload holds
 * still and the step functions jump instantly, which is this UI's honest
 * translation — the narration becomes opt-in, one beat per press.
 */

const STEP_MS = 300

/** How fast the clock runs against the program's authored pace. */
export const SPEEDS = [0.5, 1, 2] as const

let program: FlowProgram | null = null
let timeMs = 0
let playing = false
let speed = 1
let rafId: number | null = null
let lastFrame = 0
let stepRafId: number | null = null

const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function frame(now: number) {
  rafId = requestAnimationFrame(frame)
  // The frame gap is clamped before the speed multiplier, so a fast setting
  // cannot turn a hidden tab's stalled frame into a leap across the flow.
  const dt = Math.min(now - lastFrame, 100) * speed
  lastFrame = now
  if (program) {
    timeMs = (timeMs + dt) % program.totalMs
    notify()
  }
}

function startLoop() {
  if (rafId !== null) return
  lastFrame = performance.now()
  rafId = requestAnimationFrame(frame)
}

function stopLoop() {
  if (rafId !== null) cancelAnimationFrame(rafId)
  rafId = null
}

function cancelStep() {
  if (stepRafId !== null) cancelAnimationFrame(stepRafId)
  stepRafId = null
}

/**
 * Called when the scene's program changes; resets time and autoplays if motion
 * is welcome. `autoplay: false` configures paused — the case where something
 * is already selected, because narration must not talk over what the person
 * chose to read.
 */
export function configureClock(next: FlowProgram | null, opts?: { autoplay?: boolean }): void {
  cancelStep()
  program = next
  timeMs = 0
  const shouldPlay = next !== null && (opts?.autoplay ?? true) && !prefersReducedMotion()
  playing = shouldPlay
  if (shouldPlay) startLoop()
  else stopLoop()
  notify()
}

export function pauseClock(): void {
  playing = false
  stopLoop()
  notify()
}

export function resumeClock(): void {
  if (!program || prefersReducedMotion()) return
  playing = true
  cancelStep()
  startLoop()
  notify()
}

/** Glide (or, reduced-motion, jump) to the next beat boundary. Pauses first — stepping is reading. */
export function stepForward(): void {
  if (!program) return
  if (playing) pauseClock()
  const target = nextBoundary(program, timeMs)
  glideTo(target)
}

/** Jump straight back a beat — a backwards glide reads as scrubbing, not narration. */
export function stepBack(): void {
  if (!program) return
  if (playing) pauseClock()
  cancelStep()
  timeMs = prevBoundary(program, timeMs)
  notify()
}

function glideTo(target: number): void {
  if (!program) return
  if (prefersReducedMotion()) {
    timeMs = target
    notify()
    return
  }
  cancelStep()
  const total = program.totalMs
  // Wrap-aware: the distance is always forward.
  const delta = target >= timeMs ? target - timeMs : total - timeMs + target
  const from = timeMs
  const start = performance.now()
  const step = (now: number) => {
    const p = Math.min((now - start) / STEP_MS, 1)
    const eased = 1 - Math.pow(1 - p, 3)
    timeMs = (from + delta * eased) % total
    notify()
    stepRafId = p < 1 ? requestAnimationFrame(step) : null
  }
  stepRafId = requestAnimationFrame(step)
}

export function setClockSpeed(next: number): void {
  speed = next
  notify()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useClockPlaying(): boolean {
  return useSyncExternalStore(subscribe, () => playing, () => false)
}

export function useClockTimeMs(): number {
  return useSyncExternalStore(subscribe, () => timeMs, () => 0)
}

export function useClockSpeed(): number {
  return useSyncExternalStore(subscribe, () => speed, () => 1)
}

export function useClockBeatIndex(): number {
  return useSyncExternalStore(subscribe, () => (program ? beatIndexAt(program, timeMs) : -1), () => -1)
}

export function useClockProgram(): FlowProgram | null {
  return useSyncExternalStore(subscribe, () => program, () => null)
}
