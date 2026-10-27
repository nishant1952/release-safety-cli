// Applies the missing-data policy in policy.json (W 2) to extracted signals and confidence.
import POLICY from "./policy.json";
import type { Signal } from "./types";
import type { Level } from "./signals/confidence";

export { POLICY };

const ORDER: Level[] = ["high", "medium", "low"];
const lowerBy = (l: Level, steps: number): Level => ORDER[Math.min(ORDER.indexOf(l) + steps, ORDER.length - 1)];

export interface PolicyResult {
  signals: Signal[];
  /** final confidence after assumed inputs and disagreements */
  level: Level;
  /** from measured facts only; the only level allowed to move the mode (W 2 "does not raise risk on its own") */
  measuredLevel: Level;
  why: string[];
}

/** notches: measured facts that each lower the reported confidence one step but never move the mode. */
export function applyPolicy(signals: Signal[], measuredLevel: Level, disagreements: string[], notches: string[] = []): PolicyResult {
  const damage: Record<string, string> = POLICY.damage.assume;
  const reversibility: Record<string, string> = POLICY.reversibility.assume;
  const why: string[] = [];
  const out = signals.map((s) => {
    if (s.source !== "assumed") return s;
    const [rounded, how] = s.name in damage ? [damage[s.name], "rounds up"] : s.name in reversibility ? [reversibility[s.name], "rounds to slow"] : [undefined, ""];
    if (rounded === undefined || s.value === rounded) return s;
    return { ...s, value: rounded, note: `${s.note}. Policy: assumed ${s.value} ${how}, so it is set to ${rounded}` };
  });

  let level = measuredLevel;
  // Missing data lowers confidence; an LLM answer that came back is an opinion, not missing data.
  const missing = (s: Signal) => s.source === "assumed" && (!s.name.includes("(LLM") || s.value === "unavailable");
  for (const s of out.filter((s) => missing(s) && POLICY.probability.signals.includes(s.name))) {
    level = lowerBy(level, POLICY.probability.lowerConfidenceSteps);
    why.push(`${s.name}: ${s.value} (assumed), lowers confidence, does not raise risk (W 2)`);
  }
  for (const n of notches) {
    level = lowerBy(level, 1);
    why.push(`${n}, lowers confidence one notch`);
  }
  for (const d of disagreements) {
    level = lowerBy(level, POLICY.disagreement.lowerConfidenceSteps);
    why.push(`disagreement lowers confidence: ${d} (W 2)`);
  }
  return { signals: out, level, measuredLevel, why };
}
