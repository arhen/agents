# frndOS production deployment runbook

Read fully before production writes. A bare "promote to prod" authorizes only preparation and the report; production writes need the owner's explicit **deploy** go (a later "deploy" message, or a first request that said "promote … and deploy") — see SKILL.md "Report gate". A deploy go authorizes only the routine operations enumerated by SKILL.md, after review and prechecks. Repository restrictions, transformer owner-publication gates, migration guards and required separate approvals remain binding.

## 1. Mandatory early readiness gate

Run this read-only gate before trial merges, release publication or deployment. Do
not start the web build while a login, SSH connection or backend prerequisite is
unresolved. Record pass/fail, machine identity, checked refs and timestamps. Obtain
missing login/access/operator decisions early, then repeat the failed checks.
Candidate-specific migration/flag decisions are additional gates after review.

Resolve machines from `herdr machine list --json` when running inside Herdr (`HERDR_ENV=1`); load the Herdr skill first. Do not take over an occupied pane or change focus. Existing SSH config/keys may already provide access: inspect before telling the owner to deploy manually. If outside Herdr, do not inspect its focused session; use known SSH targets or ask for access.

Owner-confirmed mapping (2026-10-14; verify live, do not assume unchanged):

| Machine | SSH target | Production purpose |
|---|---|---|
| vm-ext | root@178.128.110.176 | Shared Prefect server, guarded ClickHouse schema readiness |
| vm-stg | root@146.190.92.155 | AI **production** checkout/program (machine label is not environment) |
| vm-prod | root@157.245.153.184 | API production |

Use explicit hosts and `BatchMode=yes`, bounded `ConnectTimeout`, and existing host-key trust. Never disable host-key verification to solve an access problem. Test an actual read-only SSH command on every requested machine; an enabled/connected Herdr entry alone is not enough. Verify hostname/user, clean checkout, branch, deployed SHA, installed commands and noninteractive execution privileges before mutations. Do not stash, reset, force-pull, reconfigure services or provision access as a promotion side effect. Never print credentials or copy the Prefect password to the laptop.

Early checklist:

| Gate | Read-only evidence required |
|---|---|
| vm-prod/API | SSH succeeds; API directory exists; branch production; installed frndos-deploy matches owner contract; www-data Artisan identity usable; no dirty tracked code; current migrations/scheduler/health accessible |
| vm-stg/AI | SSH succeeds; production AI directory exists; branch frndos-main; Supervisor program exists/RUNNING; actual bind port and health accessible; no dirty tracked code |
| vm-ext/Prefect | SSH succeeds; prefect-ci identity/CLI/profile and jq available; authenticated shared API reachable; registered production schema-sync pulls main with production env; queue/pool active, worker ONLINE, migration limit active; no duplicate active schema run |
| ClickHouse | Staging/production lineage and required metadata readable; actual serving CH_HOST matched; bounded cold-start read retries distinguished from mutation failures |
| Data CI | Deploy/deploy-frndos path and exact target confirmed; GitHub Actions job/log access available and deployment runner online (or current operator confirmation if runner inventory is not exposed) |
| AWS/Amplify | STS succeeds; correct account/region/app/repository/domain/production branch; list-jobs/get-job access and expected automatic Git build configuration verified |

Run only probes at this stage—not frndos-deploy, git pull, Supervisor restart, flow creation, migrations or deployment registration. A wrong branch, missing profile, expired AWS session, offline worker/runner or unreadable required metadata blocks publication. Do not convert an unknown into a guessed pass.

At the early gate, verify AWS CLI authentication with `aws sts get-caller-identity` and identify the correct account/region/app/branch. Verify Amplify list/get job access before publication, not after its build starts. An expired Console login needs the owner's `aws login` (or the configured profile's normal login), then a fresh STS check. Authentication is not deployment authorization; do not change AWS profiles/accounts, app settings, branches or autobuild configuration to work around missing access.

## 2. Start web early, keep backend safety gates

Complete all merge/static/security checks, frozen refs, env/flags and migration preflights first. Resolve required operator decisions and transformer owner publication. Decide early-web compatibility from code and actual rollout state, not build duration.

Default: publish the approved web candidate to production first, capture its automatically triggered Amplify job for the **exact commit**, and do backend work below while the build runs. Ten minutes is a typical build time, not a guarantee. New ungated UI that depends on absent backend routes/schema cannot safely deploy early: keep it last or use an already-supported build-only/activation barrier. Never create a new deployment mechanism or assume Amplify can pause between build and activation.

If a backend gate fails, stop further dependent deployments and inspect this release's own web job. Stop a still-running job only where supported and covered by the release authorization; never cancel another commit's job. If web already deployed, report the compatibility risk and seek an explicit recovery decision—no force-push, history rewrite or silent rollback.

## 3. ClickHouse migration and staging readiness

Before consumers deploy:

1. Determine the approved mart head from the transformer candidate's single Alembic head. Verify published main and development against frozen refs; if either moves, re-review relevant changes. Owner publication remains required; agents must not push shared transformer branches or merge their own PR.
2. Read actual staging/production `frnd_agg_marts.alembic_version` and required `system.columns` metadata. Confirm the serving production `CH_HOST` is the inspected cluster, without disclosing credentials. Do not read customer rows.
3. ClickHouse Cloud can be idle and waking. A 30-second metadata timeout is not evidence of a failed migration. Retry **read-only** metadata with bounded backoff (up to three attempts, 10–30 seconds between them); if still unavailable, record readiness as unverified and stop dependent publication. Never retry writes this way.
4. If production is already at the approved head, do not create an apply run merely to reapply it; still verify required columns and staging convergence. If behind, use the existing guarded schema-sync operation below. Missing columns/lineage or an unstamped cluster must never be fixed with ad-hoc Cloud SQL or `stamp head`.

### Existing shared Prefect access on vm-ext

The CLI/profile belongs to **prefect-ci**, not root:

- HOME: `/home/prefect-ci`
- CLI/venv: `/home/prefect-ci/.venvs/prefect/bin`
- profile: `/home/prefect-ci/.prefect/profiles.toml` (active `ci` when verified)
- shared local API: `http://127.0.0.1:4200/api` on vm-ext

Read/authenticate on that machine. Public `prefect.frndos.com` may return403 while the authenticated local API on the confirmed server works. A process-only API URL override is permitted; never change the active profile or export credentials into chat/local files. Verify the local API is the same shared server before using it, not a developer's ephemeral instance.

Read the registered deployment before any run. Required identity:

- name `schema-sync/schema-sync`, entrypoint `flows/schema_sync_flow.py:schema_sync`;
- Git pull branch `main`, `FRND_ENVIRONMENT=production`;
- work pool `local-pool`, queue `ads`, not paused; current worker ONLINE;
- existing `warehouse-migrate-production` limit active (verified limit1);
- staging has proven the approved target; no existing active schema-sync run to duplicate.

Inspect existing production webhook IDs used by data-service as well; preserve them. Do not re-register deployments, edit blocks, create limits, change profiles or trigger ingestion/backfill flows.

Stream the **reviewed release copy** of the repository's trigger script into the existing service identity. Set REQUIRED_REVISION to the reviewed single head; validate it as an alphanumeric/underscore revision ID before interpolating it into the remote command. Never use an unreviewed future head:

```bash
[[ "$REQUIRED_REVISION" =~ ^[A-Za-z0-9_]+$ ]] || exit 1
ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=yes root@178.128.110.176 \
  "runuser -u prefect-ci -- env PATH=/home/prefect-ci/.venvs/prefect/bin:/usr/local/bin:/usr/bin:/bin PREFECT_API_URL=http://127.0.0.1:4200/api bash -s -- --deployment schema-sync/schema-sync --mode apply --required-revision $REQUIRED_REVISION --wait 900 --poll 10" \
  < "$PIPELINE_RELEASE/scripts/trigger_schema_sync.sh"
```

Record the returned flow-run ID immediately. Poll that run; do not create a replacement because a client timed out. On FAILED, refusal, timeout or partial migration: stop, report last-good/failing step and exact error, and await a human. No automatic fix-forward, stamping, bypass or retry. A successful run must be COMPLETED with target/current/required ancestry proven, no blocked/failed workspaces, and staging convergence verified. Inspect warnings; they are not automatically harmless.

Independently re-read production revision and every required column/type afterward. COMPLETED alone is not proof of populated marts; schema-only apply performs no historical backfill. Record any separate source/Fivetran readiness limitation without changing connectors.

## 4. AI production deployment (vm-stg)

Path: `/var/www/frnd/prod/frndos-ai-service`. Required branch: `frndos-main`. Required Supervisor program: `frndos-ai-prod-service`.

After publishing the approved AI ref and verifying server clean state/current branch, fetch and prove the remote ref equals the approved release SHA. Then:

```bash
cd /var/www/frnd/prod/frndos-ai-service
git pull --ff-only origin frndos-main
supervisorctl restart frndos-ai-prod-service
```

Run over the verified vm-stg SSH target; never infer staging from its name. If runtime dependencies changed, complete the reviewed repo-prescribed install in the existing venv before restart (uv for this repo); missing OS/env prerequisites block deployment. Do not skip them or install unrelated packages globally.

Verify checkout HEAD equals the approved SHA, Supervisor RUNNING, and loopback `/health` on the **actual configured production port**. An external allowlist403 is not application-health proof. Deploy AI before API begins using new request fields/routes. No extra workers or Supervisor configuration changes.

## 5. Data-service deployment is automatic

Push only the approved candidate to `frndos-main` after transformer contract/schema readiness. GitHub `Deploy` runs `deploy-frndos` automatically; do not also run deploy.sh manually. Verify the workflow and that specific job for the exact commit, restart/health evidence, and the deployed production target.

Important: `frndos-main` is **ungated** by the schema gate in deploy.sh/CI; that gate applies only to development/main. Do not expect its push to wait for mart readiness. Its own deploy Alembic lineage covers non-mart databases, not the transformer chain. Preserve production Prefect ID env overrides and inspect actual CH_HOST.

Health is auth-protected. Record the actual response and source contract: the observed HTTPBearer path returns403 JSON `Not authenticated`; this proves an auth-protected app is running, not an authenticated database-health check. Do not misclassify an nginx/Cloudflare403 page as healthy.

## 6. API production deployment (vm-prod)

Path: `/var/www/frndos.com/api`. Required branch: `production`.

Before publishing/running the deploy wrapper, review every migration, required env, duplicate-row/data-update preflight and schedule prerequisite. Routine migration approval does not waive a high-impact/unresolved data-loss decision. Stop before the wrapper if those gates are unresolved. The wrapper will execute migrate --force; do not run it as a harmless probe.

Verify published production equals the approved SHA and server clean branch/upstream are correct. Then run:

```bash
cd /var/www/frndos.com/api
sudo frndos-deploy
```

The observed `/usr/local/bin/frndos-deploy` performs fast-forward pull, Composer install, writable-dir ownership repair, migrations, in-place `artisan optimize`, and graceful `queue:restart`; Artisan runs as www-data on PHP8.5. Verify the installed wrapper before relying on that contract.

Do not clear caches before optimizing or reload PHP-FPM unnecessarily: the owner wrapper deliberately avoids a cache gap and interruption of live AI streams. Its MCP mirror check only prints a warning on failure—run the mirror gate separately and require success when the release changes tools.

For **separately approved** custom Artisan commands, always from the API directory:

```bash
sudo -u www-data -H php artisan <command>
```

Never run Artisan as root. Verify deployed SHA, required migrations Ran, cache/queue completion, applicable `schedule:list` and actual schedule:run provisioning, `/up`200, and new routes registered with JSON Accept/auth-required behavior. Do not re-run the wrapper if the owner already deployed the expected SHA; verify instead.

## 7. AWS Amplify verification while backends deploy

Use the authenticated, verified account/region. Discover the app whose repository/domain matches frnd-web/frndos.com, then its production branch—do not hardcode a stale app ID or select merely by app name or stage enum. Record app ID, region, branch and exact release job ID in deploy notes.

Observed on 2026-10-14: account384354333328, regionap-southeast-1, appd2zs16xfr3zlc8 (frnd-app). Domainfrndos.com maps to branchproduction, whose stage enum is NONE; branchmain has stagePRODUCTION but serves legacy frnd.io. **The domain/branch mapping is authoritative**, not the enum. Re-discover and verify each release.

```bash
aws amplify list-apps --region "$AWS_REGION" --output json
aws amplify list-branches --app-id "$APP_ID" --region "$AWS_REGION" --output json
aws amplify list-domain-associations --app-id "$APP_ID" --region "$AWS_REGION" --output json
aws amplify list-jobs --app-id "$APP_ID" --branch-name production --region "$AWS_REGION" --max-items 10 --output json
aws amplify get-job --app-id "$APP_ID" --branch-name production --job-id "$JOB_ID" --region "$AWS_REGION" --output json
```

Filter output to job summary and build/deploy step states; do not print credentials or environment variables. Match job commitId to the approved pushed SHA. Do not start another RELEASE job just because the automatic Git-triggered job is not visible immediately. Poll with bounded intervals/time budget while doing backend work; inspect failure evidence without modifying build settings.

After Amplify SUCCEED, independently verify frndos.com and its health endpoint, plus deployed-release evidence (served revision/changed asset behavior) where available. The latest job's success is irrelevant if it belongs to another commit. A pushed ref, healthy old site, ten elapsed minutes, or CI absence is never deployment proof.

If auth expires mid-build, ask for re-login and resume polling the same job. If backend deployment fails and the release authorizes stopping its own in-flight build, use `aws amplify stop-job` with the recorded app/branch/job IDs only. No unrelated cancellation, branch deletion, autobuild toggle or silent live rollback.

## 8. Completion

Require all source/target freshness checks, owner transformer publication, ClickHouse/staging readiness, AI/data/API deploy/health evidence and exact web Amplify job success. Record phase timings, warnings, flags left OFF, migrations actually executed, untouched operator-only actions and drift. Keep notes precise about source promotion versus schema application versus deployment versus loaded data. Only then offer the optional stakeholder Lark note.
