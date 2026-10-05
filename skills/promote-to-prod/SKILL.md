---
name: promote-to-prod
description: Promote the integration branch of each frndOS service to its production branch — merge, resolve conflicts against the prod-first hotfix drift, verify, and produce the pre-deploy notes (envs, packages, migrations, feature flags, commands, order). Use when the user says "promote to prod", "promote develop/development to production", "ship to prod", or "release".
---

# Promote to Production

Promotes all five frndOS repositories as one coordinated release, resolves
prod-first hotfix drift, and produces a deploy-notes document.

**Never push production or deploy without explicit confirmation.** Merge locally,
report, ask. Application production pushes trigger deployment. The transformer is
PR-only: never push directly to its `development` or `main`, and never merge your
own PR. Prepare its promotion PR for the owner; newly merged `main` code is used
on the next production Prefect run, with no separate build/deploy step.

## Branch map

| Service | Repository | Source | Target |
|---|---|---|---|
| `api/` | `alva-intelligence/frnd-api-php` | `staging` | `production` |
| `web/` | `alva-intelligence/frnd-web` | `develop` | `production` |
| `ai-service/` | `alva-intelligence/frnd-ai-services` | `development` | `frndos-main` |
| `data-service/` | `alva-intelligence/frnd-clickhouse-api` | `development` | `frndos-main` |
| `data-pipeline/` | `alva-intelligence/frnd-orchestration` | `development` | `main` |

`data-pipeline/` is the optional workspace checkout name; `frnd-orchestration` is
the transformer repository. If absent, use an isolated temporary clone of that
repo for the release rather than silently omitting it or starting onboarding.

### Transformer and activation/consumer boundary

```text
Fivetran raw data → frnd-orchestration → ClickHouse marts → data-service → api → web
                         ↑                                |
                         └──── Prefect activation ────────┘
```

- **frnd-orchestration:** transforms raw → staging → `frnd_agg_marts`; owns mart
  schema and the guarded Alembic revisions.
- **data-service:** activates/triggers Prefect flows and consumes marts through
  tenant-scoped serving APIs. It still owns its non-mart databases and migrations.
- A column existing is not proof the transformer writes it; a green Prefect run
  is not proof data was loaded. Review code, schema, loader gates, callback shapes,
  platform registries, canonical fields, and shared placement dictionaries together.
- Do not assume a separate data-team deployment lane. Include the transformer
  source promotion and assess its normal guarded migration path in this release;
  record any operator-owned migration steps explicitly, never as already done.

api promotes from **`staging`, not `develop`** — staging is a superset of develop
(verify with `git rev-list --left-right --count origin/staging...origin/develop`;
the develop-only side should be 0). If it isn't, stop and ask.

## Why this is not just `git merge`

Hotfixes get applied to `production` first, then hand-cherry-picked back to
develop/staging. The cherry-picks have historically been botched — see the
`repair botched cherry-pick …` and `restore two hotfixes the prod cherry-picks
silently dropped` commits in api. So both branches carry the same fix written two
different ways, which is exactly what produces the conflicts, and picking the
wrong side silently reverts a live production fix.

**The rule: never resolve a conflict by side ("ours"/"theirs") until you have
proved by content which side is newer.** See [Step 3](#step-3--classify-the-prod-only-commits).

## Step 1 — Fetch and measure

```bash
for d in api web ai-service data-service data-pipeline; do
  if [ -d "$d/.git" ] || [ -f "$d/.git" ]; then git -C "$d" fetch origin --prune -q; fi
done
# If data-pipeline is absent, clone alva-intelligence/frnd-orchestration into
# $SCRATCH/frnd-orchestration and fetch/check development and main there too.
# per service (prod-only count, dev-only count)
git -C api rev-list --left-right --count origin/production...origin/staging
```

A non-zero **prod-only** count is the drift. That is the thing to investigate.
Freeze and record source/target SHAs for all five repos. Re-fetch immediately before
any release push or owner merge; if either ref moved, re-run the relevant merge and
checks. Do not force-push or treat a moved target as an authorization to overwrite it.

## Step 2 — Trial-merge in throwaway worktrees

Never trial-merge in the live working directory.

```bash
git -C "$repo" worktree add --detach "$SCRATCH/$repo" origin/$PROD -q
git -C "$SCRATCH/$repo" merge --no-commit --no-ff origin/$DEV
git -C "$SCRATCH/$repo" diff --name-only --diff-filter=U   # conflict list
```

For the transformer, name a release branch for its promotion PR after reviewing
the trial merge. Do not modify shared `development` or `main` directly.
Remove scratch worktrees only after their commits are safely referenced on remote
branches and no uncommitted work remains. Do not force-remove unresolved work.

## Step 3 — Classify the prod-only commits

For each service with prod-only commits:

```bash
# patch-id equivalence: '-' = already upstream, '+' = not (may still be a
# reworded/refactored cherry-pick, so '+' is a QUESTION, not a verdict)
git cherry -v origin/$DEV origin/$PROD

# then match by subject — a twin subject means it was applied twice
git log --no-merges --format='%s' $(git merge-base origin/$PROD origin/$DEV)..origin/$DEV > /tmp/dev_subjects.txt
git cherry origin/$DEV origin/$PROD | grep '^+' | awk '{print $2}' | while read sha; do
  subj=$(git log -1 --format='%s' "$sha")
  grep -Fxq "$subj" /tmp/dev_subjects.txt && echo "TWIN     $sha $subj" || echo "PROD-ONLY $sha $subj"
done
```

For every remaining `PROD-ONLY` commit, **verify by content**, not by history — the
fix is often present upstream under a different commit or in a different file:

```bash
git show --stat --format='' "$sha"                     # what files it touched
git diff origin/$DEV origin/$PROD -- <those files>     # empty ⇒ already upstream
git grep -n '<the symbol it added>' origin/$DEV -- app # present ⇒ already upstream
```

Only a commit that survives **all** of these is genuinely prod-only, and only then
does its side of a conflict win.

## Step 4 — Resolve, then prove the resolution

Resolve each conflicted file toward whichever side Step 3 proved newer (in the
2026-07-15 run that was `--theirs` / staging for all 11 api files, because staging
held the *repaired* copies and had additionally refactored the webhook fan-out into
`ProcessOwnedPostsSyncEndJob`).

Then prove it — do not trust the resolution:

```bash
# what prod-unique content survived? scope to real code, not docs/tests
git diff --stat origin/$DEV -- app routes bootstrap config database
```

Read every surviving line and confirm it is a genuine prod-only fix. An empty diff
means the source branch was a strict superset — the strongest possible result.

Then lint/typecheck the merged tree:

- api: `php -l` every changed `.php` file.
- web: `bunx tsc --noEmit` on the merged tree **and** on the source branch, then
  diff the two error sets. This repo carries a few hundred pre-existing tsc errors,
  so an absolute count is meaningless — only *new* errors matter.
- ai/data/transformer: syntax and lint/static review compared with the target/source
  baseline. Respect each repo's permission requirement before writing/running tests;
  never import application/flow code just to compile it or run a Cloud-write script.
- transformer: prove the Alembic graph has one head, verify cross-repo contract
  copies against the data-service release candidate, and inspect migration guards
  and runtime dependency changes. Read `AGENTS.md`, `REVIEW.md`, and `KNOWLEDGE.md`.
  Complete written self-review and security review before opening the promotion PR.

## Step 5 — Build the deploy notes

Diff `$PROD..$DEV` for each item. Write the findings to
`docs/prod-promotion-<YYYY-MM-DD>.md`.

### Feature flags — the trap that will bite

The api `FeatureFlag` middleware and web's `useMajorFeatureFlag` both **default ON**
when a flag is undefined. Only `feature.flag:<key>,off` (api) and
`useExperimentalFeatureFlag` (web) are fail-closed.

**So a new gate whose PostHog flag was never created ships the feature LIVE.**

```bash
# new api gates
git -C api grep -h -oE "feature\.flag:[a-z0-9-]+" origin/$PROD | sort -u > /tmp/a.txt
git -C api grep -h -oE "feature\.flag:[a-z0-9-]+" origin/$DEV  | sort -u > /tmp/b.txt
comm -13 /tmp/a.txt /tmp/b.txt
```

For every new key: check it exists in PostHog (project 389744, `feature-flag-get-all`
with `search`), note whether the gate carries `,off`, and **create any missing flag
as boolean / 0% rollout / active** before the deploy. dev and staging force these on
in code, so 0% only affects production. Mirror `show-pitch` (id 759635).

### Env vars

```bash
# api: new env() keys in config/, and whether they have a default
git -C api grep -h -oE "env\('[A-Z0-9_]+'" origin/$PROD -- config | sed "s/env('//" | sort -u > /tmp/a.txt
git -C api grep -h -oE "env\('[A-Z0-9_]+'" origin/$DEV  -- config | sed "s/env('//" | sort -u > /tmp/b.txt
comm -13 /tmp/a.txt /tmp/b.txt
# web
git -C web grep -h -oE 'process\.env\.[A-Z0-9_]+' origin/$DEV | sed 's/.*process\.env\.//' | sort -u
# ai/data
git -C ai-service diff origin/$PROD origin/$DEV -- app/utils/config.py
```

Flag any key whose **default is wrong for production** — a localhost default is
worse than no default, because it fails silently rather than loudly.

### Packages

```bash
git -C api diff origin/$PROD origin/$DEV -- composer.json      # separate require from require-dev
git -C web diff origin/$PROD origin/$DEV -- package.json
git -C ai-service   diff origin/$PROD origin/$DEV -- requirements.txt pyproject.toml Dockerfile
git -C data-service diff origin/$PROD origin/$DEV -- requirements.txt pyproject.toml Dockerfile
# Run against the actual transformer checkout/temporary clone too:
git -C "$PIPELINE_REPO" diff origin/main origin/development -- requirements.txt pyproject.toml prefect.yaml scripts/register_paid_deployments.py
```

If a Python dep is unchanged, its **system** libs are already on the host — don't
re-list them (e.g. weasyprint's pango). Only call out OS packages when the dep is new.

### Migrations

```bash
git -C api diff --name-only --diff-filter=A origin/$PROD origin/$DEV -- database/migrations
```

For each, read it and call out: data backfills, chunked deletes, table rewrites,
per-workspace provisioning. Check every `CREATE INDEX CONCURRENTLY` / `VACUUM`
migration declares `public $withinTransaction = false` — without it, Postgres
rejects the statement mid-deploy.

### Transformer migrations and Prefect readiness

Diff `alembic/versions/`, `alembic/env.py`, `tasks/migrate_marts.py`, and
`database/migrations/frnd_agg_marts/v2/` against `main`. Read each new revision.
Read-only verify the **actual** production `alembic_version` and `system.columns`;
repository prose may be stale. Check the data-service deploy target's actual
`CH_HOST` through the operator without exposing credentials.

The normal transformer sync calls guarded migrations before transforming. Review
which revisions will run, required grantee/row policies, and migration concurrency
limits. A blocked migration can leave a successful flow with warn-skipped loaders;
do not report that as a working release. Mart migrations belong to orchestration,
not data-service. Never stamp `head` to bypass unapplied work, run ad-hoc Cloud DDL,
or execute migrations/flows without explicit operation-specific authorization.

Production deployments normally pull `main`; staging deployments pull
`development`. Confirm registered pull steps, job environment, worker readiness,
and the deployment IDs used by the data-service candidate. Branch alone does not
select the ClickHouse cluster. Preserve existing deployment names and IDs,
especially `platform-pipeline/webhook-sync` and `connector-cleanup/webhook-delete`.
Do not re-register deployments, edit blocks, change the active Prefect profile,
or trigger production/backfill flows as a promotion side effect.

Record required production checks as gates, not future assumptions. Where an
operator runs migrations, verify the resulting schema/recorded lineage before
schema-dependent consumers deploy. Record PostgreSQL unique-index duplicate-row
preflights and required environment configuration separately; ClickHouse readiness
does not satisfy the API's PostgreSQL or Lark checks.

### Scheduled tasks and commands

```bash
git -C api diff origin/$PROD origin/$DEV -- bootstrap/app.php routes/console.php
git -C api diff --name-only --diff-filter=A origin/$PROD origin/$DEV -- app/Console/Commands
```

### Standard command set (api)

```bash
php artisan migrate --force
php artisan config:cache && php artisan route:cache
php artisan queue:restart      # new jobs won't run on stale workers
```

## Step 6 — Report and stop

Report: per-service merge result, how each conflict was resolved and what proves it,
then the notes (flags → envs → packages → migrations → commands → order), then the
drift left to backport.

**Default dependency order:** explicit flag/config decisions → transformer
promotion PR owner merge and migration/runtime readiness → ai-service →
data-service (activation/consumer) → api (PostgreSQL migrations, cache refresh,
queue restart) → web. Readiness, not push timing, determines when the next stage
can proceed. "All together" means one coordinated release, not five simultaneous
pushes into asynchronous deployments.

A repo whose merged tree is identical to production needs no code deployment;
still check schema/config readiness. Do not mark a pushed commit as deployed
until its deployment and health are separately verified. An orchestration merge
has no build job: verify its source ref and, with operator authorization, a real
sync rather than interpreting absent deployment CI as success.

Ask before production pushes unless the user already explicitly approved the
reviewed scope. Pipeline owner merge and unresolved prechecks remain required;
never treat application push approval as permission to bypass pipeline PR rules.

## Step 7 — Close the drift

Any hotfix that lives only on a production target (`production`, `frndos-main`,
or transformer `main`) after the promotion is still missing from
develop/staging, and the next promotion will hit the same conflict. Offer to merge
`production` back into the integration branch.

## Step 8 — Offer a Lark release note (optional)

Once the promotion is actually done — pushed, deployed, flags set — offer to write a
release note in Lark for the team and stakeholders. **Offer, do not assume.** Ask via
the ask tool; skip silently if declined.

This is a DIFFERENT document from `docs/prod-promotion-<date>.md`. That one is the
engineering record. This one is for people who did not read the diff.

### What goes in, what stays out

| Include | Exclude |
|---|---|
| What people can now do | Branch names, commit hashes, merge conflicts |
| What got easier or clearer | Env vars, migrations, package versions, deploy commands |
| What stopped going wrong | Flag keys, internal service names, permission slugs |
| Features prepared but not switched on | Anything a user cannot see or feel |

Rules that keep it honest:

- **Group by what already happened**, not by service. "New", "Changed", "Improved",
  "Fixed", and a short "Not yet available" for anything shipped behind an OFF flag.
  A stakeholder does not care that api and web are separate repositories.
- **Only claim what a user can actually reach.** Cross-check every headline against
  the real flag state from Step 5 — a fail-closed flag at 0%, inactive, or scoped to
  `environment = staging` means the feature is NOT live, however complete the code is.
  Shipping a note that claims an invisible feature is the fastest way to lose the
  document's credibility.
- **Simplified English.** Short sentences, one idea each. Say "connected services"
  not MCP, "access rules" not RBAC, "app performance data" not AppsFlyer mart.
  Product names users already see (Brand IQ, AskFRND, KV Studio) are fine.
- **Detailed but compact.** Every bullet earns its line. Merge near-duplicate fixes
  into one plain statement rather than listing forty commits.

### Gathering the material

The merge ranges from Step 1 are the input. Read commit subjects and, where a subject
is unclear, the diff — then translate. Parallel read-only subagents work well here,
one per service, each returning grouped plain-language bullets plus the hashes it
checked. Never let a subagent write the document or invent a feature.

De-duplicate across services afterwards: one user-visible capability usually spans
api + web + ai-service and must appear as a single bullet.

### Writing it

Match the house style of the previous release note (fetch the last one and mirror it)
rather than inventing a new layout each time. The established shape:

- Title, then an opening callout with the one-sentence point of the release
- Emoji section headings (`# ✨ New`, `# 🔄 Changed`, `# ⚡ Improved`, `# 🔧 Fixed`)
- Two-column tables for feature lists (`Feature` / `What it does`) and fixes
  (`Issue` / `Now`) — tables read faster than long bullet runs
- A three-column grid of short callout cards for the improvement themes
- A yellow callout for anything prepared but switched off
- A closing gray callout noting that features may roll out gradually

```bash
# Confirm the Lark user token is valid first — a bot token cannot create docs.
lark-cli auth status

# Ask where it goes. Personal library is the safe default: private draft,
# shareable after review.
cd /tmp && lark-cli docs +create --api-version v1 --as user \
  --wiki-space my_library \
  --title "<Product> Product Update — <Month Year>" \
  --markdown @release-note.md

# Re-read what landed. Do not trust the create response alone.
lark-cli docs +fetch --api-version v1 --as user --doc '<url>' --format pretty
```

If the token has expired, print the `lark-cli auth login --scope '...'` command from
the `lark-sync` skill and wait — do not fall back to the bot identity, which creates
the document under the wrong owner.

`--markdown @file` requires a **relative** path, so `cd` to the file's directory first.
To restyle an existing note, use `docs +update --mode overwrite` with `--new-title`
rather than creating a second document.

Report the URL and stop.
