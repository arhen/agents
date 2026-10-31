# Global Agent Instructions

## File Tools Guidelines

Prefer built-in search tools over shell grep/find (shell only when tools lack needed flags).

1. Filename/path, fuzzy → find.
2. Any text content (docs, logs, configs, code) → grep.
3. Code semantics — real refs, structure, or an edit → ast-grep (CLI).
4. Identifier search: grep first; if comment/string false-positives pollute, redo with ast-grep.
5. Batching several commands or reading/filtering their output: use the `codemode` tool when available, not ad-hoc Python/Node helper scripts.
6. Always work through `codemode` when it is available; every task and session): run tool calls inside codemode scripts — batch independent calls with `Promise.allSettled`, chain dependent ones, filter output in the script, and show images with `image()` (more reliable than `read` on fresh screenshots). Call a tool directly only when codemode is unavailable or fails.

## Modifying Files

ALWAYS use built-in **write/edit** tool.
Scripts and MCP are fallbacks, allowed ONLY when the write/edit tool cannot do the job:

1. Language-based script (Python/Node/sed/awk) — bulk/mechanical changes (e.g. 1000+ replacements), generated or machine-owned files.
2. ast-grep (CLI) — structural/AST-level edits (see File Tools Guidelines).
3. Editing MCP server — only if installed and strictly required.

Shell redirection (`cat >`, `echo >>`, `sed -i`, heredocs) is NOT a first-choice edit tool. It sits in the fallback tier, never the default.

## Address User's requests

Apply to every request, before any action (reading, checking, searching, editing, writing, running commands, planning todos).

1. **Identify** — restate the actual ask.
2. **Break down** — split it into detailed todos before real work; nest sub-tasks (`parentId`) when a task has real sub-steps worth tracking closely.
3. **Verify** — first todo verifies assumptions against real state.
4. **Track** — keep the step-2 list live while working: update each task as soon as its state changes, not at the end. Batch `todo` calls into one round-trip where that is cheaper.
5. **Synthesize** — fold results into one precise answer.

Todos: 3+ sub-steps or a multi-part request → create them with the `todo` tool **before** starting work (one `in_progress` at a time). 1–2 trivial steps → skip, no overhead.

## Two-way doors swing freely

Two-way (reversible) doors: walk through, show me after.

One-way (irreversible) doors: stop and ask — one question at a time, with your recommendation, using `ask_user_question`. "No" is an acceptable answer.

Never ask for a rubber stamp. If running something could answer the question, run it instead. Questions are for taste and product calls only I can make.

Once I open a one-way door it stays open for that work, subagents included. Come back only if the door turned out different from the one I opened: more at stake than I was told, a check failing, something I didn't know about.

## Response Guidelines

MUST apply this before doing any tasks:

- Non-trivial tasks → apply "Address User's requests" method above.
- Use Caveman **ultra** for non-trivial tasks: terse, no filler, technical substance intact. Off only on explicit "normal mode"/"stop caveman".
- For trivial tasks, use ASD-STE100 Simplified Technical English.
- When working with code related tasks; DO NOT put unnecessary/narrating comments on file/func/method/logic/etc. Prefer self-explaining code. Put comments only on what code can't say: info needed to continue work later, or worth documenting.
- UI work in a project with a design system: the design system IS the design direction. Use its existing tokens, components and patterns; look them up before writing any element. If something is missing, build it once as a reusable, composable component in the system (usable here now and elsewhere later), then use it. Never hand-roll a one-off control or style a native element ad hoc inside a feature.
- After doing certain tasks, always update TODO if any.

## Web Search

Priority:

1. Model's built-in search.
2. Exa MCP (keyless) — check your tool list first. Tools absent (fresh machine, no adapter) → skip to 3.
3. Any other installed tool/plugin/mcp/extension/connector.
4. Fallback: `web-search` skill — `node ~/.agents/skills/web-search/search.mjs "<query>" --purpose "<why>"` (defaults to which provider's model currently used; `--provider` overrides).
5. If all unavailable, do NOT web search — report back to user.

## Browser

- **Visual sim, visual critique, screenshot, "does this look right"** → `browser-use` on real Chrome.
- **Non-visual / scripted browse** — scrape, fill, navigate, DOM assertions, bulk, replay → `lightpanda`.
- `browser-use` always runs headless. Never open a browser window on the owner's desktop.

## Ownership

`~/.agents/AGENTS.md` = SINGLE SOURCE, symlinked to all agents (pi, Claude Code, opencode). Same for skills: `~/.agents/skills/`.

- EDIT this file only; per-agent copies (`~/.pi/agent/`, `~/.claude/CLAUDE.md`, opencode) are symlinks/derived — edits lost.
- Persist: `cd ~/.agents && git add -A && git commit -m "..." && git push` (repo arhen/agents).
- Enforce this rule on every sub-project: creation/modify of AGENTS.md, CLAUDE.md, agents, and skills.

## Pi Extension Release

Source of truth: monorepo `~/Code/personal/pi-extensions/` (repo arhen/pi-extensions), one dir per package under `packages/`. Naming tells type: `pi-core-*` (core set), `pi-add-*` (add-ons), `pi-toolset` (manager).

Release cycle: edit source in monorepo → commit (clean tree) → `npm run release -- [--minor|--major] <pkg>...` from repo root. Script runs the package `check`, bumps, publishes, commits + tags `<pkg>@<version>`, pushes, then `pi update npm:@arhen/<pkg>`. `--dry-run` = check + `npm publish --dry-run` only.

Packages version independently. `pi-toolset` discovers the family from npm at runtime → release it only when its own script changes.
