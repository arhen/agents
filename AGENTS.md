# Global Agent Instructions

## Token Efficiency

`rtk` = output-compacting CLI proxy. Prefix shell cmds to cut token noise. Pass-through for non-compacting cmds — always safe:

See rtk CLI; `rtk help` for usage.

Prefix each chain segment: `rtk git add . && rtk git commit -m "msg" && rtk git push`.
Filter subcmds (err/summary/test) are opt-in — grab when noise high, not auto-added.

## File Tools Guidelines

Prefer built-in search tools over shell grep/find (shell only when tools lack needed flags).

1. Filename/path, fuzzy → find.
2. Any text content (docs, logs, configs, code) → grep.
3. Code semantics — real refs, structure, or an edit → ast-grep (CLI).
4. Identifier search: grep first; if comment/string false-positives pollute, redo with ast-grep.

## Modifying Files

Use the built-in **edit** tool for every change to an existing file. Use the built-in **write** tool for new files or full rewrites. This is the default — not a preference.

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

## Response Guidelines

MUST apply this before doing any tasks;
- Non-trivial tasks → apply "Address User's requests" method above.
- Use Caveman **ultra** for non-trivial tasks: terse, no filler, technical substance intact. Off only on explicit "normal mode"/"stop caveman".
- For trivial tasks, use ASD-STE100 Simplified Technical English.
- When working with code related tasks; DO NOT put unnecessary/narrating comments on file/func/method/logic/etc. Prefer self-explaining code. Put comment only what code can't say: info needed to continue work later, or worth documenting.

## Ownership

`~/.agents/AGENTS.md` = SINGLE SOURCE, symlinked to all agents (pi, Claude Code, opencode). Same for skills: `~/.agents/skills/`.

- EDIT this file only; per-agent copies (`~/.pi/agent/`, `~/.claude/CLAUDE.md`, opencode) are symlinks/derived — edits lost.
- Persist: `cd ~/.agents && git add -A && git commit -m "..." && git push` (repo arhen/agents).
- Enforce this rule on every sub-project: creation/modify of AGENTS.md, CLAUDE.md, agents, and skills.

## Web Search

Priority:
1. Model's built-in search.
2. Exa MCP (keyless) — check your tool list first: if `mcp_web_search_exa` / `mcp_web_fetch_exa` exist, use them. Search takes `query` + `objective` (describe the page you want, not keywords) + `numResults`; `mcp_web_fetch_exa` reads URLs as markdown, batch them. Registered by `pi-mcp-adapter` as server `exa` in `~/.pi/agent/mcp.json`; tools absent (fresh machine, no adapter) → skip to 3.
3. Any other installed tool/plugin/mcp/extension/connector. `radius_web_search` only when Radius creds exist — otherwise it fails with a missing-key/402 error.
4. Fallback: `web-search` skill — `node ~/.agents/skills/web-search/search.mjs "<query>" --purpose "<why>"` (defaults to first authenticated of kimi-coding → openai-codex → anthropic → deepseek; `--provider` overrides).
5. If all unavailable, do NOT web search — report back to user.

MCP setup/inspection: `mcp({ action: "install", url })`, `mcp()` for server status, `mcp({ search: "..." })` to find tools. Exa MCP is rate-limited but needs no key; for version/release claims search first, then fetch the top URL before quoting it.

## Pi Extension Release

Source of truth: monorepo `~/Code/personal/pi-extensions/` (repo arhen/pi-extensions), one dir per package under `packages/`. Naming tells type: `pi-core-*` (core set), `pi-add-*` (add-ons), `pi-toolset` (manager).

Release cycle per package: edit source in monorepo → commit+push → `npm version patch && npm publish` from its dir → `pi update npm:@arhen/<pkg>`.

**Family rule:** bump any `pi-core-*` → also bump `pi-toolset` patch (same cycle) — keeps installed core/toolset versions consistent.
