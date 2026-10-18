---
name: promote-to-prod
description: Promote and deploy frndOS to production — review merges and migrations, start the web build early, run guarded ClickHouse schema-sync and API/AI deployments, track automatic data CI and Amplify through AWS CLI, verify health, and write deploy notes. Use when the user says "promote to prod", "ship to prod", or "release". Bare invocation stops at the report; production writes wait for an explicit "deploy".
---

# Promote to Production

Promotes all five frndOS repositories as one coordinated release, resolves
prod-first hotfix drift, and produces a deploy-notes document.

## Approval and publishing authority

### Report gate — wait for "deploy" (owner, 2026-10-18)

A bare **"promote to prod"** / `/promote-to-prod` (also "ship to prod", "release")
means **prepare and report only**: run Steps 0–5 (readiness gate, fetch, trial
merges, classification, deploy notes), present the Step 6 report, then **stop**.
No production pushes, no transformer PR, no flag creation, no `frndos-deploy`, no AI
pull/restart, no schema-sync apply, no Amplify trigger. The owner reads the report
first. Proceed to publishing only after the owner explicitly says **deploy** (or an
equivalent clear go, e.g. "go ahead and deploy") in a later message.

Skip the wait only when the **first** request already asks for both, e.g.
"promote to prod and deploy" / "promote and deploy". Then still present the report,
and proceed without a second confirmation once all gates pass.

An instruction mid-run to hold ("don't deploy yet", "let me read first") always
wins over an earlier deploy request.

### Scope of a deploy go

Once the deploy go above exists, it is the user's approval for the requested
application production pushes and the routine deployment operations documented in
[the deployment runbook](references/deployment-runbook.md), once verification passes:
API `sudo frndos-deploy`, AI fast-forward pull plus production Supervisor restart,
and one existing guarded production `schema-sync/schema-sync` apply when the marts
are behind the approved release. This operational scope was explicitly requested
by the owner on 2026-10-14. Record requested repos, targets, migration impact and
authority in the release notes; **do not ask for the same routine approval again**.
Loading this skill, a question about promotion, or a dry-run/audit/notes-only request
does not authorize production writes. More restrictive workspace/repo instructions
still win; obtain any separately required operation approval rather than bypassing it.

Treat pushes as deployment-capable; verify actual delivery paths, prechecks and
source/target freshness. Expanded scope, missing access and unresolved migration
risks still need user input. Routine deployment approval is not approval for ad-hoc
Cloud DDL/DML, stamping, backfills, arbitrary Artisan commands, connector changes,
block/profile edits, deployment registration, configuration changes or force-pushes.

Push approval does not override repository publishing restrictions. The
transformer is PR-only: never push directly to its `development` or `main`, and
never merge your own PR. Prepare its promotion PR for the owner. Newly merged
`main` code is used on the next production Prefect run, with no separate build
step. Do not remove that gate by changing this skill; current workspace/repo
instructions still require it.

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

## Step 0 — Readiness gate (before release work)

Read [the deployment runbook](references/deployment-runbook.md) fully and perform its
read-only preflight **before trial merges, release pushes or deployments**. Verify:

- AWS CLI session with STS; correct account/region, Amplify app/repository/domain,
  production branch and usable job-status access.
- Actual SSH connectivity to **all three** machines (vm-ext, vm-stg, vm-prod), not
  merely an enabled Herdr entry; correct identities, paths, branches, commands and
  noninteractive permissions for the requested deployment operations.
- Shared Prefect authentication, existing production deployment identity/pull/env,
  worker/queue readiness and migration concurrency limit; data-service Deploy
  workflow and runner access/availability.
- Actual staging/production ClickHouse lineage/metadata access, using bounded
  read retries when idle clusters wake. Record any API migration/env/scheduler
  prerequisites that the candidate review must resolve.

**Fail closed on missing access/readiness.** Request login or an operator decision
now, then re-run the failed checks; do not start Amplify and discover later that AWS
login or a backend machine is inaccessible. Publish only after all remaining
candidate-specific flag/config/migration gates also pass. A preflight never pulls
code, restarts a service, applies DDL, creates a flow or registers deployments.
Record results/time in release notes and recheck freshness before each write.

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
Do not re-register deployments, edit blocks or change the active Prefect profile.
The only routine flow operation authorized by a production invocation is the verified
existing `schema-sync/schema-sync` apply described in the runbook, with the approved
required revision. Other production, ingestion and backfill flows need separate approval.
A timed-out metadata read may be ClickHouse waking from idle; retry reads with bounded
backoff. A failed or timed-out migration run is different: inspect its existing run ID,
stop on refusal/partial failure, and never create another run blindly.

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

### Production API deployment

On `vm-prod`, from `/var/www/frndos.com/api`, use **`sudo frndos-deploy`** after the
migration/preflight review. The installed wrapper pulls fast-forward, installs
Composer deps, runs migrations and in-place cache rebuilds as `www-data`, then
restarts queues gracefully. Do not replace it with root-run Artisan commands,
`optimize:clear`, or an unnecessary PHP-FPM restart. For separately approved custom
commands: `sudo -u www-data -H php artisan <command>` from that directory.

Read [the deployment runbook](references/deployment-runbook.md) before any deployment.

## Step 6 — Report and publish the approved scope

Report: per-service merge result, how each conflict was resolved and what proves it,
then the notes (flags → envs → packages → migrations → commands → order), then the
drift left to backport.

**Default execution: overlap the web build with backend work.** After all release
prechecks, access checks, flag/config decisions and transformer owner-publication
gates pass, start the approved web production build first and capture its exact
Amplify job. While it builds, complete guarded ClickHouse readiness → AI deployment
→ automatic data-service CI → API deployment. Poll Amplify via AWS CLI throughout;
finish only when that job and every backend readiness/health check pass.

Web builds often take about ten minutes; that is an estimate, **not a deployment
barrier**. Verify the candidate can safely coexist with current backends or is
protected by already-approved rollout gates before early publication. If a live
UI/contract change cannot coexist, keep web last or use an existing build-only/
activation barrier; do not invent an unsupported Amplify pause. If backend work
fails, stop/hold this release's in-flight web job where supported and authorized;
never stop another release's job or silently roll back a deployed site. Readiness,
not elapsed time or push timing, determines when the coordinated release is done.

The runbook contains machine discovery, exact commands, ClickHouse cold-start
handling, data CI and AWS Amplify job verification. Read it fully before publishing.

A repo whose merged tree is identical to production needs no code deployment;
still check schema/config readiness. Do not mark a pushed commit as deployed
until its deployment and health are separately verified. An orchestration merge
has no build job: verify its source ref and, with operator authorization, a real
sync rather than interpreting absent deployment CI as success.

**Stop here after the report unless a deploy go exists** (see
[Report gate](#report-gate--wait-for-deploy-owner-2026-10-18)). Bare "promote to
prod" ends at the report: end the turn with a short line telling the owner to say
**deploy** when ready. With a deploy go (later "deploy" message, or a first request
that said "promote … and deploy"), proceed with allowed application production
pushes after verification without a redundant approval question. Pipeline owner
merge and unresolved prechecks remain required; invocation never bypasses the
transformer's PR-only publishing rules.

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

Report the URL. If Step 9 is declined, stop here.

## Step 9 — Offer a release video (optional)

After the Lark note exists, offer a ~1-minute video for it. **Offer, do not assume.**
It is a separate, slower job (hours, real AI spend), so say that when offering. Ask in
one question: go/no-go, voice (warm calm male is the default), music on/off.

### Hard rules

- **Show the real product.** Screen-record the actual release build. Coded or animated
  recreations of the UI were rejected — they drift from the real product and read as fake.
  Remotion (or similar) is for title cards, captions, framing and assembly ONLY.
- **Same claims as the note.** A scene may show only what the Lark note says is live
  (Step 8 flag cross-check). Off-flag features appear as "coming soon" text, never as UI.
- **Never record production.** Run the release refs locally on separate ports
  (`git worktree` per service at the pushed prod SHAs, own deps, release migrations
  applied) so the user's dev servers and data stay untouched. Back up the local DB first
  (`pg_dump -Fc`).
- **Production-equivalent flags, zero analytics.** Match live flag values; block PostHog
  capture/recording/surveys and Sentry per tab (CDP `Network.setBlockedURLs`).
- **Privacy.** A dedicated local workspace + brand with seeded, invented data. No real
  customers, other brands, internal chats or meetings in frame. Live integrations that
  read real accounts (Lark calendar on Home, etc.) must be cut off for the release API
  (point their base URL at a dead port) or primed with seed data.
- **Ask before uploads go to a shared bucket.** Local API uploads may land in the same S3
  bucket as staging/production. Log every key created in a manifest.
- **Secrets via files.** ElevenLabs key in `~/.config/elevenlabs.key` (mode 600), never in
  chat, commands or commits. A key *ID* is not the key (`api_key_id_used_as_api_key`).

### Seed rich, real data first

Every scene needs believable content before recording, created through the real API/UI
where possible: brand profile (logo, DNA, palette, type), a project, a multi-chapter
story, real AI-generated artboards, a mixed proposal PDF for scorecards, a full week of
tasks and events dated relative to the take day. Give the local workspace a plan and
credits or every AI feature is blocked. Record every created row, S3 key, changed
setting and cache key in `seed-manifest.json` — cleanup deletes exactly that list.

### Recording

- 1920x1080, continuous CDP `Page.startScreencast` from a second process (≈60-90 fps
  JPEG frames + timestamps), a visible injected cursor with click ripples, the Next.js dev
  indicator hidden. The tab must be **visible and focused** (`Emulation.setFocusEmulationEnabled`)
  or input and frames stall.
- **Type live at human pace** (60-90 ms/char with jitter, pauses at punctuation). Never
  paste. Select-all is `Input.dispatchKeyEvent` with `modifiers=4` + `commands:["selectAll"]`;
  a `"Meta+a"` key string silently does nothing and leaves prefilled text in the field.
- Leave the typed part of each scene empty before its take; rehearse once, then record.
- Logged-out views (client approval links) go in an isolated browser context.
- If the take must read as "morning", shift only the read endpoints that render the day
  and the browser `Date` (Proxy, injected before page scripts). Never shift the clock for
  writes, uploads or AI runs — S3 presigned URLs fail and JWT `iat` checks reject tokens.

### Edit

- Convert takes to constant 30 fps clips; time-lapse AI waits; mark beats while recording.
- Voice-over: one ElevenLabs clip per scene with timestamps. **Place each VO at the top
  level, sized to its own length** — nesting it inside a scene Sequence cuts it off at the
  scene's end. When one line spans two scenes, cut on the gap between its sentences using
  the character alignment.
- Music bed ducked well under the voice; loudness-normalise the master to about -16 LUFS.
- Verify before publishing: render VO-only and cross-correlate each line against its
  source (whole clip and last 0.5 s must match); decode the whole file with no errors;
  review one frame per second for privacy.

### Publish and clean up

Insert into the Lark note as an inline player (`docs +media-insert --type file
--file-view preview`, relative path, before the first section). To replace a video,
insert the new one, then delete the old block by its root-child index and re-fetch the
doc. Give the user the local file path. Clean up from the manifest only after the user
approves the video, and remind them to rotate any key pasted in chat.
