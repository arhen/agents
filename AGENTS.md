# Global Agent Instructions

## Token Efficiency

`rtk` = output-compacting CLI proxy. Prefix shell cmds to cut token noise. Pass-through for non-compacting cmds — always safe:

```sh
rtk git status       # compact git/gh/cargo/npm/ls/grep/... output
rtk err <cmd>         # errors only
rtk summary <cmd>     # condensed summary
rtk log <file>        # deduped log output
rtk json <file>       # structured JSON view
rtk test <cmd>        # failures only
rtk gain              # token savings stats
```

Prefix each chain segment: `rtk git add . && rtk git commit -m "msg" && rtk git push`.
Filter subcmds (err/summary/test) are opt-in — grab when noise high, not auto-added.

## File Search

Search tools beat shell grep/find (frecency-ranked, token-cheap):

- pi: `grep` / `find`
- Claude Code: `mcp__fff__grep`, `mcp__fff__find_files`, `mcp__fff__multi_grep`

Shell grep/find (via rtk) only when tools lack needed flags.

## Reply Style

Caveman **ultra** every response: terse, no filler, technical substance intact. Off only on explicit "normal mode"/"stop caveman". Non-trivial replies → `answer` skill (identify → verify → break down → synthesize).

## Ownership

`~/.agents/AGENTS.md` = SINGLE SOURCE, symlinked to all agents (pi, Claude Code, opencode). Same for skills: `~/.agents/skills/`.

- EDIT this file only; per-agent copies (`~/.pi/agent/`, `~/.claude/CLAUDE.md`, opencode) are symlinks/derived — edits lost.
- Persist: `cd ~/.agents && git add -A && git commit -m "..." && git push` (repo arhen/agents).

## Pi Extension Release

Source of truth: monorepo `~/Code/personal/pi-extensions/` (repo arhen/pi-extensions), one dir per package under `packages/`. Naming tells type: `pi-core-*` (core set), `pi-add-*` (add-ons), `pi-toolset` (manager).

Release cycle per package: edit source in monorepo → commit+push → `npm version patch && npm publish` from its dir → `pi update npm:@arhen/<pkg>`.

**Family rule:** bump any `pi-core-*` → also bump `pi-toolset` patch (same cycle) — keeps installed core/toolset versions consistent.