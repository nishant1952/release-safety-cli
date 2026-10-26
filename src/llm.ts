// Optional LLM reads (spec "LLM use"): only when ANTHROPIC_API_KEY is set, only to classify
// failure mode, judge diff-vs-task coherence, or word reasons that already have evidence.
// Callers may use the answer to lower confidence or tighten the mode, never to loosen it.
import Anthropic from "@anthropic-ai/sdk";

export const LLM_MODEL = "claude-opus-5-5";

export const llmAvailable = () => Boolean(process.env.ANTHROPIC_API_KEY);

/** One structured-output call. Returns null when unavailable, refused, or on any API error. */
export async function askJson<T>(system: string, user: string, schema: Record<string, unknown>): Promise<T | null> {
  if (!llmAvailable()) return null;
  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: LLM_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content: user }],
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content.find((b) => b.type === "text");
    return text && text.type === "text" ? (JSON.parse(text.text) as T) : null;
  } catch (error) {
    if (error instanceof Anthropic.APIError || error instanceof SyntaxError) return null;
    throw error;
  }
}
