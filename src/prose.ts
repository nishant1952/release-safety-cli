// Spec "LLM use": the model may "write two-sentence prose for reasons that already have evidence
// lines". The prose sits beside the reason; it never changes the reason, the mode or the plan.
import type { Reason } from "./brief";
import { askJson, llmAvailable } from "./llm";

const SCHEMA = {
  type: "object",
  properties: { prose: { type: "string" } },
  required: ["prose"],
  additionalProperties: false,
};

export async function addProse(
  reasons: Reason[],
  quote: (ref: string) => string | null,
  ask: typeof askJson = askJson,
  available = llmAvailable(),
  withheld = false,
): Promise<Reason[]> {
  if (!available || withheld) return reasons;
  const out: Reason[] = [];
  for (const r of reasons) {
    if (!r.evidence.length) {
      out.push(r);
      continue;
    }
    const lines = r.evidence.map((e) => `${e}: ${quote(e) ?? "(not quotable)"}`).join("\n");
    const answer = await ask<{ prose: string }>(
      "You explain one reason in a release brief to the engineer who will approve the release. Write exactly two plain sentences. " +
        "Use only the reason and the cited lines; add no new claims, numbers or advice.",
      `Reason: ${r.text}\n\nCited lines:\n${lines}`,
      SCHEMA,
    );
    out.push(answer?.prose ? { ...r, prose: answer.prose.trim() } : r);
  }
  return out;
}
