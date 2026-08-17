# Global Agent Instructions

## Token Efficiency

Run shell commands through `rtk` (token-optimized CLI proxy) to compact output:

```sh
rtk git status          # compacts git/gh/cargo/npm/ls/grep/... output
rtk err <cmd>           # errors only
rtk summary <cmd>       # condensed summary
rtk log <file>          # deduped log output
rtk json <file>         # structured JSON view
rtk test <cmd>          # failures only
rtk gain                # token savings stats
```

Prefix each chain segment: `rtk git add . && rtk git commit -m "msg" && rtk git push`.

## File Search

Prefer search tools over raw shell grep/find:

- pi: `grep` / `find` (fff-backed, frecency-ranked)
- Claude Code: `mcp__fff__grep`, `mcp__fff__find_files`, `mcp__fff__multi_grep`

Fall back to shell `grep`/`find` (via rtk) only when tools lack flags needed.

## Communication

Caveman **ultra** mode ACTIVE for every response: terse, no filler, technical substance preserved. Off only on explicit "normal mode" / "stop caveman".

## How to Reply

Use answer skill.

## Global Instructions Ownership

This file (`~/.agents/AGENTS.md`) = SINGLE SOURCE OF TRUTH for global agent instructions, shared via symlink by pi, Claude Code, opencode, etc.

- Change global behavior: EDIT THIS FILE, then `cd ~/.agents && git add -A && git commit -m "..." && git push` (repo: github.com/arhen/agents).
- NEVER edit per-agent copies (`~/.pi/agent/AGENTS.md`, `~/.claude/CLAUDE.md`, opencode configs) — symlinks/derived; edits lost or ignored.
- Same rule for global skills: add/remove in `~/.agents/skills/`, then commit + push.

## Pi Extension Projects

All @arhen/pi-* extension sources live in **monorepo** `~/Code/personal/pi-extensions/` (single source of truth, repo `github.com/arhen/pi-extensions`). One dir per package under `packages/`:

- core: `packages/core/pi-core-subagent`, `packages/core/pi-core-todo`, `packages/core/pi-core-ask`, `packages/core/pi-core-vision`, `packages/core/pi-core-skill-tool`, `packages/core/pi-core-tps-stats`
- add: `packages/add/pi-add-9router`, `packages/add/pi-add-vantis`, `packages/add/pi-add-wafer`, `packages/add/pi-add-code-diagnostic`
- manager: `packages/pi-toolset`

Old per-package repos (`~/code/personal/pi/...`) archived (README points to monorepo) — do NOT edit/push there.

Update extension: edit source in monorepo, `git commit && git push`, then `npm version patch && npm publish` from package dir and `pi update npm:@arhen/<pkg>`.

**Family version rule:** bump any @arhen/pi-core-* package → also bump `pi-toolset` patch (`cd ~/Code/personal/pi-extensions/packages/pi-toolset && npm version patch && npm publish && git push`) so family version tracks installed core set.

Update global skills/config in `~/.agents/` as above.