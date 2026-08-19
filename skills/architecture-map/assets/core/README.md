# Portable core

Pure, dependency-free, and framework-agnostic. Copy verbatim — these files are
the same in every repo the map is installed into.

| File | Role |
|---|---|
| `iso.ts` | The 2:1 dimetric projection, Manhattan edge routing, polyline arithmetic, scene bounds |
| `archetypes.ts` | Building shapes: box faces, slab stacks, fin rows, port and chip anchors |
| `layout.ts` | Height, archetype and footprint **derived** from the measurement, plus the district packer |
| `types.ts` | The graph schema — the contract the authored table fills in |
| `districts.ts` | Neighborhood plots, derived from their members' bounding box |
| `routes.ts` | Every edge as a drawn line, with arc lengths precomputed |
| `scene.ts` | Paint-ordered scene, floor grid, camera fit and zoom |
| `program.ts` | A flow turned into a beat timeline: dwell, travel, dwell, loop |

Nothing here touches the DOM, so all of it is unit-testable without a renderer.
