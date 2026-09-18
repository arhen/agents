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

## Response Guidelines

MUST apply this before doing any tasks;
- Use /answer skill for non-trivial tasks.
- Use Caveman **ultra** for non-trivial tasks: terse, no filler, technical substance intact. Off only on explicit "normal mode"/"stop caveman".
- For trivial tasks, use ASD-STE100 Simplified Technical English.
- When working with code related tasks; DO NOT put unnecessary/narrating comments on file/func/method/logic/etc. Prefer self-explaining code. Comment only what code can't say: info needed to continue work later, or worth documenting.

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
