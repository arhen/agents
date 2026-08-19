# Geometry

Only needed when the derived layout is wrong and you want to hand-tune it.

## The projection

A 2:1 dimetric isometric. One grid step along `gx` moves half a tile right and
half a tile-height down; one step along `gy` mirrors it leftward; `z` lifts
straight up.

```
toScreen(gx, gy, z) = { x: (gx - gy) * 24, y: (gx + gy) * 12 - z * 14 }
```

Integer grid coordinates are the authoring format. Fractions are legal
everywhere — slab insets, fin pitches, edge lanes on half-cell offsets.

## Paint order

Buildings render in ascending `depthKey = gx + w + gy + d`. Footprints never
overlap, so the rule is sufficient: a building can only occlude one whose front
corner sits strictly behind its own.

Layer order on the canvas, and why:

1. **Floor grid** — under everything
2. **District plates** — with the floor, so a plot never covers what stands on it
3. **Edges** — under the buildings, so a payload reaching a facade disappears
   *into* the module. That is what reads as "entering"
4. **Buildings** — back to front
5. **Flags and step numbers** — last, because a marker a tower can bury is no marker

## Fixing an edge that cuts through a building

Edges route Manhattan-style: `gx` first, then `gy`, with an elbow inserted
where they differ on both axes. To flip which way the elbow bends, supply the
other corner as a waypoint:

```ts
{ id: 'auth-to-dash', from: 'auth', to: 'dashboard', via: [{ gx: 4, gy: -2 }] }
```

Waypoints are in grid space, and half-cell offsets are useful for running two
edges in parallel lanes rather than on top of each other.

## Fixing a footprint

`packLayout` is deterministic shelf packing: it fills a row left to right until
the next building would pass the target width, then starts a row behind it.
Districts are packed the same way one scale up, in `GROUPS` order.

To override, write the footprint into the node and skip the merge for it. Rules
to respect:

- Footprints must not overlap — the district derivation and the painter's
  algorithm both assume it
- Leave at least one cell between buildings, or their strokes touch
- A district's plate is derived from its members' bounding box plus padding, so
  moving a building moves the plot automatically

## Sizes

Height is a log ladder on lines of code, clamped 1–6: a module ten times bigger
is not ten times taller, or one subsystem becomes a skyscraper next to a
village. Footprint comes from archetype — a fin-row is as wide as it has fins,
a tower is 2×2 regardless of how tall it is.
