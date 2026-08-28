---
name: stacked-prs
description: >
  Manage PRs that build on each other as a single stack via the gh-stack extension
  (`gh stack`). Use whenever the user asks for stacked PRs, when opening a PR whose base
  is another open PR/branch instead of the default branch, when a change is "based on",
  "stacked on", "depends on", or "blocked by" another PR, or when merging a chain of
  dependent PRs. Replaces the manual branch-off-a-branch + retarget dance.
---

# Stacked PRs with `gh stack`

GitHub ships native stacked-PR support via the `gh-stack` extension (`gh stack` commands).
Prefer it over hand-managing base branches whenever two or more PRs depend on each other.

## When to use

- Opening a PR whose base is another open PR's branch (not the default branch).
- User says "stack this on", "based on #N", "depends on #N", "chained PRs".
- Merging a chain of dependent PRs (the retarget/cleanup is otherwise manual).

Do NOT use it for a single PR, or for PRs that are independent (each off the default
branch). Independent PRs are not a stack — keep them off the default branch individually.

## Prerequisites

`gh stack` is the extension, distinct from `gh pr`. Verify once:

```bash
gh extension list | grep -i stack        # expect: gh stack  github/gh-stack
gh extension install github/gh-stack     # if missing
```

Note: if the shell prefixes `gh` with a wrapper (e.g. `rtk gh`), invoke the real binary —
`/usr/bin/env gh stack ...` — because the wrapper passes `stack` through to `gh pr` and fails.

## Core commands

```bash
gh stack init                 # start a stack from the current branch
gh stack add <branch>         # stack a new branch on top of the current tip
gh stack submit               # push all branches, create/update a PR per branch with
                              # the correct base set (each PR's base = the branch below it)
gh stack view                 # show the stack diagram
gh stack checkout <pr-number> # pull an existing remote stack down and track it locally
gh stack sync                 # re-sync local stack with remote (after the base moves)
gh stack rebase               # rebase the whole stack
gh stack merge                # merge the stack bottom-up, retargeting and cleaning up
gh stack modify               # interactively restructure
```

## The model

A stack is a chain where each PR's **base is the branch below it**, not the default
branch. `gh stack submit` sets those bases for you. GitHub retargets a stacked PR to the
default branch automatically once its base PR merges, so the whole chain merges cleanly
bottom-up.

Example — two dependent changes:

```bash
git checkout -b feature/base            # bottom of the stack
# ... work, commit
gh stack init
gh stack submit                         # creates PR base->develop

git checkout -b feature/on-top          # builds on feature/base
# ... work, commit
gh stack add feature/on-top
gh stack submit                         # creates PR on-top->feature/base
```

Yields: `develop ← PR(base) ← PR(on-top)`. Merging `feature/base` retargets `on-top` to
`develop` with no manual edit.

## Operating rules

- **Review/merge bottom-up.** The bottom PR is self-contained; each upper PR's diff is
  only its own commits when viewed against its base. Never review an upper PR against the
  default branch — that double-counts everything below it. Diff an upper PR against its
  stack base: `git diff <below>...<this>`.
- **The merge lands the chain.** Use `gh stack merge` (or merge the bottom PR on GitHub)
  rather than merging upper PRs individually out of order.
- **Keep it in sync.** If the default branch moves under the stack, `gh stack sync` /
  `gh stack rebase` instead of hand-rebasing each branch.
- **A change to a lower PR's commits invalidates the upper ones** — after amending or
  adding commits low in the stack, `gh stack rebase` before the next review round.
- **Independent work does not belong in the stack.** A change that doesn't depend on the
  branches below it gets its own branch off the default branch, not a stack entry.

## Anti-patterns

- Opening a dependent PR against the default branch and noting "depends on #N" in the
  body — the diff then includes the dependency's changes and double-reviews them. Use the
  stack instead so the base is real.
- Hand-editing a stacked PR's base after the lower PR merges — the platform does this on
  merge; doing it by hand races it.
- Stacking PRs that share no commits — that is just two PRs; keep them off the default
  branch separately.
