#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, writeFileSync, realpathSync } from "fs";
import { spawnSync, execSync } from "child_process";
import { homedir } from "os";
import { dirname, isAbsolute, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const MESSAGES_PROVIDERS = {
	anthropic: { baseUrl: "https://api.anthropic.com", auth: "auto" },
	"kimi-coding": { baseUrl: "https://api.kimi.com/coding", auth: "bearer" },
	deepseek: { baseUrl: "https://api.deepseek.com/anthropic", apiBase: "https://api.deepseek.com", auth: "bearer" },
};

// Preference order only; the pi-ai catalog supplies baseUrl/api. openai-codex prefers models a
// ChatGPT-account Codex accepts: gpt-5.3-codex-spark and gpt-5.4-mini both answer HTTP 400 there,
// so they sit last as last-resort probes for API-key accounts.
const PREFERRED_MODELS = {
	"openai-codex": ["gpt-6-luna", "gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.5", "gpt-6-sol", "gpt-6.1-sol", "gpt-5.6-sol", "gpt-6-astra", "gpt-5.3-codex-spark", "gpt-5.4-mini"],
	anthropic: ["claude-haiku-4-5", "claude-3-5-haiku-latest", "claude-3-5-haiku-20241022"],
	"kimi-coding": ["k3", "kimi-for-coding-highspeed", "kimi-for-coding"],
	deepseek: ["deepseek-flash", "deepseek-v4-pro"],
};

const FALLBACK_MODELS = {
	"openai-codex": { id: "gpt-6-luna", baseUrl: "https://chatgpt.com/backend-api" },
	anthropic: { id: "claude-haiku-4-5" },
	"kimi-coding": { id: "k3" },
	deepseek: { id: "deepseek-flash" },
};

const KNOWN_PROVIDERS = ["kimi-coding", "openai-codex", "anthropic", "deepseek"];
const MAX_MODEL_ATTEMPTS = 3;

function parseArgs(argv) {
	const out = { provider: undefined, model: undefined, purpose: "general research support", timeoutMs: 120000, json: false, help: false, query: "" };
	const positional = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") out.help = true;
		else if (arg === "--json") out.json = true;
		else if (arg === "--only") out.only = true;
		else if (arg === "--provider") out.provider = argv[++i];
		else if (arg.startsWith("--provider=")) out.provider = arg.slice("--provider=".length);
		else if (arg === "--model") out.model = argv[++i];
		else if (arg.startsWith("--model=")) out.model = arg.slice("--model=".length);
		else if (arg === "--purpose") out.purpose = argv[++i] || out.purpose;
		else if (arg.startsWith("--purpose=")) out.purpose = arg.slice("--purpose=".length) || out.purpose;
		else if (arg === "--timeout") out.timeoutMs = Math.max(1000, Number(argv[++i] || out.timeoutMs));
		else if (arg.startsWith("--timeout=")) out.timeoutMs = Math.max(1000, Number(arg.slice("--timeout=".length) || out.timeoutMs));
		else positional.push(arg);
	}
	out.query = positional.join(" ").trim();
	return out;
}

function usage() {
	return `Usage:
  node search.mjs "<query>" [--purpose "<why>"] [--provider openai-codex|anthropic|kimi-coding|deepseek] [--model <id>] [--only] [--json]

Provider order: --provider first, then settings.json defaultProvider, then the first authenticated of
kimi-coding, openai-codex, anthropic, deepseek. A provider that is unusable (bad credentials, no quota,
no model access) falls through to the next one; the attempt summary goes to stderr. --only keeps the
first candidate on that list and fails loud instead of falling through.

Examples:
  node search.mjs "latest python release" --purpose "update dependency notes"
  node search.mjs "HTTP/3 browser support 2026" --provider kimi-coding
  node search.mjs "vite 7 breaking changes" --provider deepseek --only --json`;
}

function readJson(path, fallback = {}) {
	if (!existsSync(path)) return fallback;
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return fallback;
	}
}

function writeJson(path, value) {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveConfigValue(config) {
	if (typeof config !== "string" || !config) return undefined;
	if (config.startsWith("!")) {
		try {
			const out = execSync(config.slice(1), { encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "ignore"] }).trim();
			return out || undefined;
		} catch {
			return undefined;
		}
	}
	return process.env[config] || config;
}

function getAgentDir() {
	const configured = process.env.PI_CODING_AGENT_DIR;
	if (!configured) return join(homedir(), ".pi", "agent");
	if (configured === "~") return homedir();
	if (configured.startsWith("~/")) return join(homedir(), configured.slice(2));
	return configured;
}

function normalizeProvider(provider) {
	if (!provider) return undefined;
	const p = String(provider).toLowerCase().trim();
	if (p.includes("anthropic") || p.includes("claude")) return "anthropic";
	if (p.includes("codex") || p.startsWith("openai")) return "openai-codex";
	if (p.includes("kimi") || p.includes("moonshot")) return "kimi-coding";
	if (p.includes("deepseek")) return "deepseek";
	return undefined;
}

function apiKeyEnvVar(provider) {
	return `${provider.replace(/-/g, "_").toUpperCase()}_API_KEY`;
}

function hasCredentials(provider, auth) {
	return Boolean(auth?.[provider] || process.env[apiKeyEnvVar(provider)]);
}

// Ordered list: --provider first, then settings.defaultProvider, then the documented order, filtered to
// providers that can even authenticate. Unusable ones (403 subscription, 402 balance, 400 model) are
// skipped at request time, not here, so the attempt summary can report why.
function providerOrder(argProvider, settings, auth) {
	const requested = [normalizeProvider(argProvider), normalizeProvider(settings?.defaultProvider)].filter(Boolean);
	const order = [];
	const add = (provider) => {
		if (provider && !order.includes(provider)) order.push(provider);
	};
	for (const provider of requested) add(provider);
	for (const provider of KNOWN_PROVIDERS) add(provider);
	return order.filter((provider) => requested.includes(provider) || hasCredentials(provider, auth));
}

function errorStatus(err) {
	const status = Number(String(err?.message || err).match(/failed \((\d{3})\)/)?.[1]);
	return Number.isFinite(status) ? status : undefined;
}

// Provider-level failures (auth, quota, subscription, rate limit) fail every model, so stop probing
// models. Model-specific failures answer 400/404 ("model is not supported...") and deserve the next one.
function shouldTryNextModel(err) {
	const status = errorStatus(err);
	return status === 400 || status === 404;
}

function describeFailure(err) {
	const message = String(err?.message || err).replace(/\s+/g, " ").trim();
	const status = errorStatus(err);
	const detail = message.replace(/^[^:]*failed \(\d{3}\):\s*/, "").slice(0, 100) || message.slice(0, 100);
	return status ? `${status}: ${detail}` : detail;
}

// One line on stderr keeps stdout pipeable and --json valid.
function reportAttempts(attempts) {
	if (attempts.length > 1) console.error(`web-search: tried ${attempts.join(", ")}`);
}

function decodeJwtAccountId(jwt) {
	if (!jwt || typeof jwt !== "string") return undefined;
	try {
		const parts = jwt.split(".");
		if (parts.length !== 3) return undefined;
		const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
		return payload?.["https://api.openai.com/auth"]?.chatgpt_account_id;
	} catch {
		return undefined;
	}
}

function findPiExecutable() {
	const cmd = process.platform === "win32" ? "where" : "which";
	const result = spawnSync(cmd, ["pi"], { encoding: "utf8" });
	if (result.status !== 0) return undefined;
	return result.stdout.split(/\r?\n/).map((x) => x.trim()).find(Boolean) || undefined;
}

function compareVersionsDesc(a, b) {
	const parts = (v) => String(v).split(/[^0-9]+/).filter(Boolean).map(Number);
	const pa = parts(a);
	const pb = parts(b);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const diff = (pb[i] || 0) - (pa[i] || 0);
		if (diff) return diff;
	}
	return 0;
}

// Managed pi installs live in <agent>/install/releases/<version>, listed newest first with the
// version named by install/current-version promoted to the front.
function listReleaseDirs() {
	const agentDir = getAgentDir();
	const releasesDir = join(agentDir, "install", "releases");
	let names;
	try {
		names = readdirSync(releasesDir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch {
		return [];
	}
	names.sort(compareVersionsDesc);
	let current;
	try {
		current = readFileSync(join(agentDir, "install", "current-version"), "utf8").trim();
	} catch {}
	if (current && names.includes(current)) names = [current, ...names.filter((name) => name !== current)];
	return names.map((name) => join(releasesDir, name));
}

function resolveBareModuleDir(specifier) {
	try {
		return dirname(fileURLToPath(import.meta.resolve(specifier)));
	} catch {
		return undefined;
	}
}

function collectModuleCandidates(fileName, envVarName) {
	const candidates = new Set();
	const add = (p) => {
		if (!p) return;
		candidates.add(isAbsolute(p) ? p : resolve(p));
	};
	if (envVarName && process.env[envVarName]) add(process.env[envVarName]);
	for (const releaseDir of listReleaseDirs()) {
		add(join(releaseDir, "node_modules", "@earendil-works", "pi-ai", "dist", fileName));
		add(join(releaseDir, "node_modules", "@earendil-works", "pi-coding-agent", "node_modules", "@earendil-works", "pi-ai", "dist", fileName));
	}
	const scriptDir = dirname(fileURLToPath(import.meta.url));
	for (const start of [process.cwd(), scriptDir]) {
		let dir = start;
		for (let i = 0; i < 8; i++) {
			add(join(dir, "node_modules", "@earendil-works", "pi-ai", "dist", fileName));
			const parent = dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
	}
	const piExec = findPiExecutable();
	if (piExec) {
		try {
			const piDir = dirname(realpathSync(piExec));
			add(join(piDir, "..", "node_modules", "@earendil-works", "pi-ai", "dist", fileName));
			add(join(piDir, "..", "..", "node_modules", "@earendil-works", "pi-ai", "dist", fileName));
		} catch {}
	}
	return Array.from(candidates);
}

async function loadPiAi() {
	const tried = [];
	try {
		return { piAi: await import("@earendil-works/pi-ai"), distDir: resolveBareModuleDir("@earendil-works/pi-ai") };
	} catch (err) {
		tried.push(`@earendil-works/pi-ai (${err?.code || err?.message || "not found"})`);
	}
	for (const candidate of collectModuleCandidates("index.js", "PI_AI_MODULE_PATH")) {
		if (!existsSync(candidate)) continue;
		try {
			return { piAi: await import(pathToFileURL(candidate).href), distDir: dirname(candidate) };
		} catch (err) {
			tried.push(`${candidate} (${err?.code || err?.message || "failed"})`);
		}
	}
	throw new Error(`Could not load @earendil-works/pi-ai. Set PI_AI_MODULE_PATH to its dist/index.js.\nTried:\n- ${tried.join("\n- ")}`);
}

// pi-ai 1.1.0 dropped the top-level getModels() export; the catalog now lives in providers/all.js
// (getBuiltinModels) with compat.js as its deprecated alias, and models.generated.js as a last resort.
async function loadModelCatalog(piAi, distDir) {
	if (typeof piAi?.getModels === "function") return (provider) => piAi.getModels(provider) || [];
	if (distDir) {
		for (const [file, pick] of [
			["providers/all.js", (mod) => mod.getBuiltinModels],
			["compat.js", (mod) => mod.getModels],
		]) {
			try {
				const fn = pick(await import(pathToFileURL(join(distDir, file)).href));
				if (typeof fn === "function") return (provider) => fn(provider) || [];
			} catch {}
		}
		try {
			const { MODELS } = await import(pathToFileURL(join(distDir, "models.generated.js")).href);
			if (MODELS) return (provider) => Object.values(MODELS[provider] || {});
		} catch {}
	}
	return () => [];
}

async function loadPiAiOAuth(piAi) {
	if (typeof piAi?.getOAuthApiKey === "function") return { getOAuthApiKey: piAi.getOAuthApiKey.bind(piAi) };
	const tried = [];
	try {
		const oauth = await import("@earendil-works/pi-ai/oauth");
		if (typeof oauth.getOAuthApiKey === "function") return { getOAuthApiKey: oauth.getOAuthApiKey.bind(oauth) };
		tried.push("@earendil-works/pi-ai/oauth (missing getOAuthApiKey export)");
	} catch (err) {
		tried.push(`@earendil-works/pi-ai/oauth (${err?.code || err?.message || "not found"})`);
	}
	for (const candidate of collectModuleCandidates("oauth.js", "PI_AI_OAUTH_MODULE_PATH")) {
		if (!existsSync(candidate)) continue;
		try {
			const oauth = await import(pathToFileURL(candidate).href);
			if (typeof oauth.getOAuthApiKey === "function") return { getOAuthApiKey: oauth.getOAuthApiKey.bind(oauth) };
			tried.push(`${candidate} (missing getOAuthApiKey export)`);
		} catch (err) {
			tried.push(`${candidate} (${err?.code || err?.message || "failed"})`);
		}
	}
	return { getOAuthApiKey: undefined, error: `Could not load getOAuthApiKey.\nTried:\n- ${tried.join("\n- ")}` };
}

function parseExpiryTimestamp(expires) {
	if (typeof expires === "number" && Number.isFinite(expires)) {
		if (expires <= 0) return undefined;
		return expires < 1_000_000_000_000 ? expires * 1000 : expires;
	}
	if (typeof expires === "string") {
		const trimmed = expires.trim();
		if (!trimmed) return undefined;
		const numeric = Number(trimmed);
		if (Number.isFinite(numeric)) return parseExpiryTimestamp(numeric);
		const parsed = Date.parse(trimmed);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function getCachedOAuthAccess(entry, now = Date.now()) {
	if (!entry || typeof entry !== "object") return undefined;
	const apiKey = resolveConfigValue(entry.access);
	if (!apiKey) return undefined;
	const expiresAt = parseExpiryTimestamp(entry.expires);
	if (!expiresAt) return undefined;
	if (now + 30_000 >= expiresAt) return undefined;
	return { apiKey, accountId: entry.accountId };
}

function modelCandidates(provider, requestedModel, listModels) {
	const catalog = listModels(provider) || [];
	if (requestedModel) {
		const exact = catalog.find((model) => model.id === requestedModel);
		return [exact || { ...(FALLBACK_MODELS[provider] || {}), id: requestedModel }];
	}
	const remaining = new Map(catalog.map((model) => [model.id, model]));
	const ordered = [];
	for (const id of PREFERRED_MODELS[provider] || []) {
		const found = remaining.get(id);
		if (!found) continue;
		ordered.push(found);
		remaining.delete(id);
		if (ordered.length >= MAX_MODEL_ATTEMPTS) return ordered;
	}
	if (ordered.length) return ordered;
	const rest = Array.from(remaining.values());
	const heuristic = rest.find((model) => /mini|haiku|flash|fast|small|nano/i.test(model.id));
	const fallback = heuristic || rest[0] || FALLBACK_MODELS[provider];
	return fallback ? [fallback] : [];
}

async function resolveApiKey(provider, auth, authPath, piAi) {
	const entry = auth?.[provider];
	if (!entry) {
		const envKey = process.env[`${provider.replace(/-/g, "_").toUpperCase()}_API_KEY`];
		if (envKey) return { apiKey: envKey, accountId: undefined };
		throw new Error(`No credentials for provider '${provider}' in ${authPath}`);
	}
	const inferredType = entry.type || (entry.access && entry.refresh ? "oauth" : entry.key ? "api_key" : undefined);
	if (inferredType === "api_key") {
		const key = resolveConfigValue(entry.key);
		if (!key) throw new Error(`API key for ${provider} is empty or unresolved.`);
		return { apiKey: key, accountId: entry.accountId };
	}
	if (inferredType !== "oauth") {
		throw new Error(`Unsupported credential type for ${provider}: ${String(entry.type || "unknown")}`);
	}
	const fallbackToken = getCachedOAuthAccess(entry);
	const oauth = await loadPiAiOAuth(piAi);
	if (typeof oauth.getOAuthApiKey !== "function") {
		if (fallbackToken) return fallbackToken;
		throw new Error(oauth.error || "Loaded pi-ai module does not export getOAuthApiKey");
	}
	const oauthCreds = {};
	for (const [k, v] of Object.entries(auth || {})) {
		if (v && (v.type === "oauth" || (v.access && v.refresh && v.expires))) oauthCreds[k] = v;
	}
	let refreshed;
	try {
		refreshed = await oauth.getOAuthApiKey(provider, oauthCreds);
	} catch (err) {
		if (fallbackToken) return fallbackToken;
		throw err;
	}
	if (!refreshed?.apiKey) {
		if (fallbackToken) return fallbackToken;
		throw new Error(`No OAuth credentials available for provider '${provider}'`);
	}
	const mergedCred = { type: "oauth", ...(entry || {}), ...(refreshed.newCredentials || {}) };
	auth[provider] = mergedCred;
	writeJson(authPath, auth);
	return { apiKey: refreshed.apiKey, accountId: mergedCred.accountId };
}

const OUTPUT_SPEC = `Return a concise research summary with:
- 3 to 7 key findings
- for every finding: title, why it matters for this purpose, and a full canonical URL (https://...)
- if multiple sources disagree, call that out
- finish with a short recommendation on which source(s) to trust first.`;

function buildUserPrompt(query, purpose) {
	return `Search the internet for: ${query}\n\nPurpose: ${purpose}\n\n${OUTPUT_SPEC}`;
}

function buildSynthesisPrompt(query, purpose, context) {
	return `Search the internet for: ${query}\n\nPurpose: ${purpose}\n\nThe search is already done. Results from DeepSeek's search engine:\n\n${context}\n\n${OUTPUT_SPEC}\n- never invent URLs or facts that are not in the results above\n- prefer results with a higher authority tier and relevance score`;
}

function buildSystemPrompt() {
	return "You are a fast web research assistant. Always produce practical summaries and include full source URLs (no shortened links).";
}

function resolveCodexUrl(baseUrl = "https://chatgpt.com/backend-api") {
	const normalized = String(baseUrl || "https://chatgpt.com/backend-api").replace(/\/+$/, "");
	if (normalized.endsWith("/codex/responses")) return normalized;
	if (normalized.endsWith("/codex")) return `${normalized}/responses`;
	return `${normalized}/codex/responses`;
}

function extractEventData(chunk) {
	const payload = chunk
		.split(/\r?\n/)
		.filter((line) => line.startsWith("data:"))
		.map((line) => line.slice(5).trim())
		.join("\n")
		.trim();
	if (!payload || payload === "[DONE]") return null;
	return payload;
}

async function runCodexSearch({ model, apiKey, accountId, query, purpose, timeoutMs, baseUrl }) {
	const tokenAccountId = accountId || decodeJwtAccountId(apiKey);
	if (!tokenAccountId) throw new Error("Could not determine ChatGPT account ID for openai-codex token.");
	const body = {
		model,
		store: false,
		stream: true,
		instructions: buildSystemPrompt(),
		input: [{ role: "user", content: buildUserPrompt(query, purpose) }],
		tools: [{ type: "web_search" }],
		tool_choice: "auto",
	};
	const res = await fetch(resolveCodexUrl(baseUrl), {
		method: "POST",
		headers: {
			authorization: `Bearer ${apiKey}`,
			"chatgpt-account-id": tokenAccountId,
			"content-type": "application/json",
			accept: "text/event-stream",
			"OpenAI-Beta": "responses=experimental",
			originator: "pi-web-search-skill",
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (!res.ok) throw new Error(`Codex request failed (${res.status}): ${await res.text()}`);
	if (!res.body) throw new Error("Codex response had no body");
	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let text = "";
	let fallbackText = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let idx = buffer.indexOf("\n\n");
		while (idx !== -1) {
			const chunk = buffer.slice(0, idx);
			buffer = buffer.slice(idx + 2);
			idx = buffer.indexOf("\n\n");
			const data = extractEventData(chunk);
			if (!data) continue;
			let event;
			try {
				event = JSON.parse(data);
			} catch {
				continue;
			}
			if (event.type === "response.output_text.delta" && typeof event.delta === "string") text += event.delta;
			if (event.type === "response.output_item.done" && event.item?.type === "message") {
				const parts = Array.isArray(event.item?.content) ? event.item.content : [];
				const full = parts
					.filter((p) => p.type === "output_text" && typeof p.text === "string")
					.map((p) => p.text)
					.join("\n");
				if (full) fallbackText = full;
			}
			if (event.type === "error") throw new Error(event.message || "Codex stream failed");
			if (event.type === "response.failed") throw new Error(event.response?.error?.message || "Codex response failed");
		}
	}
	const finalText = (text || fallbackText || "").trim();
	if (!finalText) throw new Error("Codex returned an empty response");
	return finalText;
}

function buildMessagesHeaders(provider, apiKey) {
	const config = MESSAGES_PROVIDERS[provider];
	if (provider === "anthropic" && typeof apiKey === "string" && apiKey.includes("sk-ant-oat")) {
		return {
			authorization: `Bearer ${apiKey}`,
			"anthropic-version": "2023-06-01",
			"anthropic-beta": "claude-code-20250219,oauth-2025-04-20,web-search-2025-03-05",
			"content-type": "application/json",
			accept: "application/json",
			"x-app": "cli",
			"user-agent": "claude-cli/1.0.72 (external, cli)",
		};
	}
	const headers = {
		"anthropic-version": "2023-06-01",
		"anthropic-beta": "web-search-2025-03-05",
		"content-type": "application/json",
		accept: "application/json",
	};
	if (config.auth === "bearer") headers.authorization = `Bearer ${apiKey}`;
	else headers["x-api-key"] = apiKey;
	return headers;
}

async function runMessagesSearch({ provider, model, apiKey, query, purpose, timeoutMs, context }) {
	const config = MESSAGES_PROVIDERS[provider];
	const body = {
		model,
		max_tokens: 1800,
		temperature: 0,
		system: buildSystemPrompt(),
		messages: [{ role: "user", content: context ? buildSynthesisPrompt(query, purpose, context) : buildUserPrompt(query, purpose) }],
	};
	// With pre-fetched results the model only writes up; without them it has to run the server tool itself.
	if (!context) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
	const res = await fetch(`${config.baseUrl}/v1/messages`, {
		method: "POST",
		headers: buildMessagesHeaders(provider, apiKey),
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(timeoutMs),
	});
	const payload = await res.text();
	if (!res.ok) throw new Error(`${provider} request failed (${res.status}): ${payload}`);
	let parsed;
	try {
		parsed = JSON.parse(payload);
	} catch {
		throw new Error(`${provider} returned non-JSON response`);
	}
	const text = (parsed.content || [])
		.filter((item) => item.type === "text" && typeof item.text === "string")
		.map((item) => item.text)
		.join("\n\n")
		.trim();
	if (!text) throw new Error(`${provider} returned no text content`);
	return text;
}

const DEEPSEEK_SEARCH_COUNT = 8;
const DEEPSEEK_RESULT_CONTENT_CHARS = 1200;

// The Search API rejects queries over 128 characters; trim at a word boundary so the engine still
// reads a phrase instead of a chopped word.
function clampSearchQuery(query, max = 128) {
	const clean = String(query).replace(/\s+/g, " ").trim();
	if (clean.length <= max) return clean;
	const cut = clean.slice(0, max);
	const boundary = cut.lastIndexOf(" ");
	return boundary > max * 0.6 ? cut.slice(0, boundary) : cut;
}

async function deepseekSearchResults({ apiKey, query, timeoutMs }) {
	const config = MESSAGES_PROVIDERS.deepseek;
	const res = await fetch(`${config.apiBase}/v1/tools/search`, {
		method: "POST",
		headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", accept: "application/json" },
		body: JSON.stringify({ query: clampSearchQuery(query), count: DEEPSEEK_SEARCH_COUNT, need_content: true }),
		signal: AbortSignal.timeout(timeoutMs),
	});
	const payload = await res.text();
	if (!res.ok) throw new Error(`deepseek search request failed (${res.status}): ${payload}`);
	let parsed;
	try {
		parsed = JSON.parse(payload);
	} catch {
		throw new Error("deepseek search returned non-JSON response");
	}
	return (Array.isArray(parsed?.results) ? parsed.results : []).filter((item) => item && typeof item.url === "string");
}

function buildSearchResultsBlock(results) {
	return results
		.map((item, index) => {
			const meta = [
				item.site_name ? `site: ${item.site_name}` : undefined,
				typeof item.date === "string" ? `published: ${item.date}` : undefined,
				Number.isInteger(item.authority) && item.authority >= 0 ? `authority: ${item.authority}/4` : undefined,
				Number.isFinite(item.rerank_score) ? `relevance: ${item.rerank_score}/3` : undefined,
			].filter(Boolean);
			const lines = [`${index + 1}. ${item.title || "(untitled)"}`, `URL: ${item.url}`];
			if (meta.length) lines.push(meta.join(", "));
			const summary = String(item.summary || "").replace(/\s+/g, " ").trim();
			if (summary) lines.push(`Summary: ${summary}`);
			const content = String(item.content || "").replace(/\s+/g, " ").trim();
			if (content) lines.push(`Content: ${content.slice(0, DEEPSEEK_RESULT_CONTENT_CHARS)}${content.length > DEEPSEEK_RESULT_CONTENT_CHARS ? " [truncated]" : ""}`);
			return lines.join("\n");
		})
		.join("\n\n");
}

// DeepSeek's server-side web_search tool hits the same in-house engine as the Search API, but a
// proxy can accept the tool and answer from memory without ever searching. So query the Search API
// first (real, citable URLs) and keep the server tool as the fallback for keys that lack access to
// the raw endpoint. 401/402 are account-level: the tool call would fail the same way.
async function runDeepSeekSearch({ model, apiKey, query, purpose, timeoutMs }) {
	try {
		const results = await deepseekSearchResults({ apiKey, query, timeoutMs });
		if (results.length) {
			const text = await runMessagesSearch({ provider: "deepseek", model, apiKey, query, purpose, timeoutMs, context: buildSearchResultsBlock(results) });
			return { text, backend: `search-api ${results.length} results` };
		}
		console.error("web-search: deepseek search-api returned no results, falling back to the web_search tool");
	} catch (err) {
		const status = errorStatus(err);
		if (status === 401 || status === 402) throw err;
		console.error(`web-search: deepseek search-api unusable (${describeFailure(err)}), falling back to the web_search tool`);
	}
	const text = await runMessagesSearch({ provider: "deepseek", model, apiKey, query, purpose, timeoutMs });
	// A tool call that was accepted but ignored leaves an answer with no sources at all.
	if (!/https?:\/\//.test(text)) console.error("web-search: deepseek returned no source URLs; treat the summary as unverified");
	return { text, backend: "web-search-tool" };
}

async function runSearch({ provider, model, apiKey, accountId, query, purpose, timeoutMs }) {
	if (provider === "openai-codex") return { text: await runCodexSearch({ model: model.id, apiKey, accountId, query, purpose, timeoutMs, baseUrl: model.baseUrl }), backend: "web-search-tool" };
	if (provider === "deepseek") return runDeepSeekSearch({ model: model.id, apiKey, query, purpose, timeoutMs });
	return { text: await runMessagesSearch({ provider, model: model.id, apiKey, query, purpose, timeoutMs }), backend: "web-search-tool" };
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help || !args.query) {
		console.error(usage());
		process.exit(args.help ? 0 : 1);
	}
	const agentDir = getAgentDir();
	const authPath = join(agentDir, "auth.json");
	const auth = readJson(authPath, {});
	const settings = readJson(join(agentDir, "settings.json"), {});
	const candidates = providerOrder(args.provider, settings, auth);
	const providers = args.only ? candidates.slice(0, 1) : candidates;
	if (!providers.length) {
		throw new Error(`No authenticated provider. Known providers: ${KNOWN_PROVIDERS.join("|")}. Add credentials to ${authPath} or pass --provider.`);
	}
	const { piAi, distDir } = await loadPiAi();
	const listModels = await loadModelCatalog(piAi, distDir);
	const attempts = [];
	let lastError;
	for (const provider of providers) {
		for (const model of modelCandidates(provider, args.model, listModels)) {
			const label = `${provider}/${model.id}`;
			try {
				const { apiKey, accountId } = await resolveApiKey(provider, auth, authPath, piAi);
				const { text, backend } = await runSearch({ provider, model, apiKey, accountId, query: args.query, purpose: args.purpose, timeoutMs: args.timeoutMs });
				attempts.push(`${label} ok (${backend})`);
				reportAttempts(attempts);
				if (args.json) {
					console.log(JSON.stringify({ provider, model: model.id, query: args.query, purpose: args.purpose, result: text }, null, 2));
					return;
				}
				console.log(`Provider: ${provider}`);
				console.log(`Model: ${model.id}`);
				console.log("");
				console.log(text);
				return;
			} catch (err) {
				lastError = err;
				attempts.push(`${label} ${describeFailure(err)}`);
				if (!shouldTryNextModel(err)) break;
			}
		}
	}
	reportAttempts(attempts);
	throw lastError || new Error("All providers failed");
}

main().catch((err) => {
	console.error(`Error: ${err?.message || err}`);
	process.exit(1);
});
