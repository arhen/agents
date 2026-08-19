#!/usr/bin/env node
import { globSync, readFileSync } from 'node:fs'

/**
 * A first draft of the map's shape, read off the directory tree.
 *
 * This does not decide anything — it counts, clusters, and hands back a
 * proposal for a person (or the model running the skill) to correct. The
 * clustering rule is deliberately dumb: directories are the unit, because
 * directories are how people already grouped their own code. Anything cleverer
 * invents structure the repo does not have.
 *
 * The cap is the important part. A map of four hundred buildings is a photo of
 * a city from orbit: technically complete, useless. Past the target, the
 * smallest siblings inside a directory are folded into one node that owns the
 * wider glob, so every file stays claimed exactly once and only the *drawing*
 * gets simpler.
 *
 * Usage: node propose-coverage.mjs [--target 22] [--root .]
 */

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}

const ROOT = flag('root', process.cwd())
const TARGET = Number(flag('target', 22))
const SOURCES = ['**/*.{ts,tsx,js,jsx,mjs,cjs,py,go,rb,rs,java,kt,swift,php,cs}']
const SKIP = /(^|\/)(node_modules|\.git|dist|build|out|\.next|vendor|target|__pycache__|coverage)(\/|$)/

function lines(file) {
  try {
    return readFileSync(`${ROOT}/${file}`, 'utf8').split('\n').length
  } catch {
    return 0
  }
}

const files = [...new Set(SOURCES.flatMap((g) => globSync(g, { cwd: ROOT })))]
  .map((f) => f.split('\\').join('/'))
  .filter((f) => !SKIP.test(f))

/** Group by directory, at increasing depth, until the count fits the target. */
function clusterAt(depth) {
  const groups = new Map()
  for (const file of files) {
    const parts = file.split('/')
    const key = parts.slice(0, Math.min(depth, Math.max(parts.length - 1, 1))).join('/') || '.'
    const entry = groups.get(key) ?? { dir: key, count: 0, loc: 0, files: [] }
    entry.count += 1
    entry.loc += lines(file)
    if (entry.files.length < 6) entry.files.push(file)
    groups.set(key, entry)
  }
  return [...groups.values()].sort((a, b) => b.loc - a.loc)
}

// Go as deep as the tree allows without blowing past the target.
let best = clusterAt(1)
for (let depth = 2; depth <= 4; depth++) {
  const next = clusterAt(depth)
  if (next.length > TARGET * 1.6) break
  best = next
}

// Fold the tail: everything past the target collapses into its parent
// directory, so the drawing stays readable and the partition stays total.
const kept = best.slice(0, TARGET)
const folded = best.slice(TARGET)
const byParent = new Map()
for (const entry of folded) {
  const parent = entry.dir.split('/').slice(0, -1).join('/') || '.'
  const bucket = byParent.get(parent) ?? { dir: parent, count: 0, loc: 0, files: [], aggregated: true }
  bucket.count += entry.count
  bucket.loc += entry.loc
  byParent.set(parent, bucket)
}

const proposal = [...kept, ...byParent.values()].map((entry) => ({
  id: entry.dir.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'root',
  dir: entry.dir,
  owns: [entry.dir === '.' ? '*' : `${entry.dir}/**`],
  count: entry.count,
  loc: entry.loc,
  sampleFiles: entry.files ?? [],
  aggregated: Boolean(entry.aggregated),
}))

console.log(
  JSON.stringify(
    {
      totalFiles: files.length,
      totalLoc: proposal.reduce((n, p) => n + p.loc, 0),
      target: TARGET,
      proposedNodes: proposal.length,
      /** Top-level directories, the natural first guess at neighborhoods. */
      suggestedGroups: [...new Set(proposal.map((p) => p.dir.split('/')[0]))],
      nodes: proposal,
    },
    null,
    2,
  ),
)
