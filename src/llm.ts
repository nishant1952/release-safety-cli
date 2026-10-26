// Optional LLM reads (spec "LLM use"): only when a credential is set, only to classify failure
// mode, judge diff-vs-task coherence, or word reasons that already have evidence. Callers may use
// the answer to lower confidence or tighten the mode, never to loosen it.
import Anthropic from "@anthropic-ai/sdk";
import { costOf, logLlmCall, tokensOf, type LlmLogEntry } from "./llmlog";

export const NO_CREDENTIAL = "no ANTHROPIC_API_KEY or AWS_BEARER_TOKEN_BEDROCK";

export interface LlmTarget {
  provider: "anthropic" | "bedrock";
  model: string;
  apiKey: string;
  /** null: the SDK's default first-party endpoint */
  baseURL: string | null;
}

/**
 * Where the LLM calls go. A Bedrock API key (bearer token) wins when set: the standard client
 * reaches Claude in Amazon Bedrock's Messages endpoint with the token as its API key. Otherwise
 * ANTHROPIC_API_KEY selects the first-party API. Neither: no LLM.
 */
export function llmTarget(env: Record<string, string | undefined> = process.env): LlmTarget | null {
  const bearer = env.AWS_BEARER_TOKEN_BEDROCK;
  if (bearer) {
    const region = env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? "us-east-1";
    return {
      provider: "bedrock",
      model: "anthropic.claude-sonnet-5-5",
      apiKey: bearer,
      baseURL: `https://bedrock-mantle.${region}.api.aws/anthropic`,
    };
  }
  if (env.ANTHROPIC_API_KEY) return { provider: "anthropic", model: "claude-opus-5-5", apiKey: env.ANTHROPIC_API_KEY, baseURL: null };
  return null;
}

export const llmAvailable = () => llmTarget() !== null;

const MAX_TOKENS = 4000;
const EFFORT = "low" as const;

/** One structured-output call, logged. Returns null when unavailable, refused, or on any API error. */
export async function askJson<T>(system: string, user: string, schema: Record<string, unknown>, purpose = "llm"): Promise<T | null> {
  const target = llmTarget();
  if (!target) return null;
  const started = performance.now();
  const entry: LlmLogEntry = {
    ts: new Date().toISOString(),
    purpose,
    provider: target.provider,
    model: target.model,
    endpoint: target.baseURL ?? "https://api.anthropic.com",
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
    const client = new Anthropic({ apiKey: target.apiKey, ...(target.baseURL ? { baseURL: target.baseURL } : {}) });
    const params = {
      model: target.model,
      max_tokens: MAX_TOKENS,
      output_config: { effort: EFFORT, format: { type: "json_schema" as const, schema } },
      system,
      messages: [{ role: "user" as const, content: user }],
    };
    // Server-side refusal fallback exists on the first-party API only; Bedrock rejects the field.
    const { data: response, request_id } =
      target.provider === "anthropic"
        ? await client.beta.messages
            .create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
            .withResponse()
        : await client.messages.create(params).withResponse();
    const text = response.content.find((b) => b.type === "text");
    const body = text && text.type === "text" ? text.text : null;
    entry.request_id = request_id ?? null;
    entry.response = { id: response.id, model: response.model, stop_reason: response.stop_reason, text: body };
    entry.tokens = tokensOf(response.usage);
    entry.cost = costOf(target.model, target.provider, entry.tokens);
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
