// Optional LLM reads (spec "LLM use"): only when ANTHROPIC_API_KEY is set, only to classify failure
// mode, judge diff-vs-task coherence, or word reasons that already have evidence. Callers may use
// the answer to lower confidence or tighten the mode, never to loosen it.
import Anthropic from "@anthropic-ai/sdk";
import { costOf, logLlmCall, tokensOf, type LlmLogEntry } from "./llmlog";

export const NO_CREDENTIAL = "no ANTHROPIC_API_KEY";

const MODEL = "claude-opus-5-5";

export const llmAvailable = () => Boolean(process.env.ANTHROPIC_API_KEY);

const MAX_TOKENS = 4000;
const EFFORT = "low" as const;

/** One structured-output call, logged. Returns null when unavailable, refused, or on any API error. */
export async function askJson<T>(system: string, user: string, schema: Record<string, unknown>, purpose = "llm"): Promise<T | null> {
  if (!llmAvailable()) return null;
  const client = new Anthropic();
  const started = performance.now();
  const entry: LlmLogEntry = {
    ts: new Date().toISOString(),
    purpose,
    model: MODEL,
    endpoint: client.baseURL,
    outcome: "ok",
    latency_ms: 0,
    request_id: null,
    request: { max_tokens: MAX_TOKENS, effort: EFFORT, system, user, schema },
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
    logLlmCall(entry);
  }
}
