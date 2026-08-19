# Authoring the graph

The measured half takes care of itself. This is about the half that does not.

## Voice

Write like someone explaining the system to a new colleague at a whiteboard —
concrete, unhurried, and willing to say why. The reader is technical but has
never seen this repo.

**Say what a thing does before what it is made of.** "Turns a collection of
photos into an MP4, entirely in the browser" beats "React component using
WebCodecs".

**Name the interesting decision.** The `howItsBuilt` field is not a dependency
list — it is the one choice a reader would otherwise wonder about.

> Good: "Encoding happens on the main thread on purpose: `VideoEncoder` holds
> GPU resources a worker cannot share, and the copy cost of shuttling frames
> across a worker boundary is larger than the parallelism buys."
>
> Bad: "Built with WebCodecs, React and TypeScript."

**No filler.** "Handles various utilities and helper functions" describes
nothing. If a module resists description, that is a finding about the module —
say what it actually contains.

**Prose is prose.** Sentences go in the body face. The mono face is for codes,
file paths and chips. A paragraph of monospace is a punishment.

## Fields, and what belongs in them

| Field | Length | What it is for |
|---|---|---|
| `name` | 1–3 words | What the team calls it out loud |
| `code` | 2 letters | The roof chip at rest. Unique |
| `role` | a noun phrase | Reads inside a flow caption: "at Auth & allowlist — *the session gate*" |
| `whatItDoes` | 1–2 sentences | Plain language, no jargon |
| `howItsBuilt` | 1–2 sentences | The decision worth knowing |
| `files` | 3–6 paths | Real, openable, representative — not exhaustive |
| `stack` | names | Libraries and services. Names, not versions |

Mark a word with `[[double brackets]]` to have the panel highlight it. Use it
once or twice per node, on the term a reader would search for.

## The archetype vocabulary

Shapes carry meaning. `deriveArchetype` picks by default; override only when
the derivation is clearly wrong about a module you know well.

- **fin-row** — a collection whose *count* is the point. Nine asset editors,
  twenty route handlers. Reads as a comb.
- **tower** — a deep, single-purpose pile. One big file doing one hard thing.
- **slab-stack** — something that accreted in layers. Big, old, load-bearing.
- **cube** — an ordinary subsystem. Most things.
- **low-slab** — a plate on the floor. Small libraries, and the outside-world
  services that are not code in this repo at all.

## Groups

Four to seven, named the way people talk. "Entry & control", "The pixel
pipeline", "Server & data", "Outside world". Never "utils", "lib", "misc" —
those are directory names, not places.

Order matters: the legend lists groups in order and the map packs them in that
order, so reading down the rail walks you across the city. Put the entry point
first and the outside world last.

## Edges

An edge is a claim that A calls B, or data moves from A to B. **If you cannot
point at the line of code that makes it happen, do not draw it.** A plausible
arrow is worse than a missing one, because the map's whole authority is that
everything on it is real.

- `call` — a function call, a request, a route dispatch
- `data` — something is written or read
- `support` — wiring that matters but is not the story. Drawn thin
- `retry` — an error or fallback path. Drawn dashed

Add `via` waypoints when the default elbow would cut through a building. One
waypoint usually fixes it; see `geometry.md`.

## Flows

Three to six. A flow is an ordered list of edge ids, plus one payload noun.
These are what a newcomer presses first, and what the page is *for*.

Find them by tracing real paths through the code:

- how someone gets in (sign-in → session → first screen)
- the main loop (create → edit → save → read back)
- the expensive one (the background job, the export, the pipeline)
- the one that surprises people (the retry path, the cache warm)

Name them as verbs from the user's side — "Export", "Sign in", "Media in" —
not as component names.

The payload is the thing that travels: "session cookie", "H.264 frames",
"config patch". It appears beside the flow in the rail and in every step
caption, so it should be a noun someone could point at.

## Worked example

```ts
{
  id: 'auth',
  code: 'AU',
  name: 'Auth & allowlist',
  role: 'the session gate',
  group: 'entry',
  whatItDoes:
    'Decides who gets in. Sign-in is [[Google OAuth]] only, and every request ' +
    'for a gated route is checked before the page is built.',
  howItsBuilt:
    'The allowlist is its own module rather than a helper inside the auth ' +
    'config, because it is policy rather than wiring — a pure rule about ' +
    'strings, worth testing without standing up the whole framework.',
  files: ['src/auth.ts', 'src/proxy.ts', 'src/lib/allowlist.ts'],
  stack: ['next-auth v5', 'Google provider', 'JWT sessions'],
}
```

Note what it does *not* say: no file counts (measured), no footprint (packed),
no height (derived).
