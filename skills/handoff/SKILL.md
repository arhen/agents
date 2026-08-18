---
name: handoff
description: >
  Write a handoff document so a fresh agent session can continue the work. Saves to the
  OS temp directory, never the workspace. Use when user says "handoff", "new session",
  "continue in a fresh chat/agent", "context is full", or invokes /handoff.
---

## Where to write

Temp dir, NOT the workspace. Resolve in this order: `$TMPDIR` → `/tmp` (macOS/Linux) →
`%TEMP%` (Windows).

Filename: `handoff-<repo-or-project-name>-<YYYYMMDD-HHMM>.md`

```bash
f="${TMPDIR:-/tmp}/handoff-$(basename "$PWD")-$(date +%Y%m%d-%H%M).md"
```

Write the file, then print the absolute path as the last line so the user can copy it.

## Template

```markdown
# Handoff: <project>

Date: <ISO datetime>
Workspace: <absolute path>
Branch / commit: <git branch @ short sha, dirty?>

## Goal
<1-3 lines: what the user wants overall>

## State
- Done: <bullets, verified facts only>
- In progress: <the one live task + exactly where it stopped>
- Not started: <remaining scope>

## Files touched
- `path` — what changed and why

## Decisions
- <decision> — because <reason>. Rejected: <alternative>.

## Constraints & gotchas
- <env quirks, versions, failing tests, credentials needed, things that bit us>

## Next steps
1. <concrete, runnable action>
2. ...

## Verify
```bash
<the exact command(s) that prove the work is correct>
```
```

## Rules

- Accuracy over brevity. Compress prose, never facts.
- Do not duplicate content already captured in other artifacts (specs, plans, ADRs,
  issues, commits, diffs). Reference them by path or URL instead.
- Verbatim: file paths, commands, symbol names, error strings, versions.
- Only state what happened. No guesses. Unknown = write "unknown".
- Drop tool-call narration, dead ends already resolved, and repeated text.
- Omit any empty section. Do not write "N/A" placeholders.
- Target under 150 lines. A fresh agent must be productive after one read.
- Never put secrets in the file. Reference the env var name only.
