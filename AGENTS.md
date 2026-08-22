# Global Agent Instructions

## Token Efficiency

`rtk` = output-compacting CLI proxy. Prefix shell cmds to cut token noise. Pass-through for non-compacting cmds — always safe:

See rtk CLI; `rtk help` for usage.

Prefix each chain segment: `rtk git add . && rtk git commit -m "msg" && rtk git push`.
Filter subcmds (err/summary/test) are opt-in — grab when noise high, not auto-added.

## File Tools Guidelines

Search tools (fff-backed: pi built-in `grep`/`find` in override mode; `ffgrep`/`fffind` MCP in Claude Code) beat shell grep/find.
Shell `grep`/`find` (via rtk) only when tools lack needed flags.

Decision ladder:
1. Know file path or fuzzy → fffind (built-in find tool is fff-backed anyway).
2. Any text content, non-code, or broad sweep → ffgrep / built-in grep.
3. Need code semantics — refs not strings, structure not text, or an edit → ast-grep.
4. Both can do it → default fff for speed; escalate to ast-grep only when comments/string false-positives pollute results or you're rewriting.

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
1. Use model's built-in.
2. Use harness tool: installed tool/plugin/mcp/extensions/connectors.
3. If unavailable, do NOT web search — report back to user.

## Pi Extension Release

Source of truth: monorepo `~/Code/personal/pi-extensions/` (repo arhen/pi-extensions), one dir per package under `packages/`. Naming tells type: `pi-core-*` (core set), `pi-add-*` (add-ons), `pi-toolset` (manager).

Release cycle per package: edit source in monorepo → commit+push → `npm version patch && npm publish` from its dir → `pi update npm:@arhen/<pkg>`.

**Family rule:** bump any `pi-core-*` → also bump `pi-toolset` patch (same cycle) — keeps installed core/toolset versions consistent.
