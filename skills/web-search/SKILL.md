---
name: web-search
description: "Run web research via a fast model with native web search. Use when you need quick internet research with concise summaries and full source URLs."
---

# Web Search

Run a **fast model with native web search enabled** and get a concise research summary with explicit full URLs.

## Usage

Run from this skill directory:

```bash
node search.mjs "<what to search>" --purpose "<why you need this>"
```

Examples:

```bash
node search.mjs "latest python release" --purpose "update dependency notes"
node search.mjs "vite 7 breaking changes" --provider kimi-coding
node search.mjs "who won the 2026 election" --provider deepseek --only
```

Optional flags:

- `--provider openai-codex|anthropic|kimi-coding|deepseek` (default: current pi provider, else first available credential)
- `--model <model-id>`
- `--only` — keep the first provider in the order and fail loud instead of falling through
- `--timeout <ms>`
- `--json`

## Providers

| Provider | Search | Credential |
|----------|--------|------------|
| `openai-codex` | chatgpt.com responses API + `web_search` | OAuth from `~/.pi/agent/auth.json` |
| `anthropic` | api.anthropic.com + `web_search_20250305` | API key or OAuth |
| `kimi-coding` | api.kimi.com/coding (anthropic-messages) + `web_search_20250305` | `kimi-coding` key in auth.json |
| `deepseek` | api.deepseek.com Search API, else `web_search_20250305` | `deepseek` key in auth.json or `DEEPSEEK_API_KEY` env |

A provider that is unusable (bad credentials, no quota, no model access) falls through to the next authenticated one; the attempt summary goes to stderr, so `Provider:` / `Model:` on stdout always name the provider that answered.

## DeepSeek

`--provider deepseek` searches DeepSeek's own in-house index first: `POST /v1/tools/search` with `count: 8`, `need_content: true` (the query is clamped to the API's 128-character limit at a word boundary), then the returned title, URL, date, site, authority tier, relevance score, summary and page content are handed to the model to write up. URLs come from the search response, never from the model. If the raw endpoint is unavailable for the key (400/404/405), it falls back to the Anthropic-compatible `web_search` server tool, which DeepSeek routes to the same engine, and says so on stderr.

Needs a funded DeepSeek account: an unfunded key answers `402 Insufficient Balance` for the Search API and for `/v1/messages` alike, so `401`/`402` end the provider instead of trying the server tool on a dead account.

Cost: Search API $0.75 per 1,000 successful requests regardless of `count`, 5 QPS; server-side `web_search` tool calls are free until 2026-11-01, then billed.

## Output

The script instructs the model to:
- search the internet for the requested topic
- provide a concise summary for the given purpose
- include full canonical URLs (`https://...`) for each key finding
- highlight disagreements between sources

## Notes

- No npm install required; the script locates `@earendil-works/pi-ai` from the running pi installation.
- If module resolution fails, set `PI_AI_MODULE_PATH` to pi-ai's `dist/index.js`.
- For OAuth providers, falls back to a still-valid cached `access` token from `auth.json`.
