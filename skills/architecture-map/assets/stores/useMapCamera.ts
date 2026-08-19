'use client'

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { fitCamera, zoomAbout, type Camera, type Scene } from '../core/scene'

/**
 * The camera over a scene, and the gestures that move it.
 *
 * The camera is *derived until touched*: the stored value carries the key it
 * was made under, and a mismatched key falls back to the computed fit. So
 * recentring, and crossing into a building, invalidate a moved camera by key
 * alone — no effect writes state anywhere, which is what the repo's
 * no-setState-in-effects rule demands. The same key answers "is this still
 * centred", which the recentre control shows as a state light.
 *
 * Gestures follow `MaskEditor`: the pan is frozen at its origin in a ref with
 * deltas applied to that frozen start, and pointer capture waits for the
 * movement threshold — capturing on press would retarget the release to the
 * svg and make the click land on the background, silently deselecting the very
 * building that was pressed.
 */

type Gesture = { id: number; x0: number; y0: number; from: Camera; moved: boolean }

export type MapCamera = {
  attachRef: (el: HTMLDivElement | null) => void
  camera: Camera | null
  /** True while the view is the untouched fit for this scene. */
  centred: boolean
  /**
   * True when the last camera change came from a control rather than a hand:
   * recentring and stepped zoom may glide, but a drag or a wheel must track
   * the pointer exactly or it reads as lag.
   */
  smooth: boolean
  recentre: () => void
  zoomBy: (factor: number) => void
  panBy: (dx: number, dy: number) => void
  /** Wire to the svg; owns drag-to-pan and swallows the click that ends a pan. */
  surfaceProps: {
    onPointerDown: (e: React.PointerEvent) => void
    onPointerMove: (e: React.PointerEvent) => void
    onPointerUp: (e: React.PointerEvent) => void
    onClickCapture: (e: React.MouseEvent) => void
  }
}

export function useMapCamera(scene: Scene, resetTick: number): MapCamera {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const gesture = useRef<Gesture | null>(null)
  // The click that ends a pan arrives after pointerup has retired the gesture,
  // so "that click was a drag" has to outlive the gesture itself.
  const suppressClick = useRef(false)

  const measure = (el: HTMLDivElement) =>
    setSize((prev) => {
      const next = { w: el.clientWidth, h: el.clientHeight }
      return prev && prev.w === next.w && prev.h === next.h ? prev : next
    })

  // First measurement happens in the ref callback at commit — synchronous and
  // paint-independent. The observer keeps it honest afterwards; it is the
  // second source, not the only one, per the `EditorStage` warning about
  // observers in tabs the browser is not painting.
  const attachRef = (el: HTMLDivElement | null) => {
    containerRef.current = el
    if (el) measure(el)
  }

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => measure(el))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const key = `${scene.key}:${resetTick}`
  const [stored, setStored] = useState<{ key: string; value: Camera } | null>(null)
  const centred = stored?.key !== key
  const camera = centred ? (size ? fitCamera(size.w, size.h, scene.bounds) : null) : stored.value

  /*
   * Whether the next paint may glide, keyed like the camera itself so that
   * crossing into a building never inherits a glide from the last click —
   * the two scenes are different content, and sliding between them would
   * claim a continuity that is not there.
   */
  const [smoothState, setSmoothState] = useState<{ key: string; on: boolean } | null>(null)
  const smooth = smoothState?.key === key ? smoothState.on : false
  const setSmooth = (on: boolean) =>
    setSmoothState((prev) => (prev?.key === key && prev.on === on ? prev : { key, on }))

  const write = (next: Camera, glide: boolean) => {
    setSmooth(glide)
    setStored({ key, value: next })
  }
  const update = (fn: (cam: Camera) => Camera, glide: boolean) => {
    if (camera) write(fn(camera), glide)
  }

  // Wheel must be non-passive to preventDefault, so it attaches by hand; the
  // handler is an effect event so the one listener always sees fresh state.
  const onWheel = useEffectEvent((e: WheelEvent) => {
    e.preventDefault()
    const el = containerRef.current
    if (!el || !camera) return
    const rect = el.getBoundingClientRect()
    write(
      zoomAbout(camera, Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top),
      false,
    )
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return {
    attachRef,
    camera,
    centred,
    smooth,
    recentre: () => {
      setSmooth(true)
      setStored(null)
    },
    zoomBy: (factor) => {
      if (size) update((cam) => zoomAbout(cam, factor, size.w / 2, size.h / 2), true)
    },
    panBy: (dx, dy) => update((cam) => ({ ...cam, x: cam.x + dx, y: cam.y + dy }), true),
    surfaceProps: {
      onPointerDown: (e) => {
        if (e.button !== 0 || !camera) return
        gesture.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, from: camera, moved: false }
      },
      onPointerMove: (e) => {
        const g = gesture.current
        if (!g || g.id !== e.pointerId) return
        const dx = e.clientX - g.x0
        const dy = e.clientY - g.y0
        if (!g.moved && Math.hypot(dx, dy) > 4) {
          g.moved = true
          e.currentTarget.setPointerCapture(e.pointerId)
        }
        if (g.moved) write({ ...g.from, x: g.from.x + dx, y: g.from.y + dy }, false)
      },
      onPointerUp: (e) => {
        if (gesture.current?.id !== e.pointerId) return
        suppressClick.current = gesture.current.moved
        gesture.current = null
      },
      onClickCapture: (e) => {
        // A drag is not a click: swallow the click that ends a pan.
        if (suppressClick.current) {
          suppressClick.current = false
          e.stopPropagation()
        }
      },
    },
  }
}
