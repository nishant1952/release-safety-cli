// A JSONL log of every optional LLM call: request, response, tokens, latency and an estimated cost.
// It is written beside the brief, never into it, so the brief stays deterministic.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// USD per million tokens at Anthropic list prices (cache writes at 1.25x input). Bedrock bills
// separately, so for Bedrock calls the figure is an estimate on these prices.
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
};

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  output_tokens_details?: { thinking_tokens?: number } | null;
}

export interface Tokens {
  input: number;
  output: number;
  thinking: number;
  cache_read: number;
  cache_write: number;
  total: number;
}

export function tokensOf(u: Usage): Tokens {
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  return {
    input: u.input_tokens,
    output: u.output_tokens,
    thinking: u.output_tokens_details?.thinking_tokens ?? 0,
    cache_read: cacheRead,
    cache_write: cacheWrite,
    total: u.input_tokens + cacheRead + cacheWrite + u.output_tokens,
  };
}

/** Estimated USD cost; null when the model has no listed price. */
export function costOf(model: string, provider: string, t: Tokens): { usd: number; basis: string } | null {
  const p = PRICES[model.replace(/^anthropic\./, "")];
  if (!p) return null;
  const usd = (t.input * p.input + t.cache_write * p.input * 1.25 + t.cache_read * p.cacheRead + t.output * p.output) / 1e6;
  return {
    usd: Math.round(usd * 1e6) / 1e6,
    basis: provider === "bedrock" ? "Anthropic list price; Amazon Bedrock bills separately" : "Anthropic list price",
  };
}

export interface LlmLogEntry {
  ts: string;
  purpose: string;
  provider: string;
  model: string;
  endpoint: string;
  outcome: "ok" | "refusal" | "api_error" | "bad_json";
  latency_ms: number;
  request_id: string | null;
  request: { max_tokens: number; effort: string; system: string; user: string; schema: Record<string, unknown> };
  response: { id: string; model: string; stop_reason: string | null; text: string | null } | null;
  tokens: Tokens | null;
  cost: { usd: number; basis: string } | null;
  error: { name: string; status: number | null; message: string } | null;
}

let logPath = process.env.LLM_LOG ?? "logs/llm-calls.jsonl";
let entries: LlmLogEntry[] = [];
let warned = false;

export const setLlmLogPath = (path: string) => {
  logPath = path;
};

/** For tests: forget earlier calls and warnings. */
export const resetLlmLog = () => {
  entries = [];
  warned = false;
};

/** Appends one call to the log. A write failure warns once on stderr and never reaches the run. */
export function logLlmCall(entry: LlmLogEntry): void {
  entries.push(entry);
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, JSON.stringify(entry) + "\n");
  } catch (error) {
    if (!warned) process.stderr.write(`LLM log not written to ${logPath}: ${(error as Error).message}\n`);
    warned = true;
  }
}

/** One line for stderr after a run, or null when no LLM call was made. */
export function llmSummary(): string | null {
  if (!entries.length) return null;
  const ok = entries.filter((e) => e.outcome === "ok").length;
  const input = entries.reduce((n, e) => n + (e.tokens ? e.tokens.input + e.tokens.cache_read + e.tokens.cache_write : 0), 0);
  const output = entries.reduce((n, e) => n + (e.tokens?.output ?? 0), 0);
  const usd = entries.reduce((n, e) => n + (e.cost?.usd ?? 0), 0);
  const failed = entries.length - ok;
  return (
    `LLM: ${entries.length} calls (${ok} ok${failed ? `, ${failed} not ok` : ""}) on ${entries[0].provider} ${entries[0].model}, ` +
    `${input.toLocaleString("en-US")} input / ${output.toLocaleString("en-US")} output tokens, ` +
    `est. $${usd.toFixed(4)} (${entries[0].cost?.basis ?? "no price listed"}). ${warned ? `Log not written (${logPath})` : `Log: ${logPath}`}`
  );
}
