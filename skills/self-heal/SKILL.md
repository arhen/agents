---
name: self-heal
description: "When a skill, extension, or instruction (AGENTS.md) fails or is measurably broken during work, hand the repair to a detached pi session instead of fixing inline. Use on repeated tool failures, broken skill scripts, extension load errors, or misfiring documented rules. Never triggers inside a self-heal session (SELF_HEAL=1)."
---

# Self-Heal

Fixing your own tooling inline derails the current task. Defer: record evidence, spawn a detached fixer, keep working.

## When to trigger

- Same skill/extension/instruction fails **2+ times** in one session, OR
- A documented contract is broken (skill script errors, extension fails to load, AGENTS.md rule produces wrong behavior)

One-off hiccups, network flakes, and user error do NOT trigger this skill.

## Scope

| In scope | Out of scope |
|----------|--------------|
| `~/.agents/**` (skills, AGENTS.md) | pi core itself |
| `~/Code/personal/pi-extensions/packages/**` (`@arhen/*` only) | third-party npm packages (`@narumitw/*`, `@ff-labs/*`, …) |

Out-of-scope bug → report it to the user in one line and move on. Do not heal.

## Procedure

### 1. Write the evidence bundle

`~/.agents/self-heal-queue/<unix-ts>-<slug>.md`:

```markdown
# self-heal: <slug>

## Target
<absolute path of broken file/package>

## Evidence
<command run + full error output, or description of the misfire with the rule quoted>

## Suspected cause
<best guess, may be wrong>

## Suggested fix
<concrete, minimal>
```

### 2. Spawn the fixer (detached)

Recursion guard: if `SELF_HEAL=1` is set in the environment, skip this skill entirely.

Prefer herdr when `HERDR_ENV=1`:

```bash
herdr pane split --current --direction right --cwd "<owning-repo>" --no-focus
herdr pane run --pane <pane_id> "SELF_HEAL=1 pi -p 'Read ~/.agents/self-heal-queue/<ts>-<slug>.md and fix the target. Verify the fix works (load it, run it, or bun test) BEFORE committing. Then follow the commit rules in the bundle.'"
```

Otherwise tmux:

```bash
tmux new-session -d -s "heal-<slug>" "cd <owning-repo> && SELF_HEAL=1 pi -p 'Read ~/.agents/self-heal-queue/<ts>-<slug>.md and fix the target. Verify the fix works (load it, run it, or bun test) BEFORE committing. Then follow the commit rules in the bundle.'"
```

Owning repo resolves by target path:
- `~/.agents/**` → `~/.agents`
- `~/Code/personal/pi-extensions/**` → `~/Code/personal/pi-extensions`

### 3. Continue original work immediately

Tell the user in one line: `self-heal spawned for <target> (pane/session heal-<slug>)`. Then resume the task that was interrupted. Never wait on the fixer.

## Fixer rules (the spawned session)

1. Verify the fix BEFORE committing: run the script, load the extension, or `bun test`. A fix without proof is not a fix.
2. Commit rules:
   - `~/.agents` → commit + push to `main` directly.
   - `pi-extensions` → commit + push to branch `heal/<slug>`. Do NOT merge, do NOT publish — the user merges and runs the release cycle.
3. Write `~/.agents/self-heal-queue/<ts>-<slug>.done.md` with: what changed, verification output, commit/branch ref.
4. If the fix cannot be verified or the cause is unclear, write the `.done.md` with status BLOCKED and stop. Do not guess-commit.

## Cooldown

Before spawning, check `~/.agents/self-heal-queue/` for a `<*>-<slug>.md` younger than 24h. If one exists, skip — do not re-heal the same target within a day.

## Reporting

On any session start, if `*.done.md` files exist in the queue, surface them to the user in one line each (healed / blocked, ref), then leave files in place. User prunes.
