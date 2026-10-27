// Optional LLM calls: only when ANTHROPIC_API_KEY is set. The model contract (src/model.ts) may fill an
// assumed signal one step with a cited line that code checks, and answers the failure-mode and
// coherence reads, which only lower confidence or tighten the mode; reason wording never changes a
// decision. Measured and declared signals, gates and the mode are never the model's to change.
import Anthropic from "@anthropic-ai/sdk";
import { redact } from "./gates";
import { costOf, logLlmCall, tokensOf, type LlmLogEntry } from "./llmlog";

export const NO_CREDENTIAL = "no ANTHROPIC_API_KEY";

const MODEL = "claude-sonnet-5-5";

export const llmAvailable = () => Boolean(process.env.ANTHROPIC_API_KEY);

const MAX_TOKENS = 4000;
const EFFORT = "low" as const;

export interface AskOptions {
  /** a key for this call only, in place of ANTHROPIC_API_KEY */
  apiKey?: string;
  /** receives each call's log entry in place of the log file */
  onCall?: (entry: LlmLogEntry) => void;
}

/** One structured-output call, logged. Returns null when unavailable, refused, or on any API error. */
export async function askJson<T>(system: string, user: string, schema: Record<string, unknown>, purpose = "llm", opts: AskOptions = {}): Promise<T | null> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  // Nothing secret leaves the process: the gate 1 secret and PII scanners run over the whole payload.
  const sys = redact(system);
  const usr = redact(user);
  system = sys.text;
  user = usr.text;
  const client = new Anthropic({ apiKey });
  const started = performance.now();
  const entry: LlmLogEntry = {
    ts: new Date().toISOString(),
    purpose,
    model: MODEL,
    endpoint: client.baseURL,
    outcome: "ok",
    latency_ms: 0,
    request_id: null,
    request: { max_tokens: MAX_TOKENS, effort: EFFORT, system, user, schema, redacted: [...sys.kinds, ...usr.kinds] },
    response: null,
    tokens: null,
    cost: null,
    error: null,
  };
  try {
    const { data: response, request_id } = await client.beta.messages
      .create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: EFFORT, format: { type: "json_schema", schema } },
        system,
        messages: [{ role: "user", content: user }],
      })
      .withResponse();
    const text = response.content.find((b) => b.type === "text");
    const body = text && text.type === "text" ? text.text : null;
    entry.request_id = request_id ?? null;
    entry.response = { id: response.id, model: response.model, stop_reason: response.stop_reason, text: body };
    entry.tokens = tokensOf(response.usage);
    entry.cost = costOf(MODEL, entry.tokens);
    if (response.stop_reason === "refusal") {
      entry.outcome = "refusal";
      return null;
    }
    try {
      return body === null ? null : (JSON.parse(body) as T);
    } catch (error) {
      entry.outcome = "bad_json";
      entry.error = { name: "SyntaxError", status: null, message: (error as Error).message };
      return null;
    }
  } catch (error) {
    if (!(error instanceof Anthropic.APIError)) throw error;
    entry.outcome = "api_error";
    entry.request_id = error.requestID ?? null;
    entry.error = { name: error.name, status: error.status ?? null, message: error.message };
    return null;
  } finally {
    entry.latency_ms = Math.round(performance.now() - started);
    if (opts.onCall) opts.onCall(entry);
    else logLlmCall(entry);
  }
}

export type CallProgress = { purpose: string; done: null } | { purpose: string; done: LlmLogEntry };

/**
 * askJson with a key held by the caller. Nothing is written to the log file: each call is reported to
 * progress when it starts and when it ends, and the key goes no further than the client.
 */
export function askWithKey(apiKey: string, progress: (p: CallProgress) => void = () => {}): typeof askJson {
  return (system, user, schema, purpose = "llm") => {
    progress({ purpose, done: null });
    return askJson(system, user, schema, purpose, { apiKey, onCall: (entry) => progress({ purpose, done: entry }) });
  };
}
