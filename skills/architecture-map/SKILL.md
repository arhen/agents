---
name: architecture-map
description: Build or update an interactive isometric map of a repository's architecture — buildings sized by real measurements, neighborhoods by subsystem, animated flows tracing actual call paths, and a drift counter that fails CI when the map falls behind the code. Use when someone wants to see, explain, or onboard people to how a codebase fits together, or asks for an architecture diagram, system map, codebase overview, or "show me how this repo works". Adapts to the repo's design system; re-run to refresh.
metadata:
  version: 1.1.0
---

# Architecture map

Turn a repository into a place you can walk around: an isometric city where
every building is a real subsystem sized by its real weight, every line is a
call path that exists in the code, and every moving dot is a payload the app
actually ships.

## The one rule

**Prose, groups and flows are authored. Counts, coverage and geometry are
measured.**

No scanner can say what a subsystem is *for*, and no human can keep file counts
honest. Every good property of this page falls out of that line — including the
fact that it does not rot, because "unmapped files" is only meaningful once a
human has claimed the rest.

Do not try to generate the authored half mechanically. Read the code and write
about it. That is the work, and it is why this is a skill rather than a
codegen script.

## Before you start

Read `references/authoring.md`. It has the voice, the archetype vocabulary, and
worked examples of good and bad node prose. Read `references/geometry.md` only
if you need to hand-tune footprints or edge routes.

## Step 1 — Detect

Answer these from the repo. Do not ask.

| Question | Where to look |
|---|---|
| Framework and router | `package.json` + `app/` vs `pages/` (Next.js/Remix/Vite), `composer.json` + `artisan` (Laravel), `pyproject.toml` + `uvicorn`/`main.py` (FastAPI), `vite.config`, `next.config`, `remix.config` |
| Multi-service workspace | sibling service dirs (`web/`, `api/`, `ai-service/`, `data-service/`…), each with its own manifest and git repo — see the workspace note below |
| Design tokens | global stylesheet for `--*` custom properties; `tailwind.config`; any `tokens`/`theme` module |
| Dark mode mechanism | `.dark` class, `[data-theme]`, or `prefers-color-scheme` |
| Test runner | `package.json` scripts, `vitest.config`, `jest.config`, `phpunit.xml`, `pytest.ini`/`pyproject.toml` |
| Package manager | lockfile (`package-lock.json`, `bun.lock`, `yarn.lock`, `composer.lock`, `uv.lock`/`poetry.lock`) |
| Monorepo | `workspaces`, `pnpm-workspace.yaml`, `turbo.json` |
| Existing map | a previous `architecture.config.json` — if present, this is an **update** |

**Multi-service workspace.** frndOS-style layout: sibling service repos
(`web/` Next.js, `api/` Laravel, `ai-service/`/`data-service/` FastAPI) under one
workspace root. Map the whole workspace as one city — each service is a
district, cross-service HTTP calls become the flows. Sources glob across
service dirs (see Step 3). The proposer's `--root .` at workspace root clusters
per top-level directory, which is exactly the service split you want.

Then run the proposer to get a first read of the shape. It lives beside this
file, not in the repo you are mapping, so resolve its path first:

> **`SKILL_DIR`** — the absolute path of the directory containing *this
> SKILL.md*, which your harness reported when it loaded this file. It differs
> per tool (`~/.claude/skills/architecture-map`,
> `~/.codex/skills/architecture-map`, `~/.agents/skills/architecture-map`, a
> plugin cache, or a project-local `.claude/skills/…`). Substitute the literal
> path; do not rely on an environment variable.

```bash
node "$SKILL_DIR/scripts/propose-coverage.mjs" --root . --target 22
```

It returns directory clusters with file counts and line totals, plus suggested
groups. Treat it as a draft, not an answer — it knows where code *is*, not what
it *does*.

## Step 2 — Ask exactly four questions

Ask them together — in one structured-question call if your harness has one
(Claude Code: `AskUserQuestion`), otherwise as a single numbered message — then
work uninterrupted. Do not drip-feed them one at a time.

1. **Where should it live?** Recommend `/~/architecture` — a `~` segment reads
   as "internal tool" and sorts away from real routes. Offer `/architecture` and
   `/internal/architecture`.
2. **What should it cover?** Whole repo / source only / one package. Preselect
   sensibly if it is a monorepo.
3. **Design system.** State what you detected — "Tailwind v4 with CSS custom
   properties" — and offer: use it, or the bundled neutral palette.
4. **Extras.** Wire the freshness check into CI? Add the sync to `predev`/
   `prebuild`? Include the version-history dropdown?

## Step 3 — Install the core

Copy `$SKILL_DIR/assets/core/`, `assets/stores/` and `assets/components/` into
the repo under the path you agreed (e.g. `src/architecture/`). These are dependency-free
apart from React, and typecheck under `strict`.

Then write `architecture.config.json` at the repo (or workspace) root:

```json
{
  "coverage": "src/architecture/coverage.json",
  "output": "src/architecture/measured.generated.ts",
  "sources": ["src/**/*.{ts,tsx}", "scripts/**/*.mjs"],
  "ignore": ["next-env.d.ts"]
}
```

**Workspace variant** — sources span every service, each with its language:

```json
{
  "coverage": "web/src/architecture/coverage.json",
  "output": "web/src/architecture/measured.generated.ts",
  "sources": ["web/src/**/*.{ts,tsx}", "api/**/*.php", "ai-service/**/*.py", "data-service/**/*.py"],
  "ignore": ["next-env.d.ts", "**/vendor/**", "**/node_modules/**", "**/.next/**", "**/__pycache__/**"]
}
```

`ignore` matters more here — the sync script trusts your `sources` globs, so
keep dependency/vendor/build dirs out explicitly.

Copy `$SKILL_DIR/scripts/architecture-sync.mjs` into the repo's own `scripts/`
and add
`"architecture:sync": "node scripts/architecture-sync.mjs"`.

### Adapt the theme

Edit `components/theme.ts` only. Point each semantic name at the repo's tokens:

```ts
export const paint = {
  surface: 'var(--tsc-background)',
  border: 'var(--tsc-foreground-tertiary)',
  accent: 'var(--tsc-brand)',
  // …
}
```

If the repo has no design system, leave the defaults — they define
`--am-*` fallbacks and work standalone. **Never** reach for a host token
anywhere except this file.

## Step 4 — Author the graph

This is the real work. Write `graph.ts` exporting `GROUPS`, `NODES`, `EDGES`,
`FLOWS` and `INTRO`, typed by `core/types.ts`.

**Groups** — 4–7 neighborhoods, named the way the team talks: "Entry &
control", "The pixel pipeline", "Outside world". Not "utils" and "lib".

**Nodes** — aim for 15–25. For each, *read the actual files* and write:
- `whatItDoes` — one or two sentences, plain language, no jargon
- `howItsBuilt` — the interesting decision, not a dependency list
- `role` — a short noun phrase for the flow captions: "the session gate"
- `files` — real paths a reader can open

Derive `archetype`, `params`, `height` and `footprint` with `core/layout.ts`:

```ts
const { archetype, params } = deriveArchetype(measure)
const height = deriveHeight(measure)
const footprints = packLayout(inputs, GROUPS.map((g) => g.id))
```

Keep a hand-written footprint if a human already tuned one — the merge prefers
the authored value.

**Edges** — real call and data paths only. If you cannot point at the code that
makes the call, do not draw the line. Add `via` waypoints when a route would
otherwise cut through a building.

**Flows** — 3–6, each an ordered list of edge ids with a payload name. These are
the page's verbs and the first thing a newcomer presses. Find them by tracing
real paths: sign-in, the main create/read loop, the expensive background job.

**Coverage** — write `coverage.json` so every source file is claimed exactly
once. `$`-prefixed keys are notes. Use `priority` when a nested directory must
win over its parent. Then:

```bash
node scripts/architecture-sync.mjs
```

Iterate until it reports zero unmapped, or until what remains genuinely is not
part of the system.

## Step 5 — Mount it

Create the route for the detected framework — see `references/frameworks.md`.
Import `keyframes.css` once. Pass `ArchitectureData` in from your graph module
plus `UNCLAIMED` from the generated file.

Add `robots: noindex` if the route is public: this is a tool handed out by
link, not a search result.

## Step 6 — Verify, then be honest

1. Typecheck and lint.
2. `node scripts/architecture-sync.mjs --check` — must pass.
3. Run the app and **look at it**. Screenshot it. Check: no overlapping
   buildings, no edge cutting through a facade, every flow plays start to
   finish, the rail and the map agree on what is lit.
4. Both themes if the repo has two.

Then tell the user plainly:

> The geometry and measurements are correct — they are derived. **The prose is
> a first draft.** I read the code, but "what this subsystem does" is where a
> single pass is weakest. Edit `graph.ts`; nothing else needs to change.

Do not leave mediocre writing behind a confident-looking map without saying so.

## Updating an existing map

If `architecture.config.json` exists, this is an update. **Never clobber
authored content.**

1. Run the sync. New numbers land in the generated file; nothing else moves.
2. Read `UNCLAIMED`. Each entry is either a subsystem the map has not been told
   about, or an existing module whose pattern is too narrow.
3. For genuinely new subsystems: *append* a node with derived geometry and
   drafted prose, and extend `coverage.json`. Leave every existing node's
   prose, footprint and edges exactly as they are.
4. Report what you added and what you left alone.

## Scale

Past ~25 buildings the map stops being readable. The proposer folds the
smallest siblings into a parent node that owns the wider glob — the partition
stays total, only the drawing simplifies. If a repo genuinely needs more, map
one package at a time rather than shrinking everything.

A multi-service workspace of ~4 services usually lands inside the cap as one
map (each service = a district, 4–6 buildings each). Bigger workspaces: map
per service, each mounted in its own repo.

## What not to do

- Do not draw an edge you cannot trace to a call in the code.
- Do not set prose in the mono face. Monospace is for codes and paths.
- Do not import a host repo's `Button` or `Dropdown` — the map ships its own.
- Do not hand-write file counts. That is what the scanner is for.
- Do not invent flows that sound good. A flow nobody can follow in the source
  is a lie the page tells confidently.
