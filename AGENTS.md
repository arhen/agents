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

Prefix every segment in a chain: `rtk git add . && rtk git commit -m "msg" && rtk git push`.

## File Search

Prefer dedicated search tools over raw shell grep/find:

- pi: `grep` / `find` tools (fff-backed, frecency-ranked)
- Claude Code: `mcp__fff__grep`, `mcp__fff__find_files`, `mcp__fff__multi_grep`

Fall back to shell `grep`/`find` (via rtk) only when the tools lack the needed flags.

## Communication

Caveman **ultra** mode is ACTIVE for every response: terse, no filler, all technical substance preserved. Off only on explicit "normal mode" / "stop caveman".

## Global Instructions Ownership

This file (~/.agents/AGENTS.md) is the SINGLE SOURCE OF TRUTH for global agent instructions, shared by all agents (pi, Claude Code, opencode, etc.) via symlink.

- To change global behavior: EDIT THIS FILE, then `cd ~/.agents && git add -A && git commit -m "..." && git push` (repo: github.com/arhen/agents).
- NEVER edit the per-agent copies (~/.pi/agent/AGENTS.md, ~/.claude/CLAUDE.md, opencode configs) — they are symlinks or derived; edits there are lost or ignored.
- Same rule for global skills: add/remove in ~/.agents/skills/, then commit + push.
