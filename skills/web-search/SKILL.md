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
```

Optional flags:

- `--provider openai-codex|anthropic|kimi-coding|deepseek` (default: current pi provider, else first available credential)
- `--model <model-id>`
- `--timeout <ms>`
- `--json`

## Providers

| Provider | Endpoint | Credential |
|----------|----------|------------|
| `openai-codex` | chatgpt.com responses API + `web_search` | OAuth from `~/.pi/agent/auth.json` |
| `anthropic` | api.anthropic.com + `web_search_20250305` | API key or OAuth |
| `kimi-coding` | api.kimi.com/coding (anthropic-messages) + `web_search_20250305` | `kimi-coding` key in auth.json |
| `deepseek` | api.deepseek.com/anthropic + `web_search_20250305` | `deepseek` key in auth.json or `DEEPSEEK_API_KEY` env |

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
