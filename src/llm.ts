// Optional LLM reads (spec "LLM use"): only when a credential is set, only to classify failure
// mode, judge diff-vs-task coherence, or word reasons that already have evidence. Callers may use
// the answer to lower confidence or tighten the mode, never to loosen it.
import Anthropic from "@anthropic-ai/sdk";

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

/** One structured-output call. Returns null when unavailable, refused, or on any API error. */
export async function askJson<T>(system: string, user: string, schema: Record<string, unknown>): Promise<T | null> {
  const target = llmTarget();
  if (!target) return null;
  try {
    const client = new Anthropic({ apiKey: target.apiKey, ...(target.baseURL ? { baseURL: target.baseURL } : {}) });
    const params = {
      model: target.model,
      max_tokens: 4000,
      output_config: { effort: "low" as const, format: { type: "json_schema" as const, schema } },
      system,
      messages: [{ role: "user" as const, content: user }],
    };
    // Server-side refusal fallback exists on the first-party API only; Bedrock rejects the field.
    const response =
      target.provider === "anthropic"
        ? await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
        : await client.messages.create(params);
    if (response.stop_reason === "refusal") return null;
    const text = response.content.find((b) => b.type === "text");
    return text && text.type === "text" ? (JSON.parse(text.text) as T) : null;
  } catch (error) {
    if (error instanceof Anthropic.APIError || error instanceof SyntaxError) return null;
    throw error;
  }
}
