# Mounting the map

The map is one default-exported React component taking one `ArchitectureData`
prop. Everything below is about getting a route to render it.

## Next.js — App Router

```
src/app/~/architecture/page.tsx
```

```tsx
import ArchitectureMap from '@/architecture/components/ArchitectureMap'
import '@/architecture/components/keyframes.css'
import { ARCHITECTURE } from '@/architecture/graph'

export const metadata = {
  title: 'Architecture',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <ArchitectureMap data={ARCHITECTURE} />
}
```

The `~` is a literal directory segment, not a route group — it sorts internal
tools away from real routes and reads as "not part of the product".

Note the components are client components (`'use client'` is already on them);
the page itself can stay a server component.

## Next.js — Pages Router

`src/pages/~/architecture.tsx`, same body, with `next/head` for the robots tag.

## Vite / React SPA

Add a route in whatever router the app uses:

```tsx
<Route path="/~/architecture" element={<ArchitectureMap data={ARCHITECTURE} />} />
```

Import `keyframes.css` in the app entry. `'use client'` directives are inert
here and harmless.

## Remix / React Router

`app/routes/~.architecture.tsx`, exporting the component as default. Load the
graph module directly — it is static data, so no loader is needed.

## Astro

Wrap in a client island, because the map is fully interactive:

```astro
---
import ArchitectureMap from '../architecture/components/ArchitectureMap'
import { ARCHITECTURE } from '../architecture/graph'
---
<ArchitectureMap client:only="react" data={ARCHITECTURE} />
```

## Anything else, or no web app at all

If the repo has no React app to host a page — a Go service, a Python library,
a CLI — the honest output is a standalone page. Bundle the components with
esbuild into a single HTML file and commit it as `architecture.html`:

```bash
npx esbuild entry.tsx --bundle --minify --format=iife --outfile=bundle.js
```

The measurement script still runs in CI, so the drift counter keeps working;
only the mounting changes. Say clearly that this is what you did and why.

## The stylesheet

`keyframes.css` defines the dash march along the active flow edge and the
reduced-motion override. It must be imported exactly once, anywhere in the
app's CSS graph. Everything else is inline styles from `theme.ts`, so there is
no build-tool configuration to get wrong.
