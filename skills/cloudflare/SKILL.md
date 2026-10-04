---
name: cloudflare
description: "Cloudflare work through the cf CLI — DNS, zones, Workers, Pages, R2, D1, KV, Queues, Zero Trust, Tunnels, cache, WAF, and the rest of the Cloudflare API. Use for any task that touches Cloudflare resources. Do not reach for Wrangler unless the project has a Wrangler configuration file."
---

# Cloudflare

## Rule

Use the **`cf` CLI** for Cloudflare work.

Exception: if the project has a Wrangler configuration file, use **Wrangler** for that project instead.

```sh
ls wrangler.toml wrangler.json wrangler.jsonc 2>/dev/null
```

Those three filenames are the whole test. No config file → `cf`, config file present → Wrangler.

Account- and zone-scoped API work (DNS records, cache purge, WAF rules, R2 buckets, Zero Trust) has no Wrangler equivalent — use `cf` even inside a Wrangler project.

## Discovery: do not guess commands

`cf` is self-describing. Guessed command names waste turns and fail silently.

1. **Find the command** — describe the *action* and the *resource type*:
   ```sh
   cf cli search "list dns records for a zone"
   ```
   Returns five compact JSON matches. Pick the best and stop searching.

2. **Read its help** for the real flags:
   ```sh
   cf dns records list --help
   ```

3. **Get the API shape** (method, path, params) by replacing the leading `cf` with `cf schema`:
   ```sh
   cf schema dns records list        # -> operationId, httpMethod, path, pathParams, queryParams
   cf schema --list                  # all available schemas
   ```

Do not chain nested `--help` calls to explore. Search first, then read the help of the matched command.

### Anonymise search queries

`cf cli search` queries must describe only the action and resource type. Never put real names, email addresses, domains, account or resource IDs, or tokens into them.

```sh
cf cli search "list zones"                    # good
cf cli search "list zones for acme.com"       # leaks a domain
cf cli search "purge cache for 023e105f..."   # leaks an ID
```

## Check auth before acting

```sh
cf auth whoami
```

Unauthenticated → `cf auth login`. Other auth commands: `cf auth list`, `cf auth create <name>`, `cf auth activate <name> [dir]`, `cf auth delete <name>`, `cf auth logout`.

Named profiles (`--profile`) bind a set of credentials to a directory, useful when the same machine holds more than one Cloudflare account.

## Global flags

| Flag | Meaning |
| --- | --- |
| `-z, --zone` | Zone ID or domain name; overrides `CLOUDFLARE_ZONE_ID` |
| `--profile` | Use a specific auth profile |
| `-m, --mode` | Mode used to evaluate project configuration |
| `--local` | Use local resource simulations |
| `--persist-to` | Directory holding local persisted state (default `~/.config/cloudflare/state`) |
| `-q, --quiet` | Suppress non-essential output |

## In a Wrangler project

Use Wrangler, not `cf`:

```sh
bunx wrangler deploy      # or: npx wrangler deploy
```

Wrangler is normally a devDependency — it is not installed globally on this machine, so invoke it through the project (`bunx` / `npx` / `node_modules/.bin/wrangler`) rather than a bare `wrangler`.

If the user wants to leave Wrangler, `cf` can do the conversion:

```sh
cf migrate --dry-run          # show what would change, write nothing
cf migrate                    # migrate the project
```

`cf migrate [path]` takes an optional path to the Wrangler configuration file. It defaults to the `vite` bundler when `@cloudflare/vite-plugin` is declared, otherwise `wrangler`; override with `--bundler`. It refuses to run on a dirty Git worktree unless `--force` is passed, and installs `cf` as a project dependency unless `--no-install`.

## Notes

- `cf --version` to confirm the build. This is `v1.0.0-beta.12`, so flag names and subcommand paths can still shift — read `--help` rather than trusting memorised flags.
- Prefer `--dry-run` where a command offers it, and confirm before destructive operations (delete, purge, revoke).
