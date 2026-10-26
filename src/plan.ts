// W 3: "The output is not the label. It is a release plan: how exposure grows, how long each step
// soaks, which guardrails watch it, what aborts it, and who is paged. The three modes are presets
// of that plan." Guardrails follow the failure mode; the undo step is "whatever the reversibility
// signals found" (W 3 line 106).
import type { Decision } from "./decide";
import PLANS from "./plans.json";
import type { ModeResult } from "./signals/detection";
import type { Signal } from "./types";

export interface PlanInput {
  decision: Decision;
  signals: Signal[];
  detectors: ModeResult[];
  flagKey: string | null;
  /** earlier author of the most touched files (git), if any */
  owner: string | null;
  /** whether the repo has a CODEOWNERS file (not parsed; the owner comes from git) */
  codeowners: boolean;
}

export type PlanRow = { row: string; value: string };

const get = (signals: Signal[], name: string) => signals.find((s) => s.name === name)!;

function guardrails(detectors: ModeResult[]): string {
  const map = PLANS.guardrailsByFailureMode as Record<string, string>;
  return detectors
    .map((r) => {
      const at = new Map<string, string[]>();
      for (const d of r.detectors) (at.get(`${d.what}, ${d.source}`) ?? at.set(`${d.what}, ${d.source}`, []).get(`${d.what}, ${d.source}`)!).push(d.at);
      const found = [...at].map(([what, refs]) => `${what} (${refs.join(", ")})`);
      return `${r.mode}: ${map[r.mode]}, ${found.length ? `watch ${found.join("; ")}` : "none found on the changed path"}`;
    })
    .join("; ");
}

function undoAndSlice(signals: Signal[], flagKey: string | null) {
  const flagSig = get(signals, "Feature flag");
  const revertSig = get(signals, "Time to revert");
  const flag = flagSig.value;
  const flip = `flip \`${flagKey}\` off (flag ${flag}, ${flagSig.source})`;
  const redeploy = `revert and redeploy (time to revert: ${revertSig.value}, ${revertSig.source})`;
  if (flag === "full") return { undo: `${PLANS.undo.flag} Undo: ${flip}.`, slice: `flag percentage on \`${flagKey}\`` };
  if (flag === "partial")
    return {
      undo: `${flip} for the code inside the flag; ${redeploy} for the edits outside it.`,
      slice: `flag percentage on \`${flagKey}\` for the code inside it; edits outside the flag reach everyone at deploy (rollout mechanism not found, so all-at-once is assumed)`,
    };
  return { undo: `${PLANS.undo.noFlag}. Undo: ${redeploy}.`, slice: "canary or percentage deploy (rollout mechanism not found, so all-at-once is assumed)" };
}

export function buildPlan(p: PlanInput): PlanRow[] {
  const mode = p.decision.mode;
  if (mode === "Block") return [{ row: "Release", value: "Blocked by a gate. Fix the gate before a plan is proposed." }];
  const preset = PLANS.presets[mode];
  const { undo, slice } = undoAndSlice(p.signals, p.flagKey);
  const staged = PLANS.presets.Staged;
  // Human: "Proposed by the system, approved or edited by the owner"; the system proposes the staged preset.
  const proposed = (text: string) => `Proposed by the system: ${text}. Approved or edited by the owner`;
  const rows: PlanRow[] = [];
  if (mode === "Auto") {
    rows.push({ row: "Exposure", value: preset.Exposure });
    rows.push({ row: "Soak per step", value: preset["Soak per step"] });
    rows.push({ row: "Guardrails", value: preset.Guardrails });
  } else {
    const exposure = `${staged.Exposure}; slice by ${slice}`;
    const soak = `${staged["Soak per step"]} (no traffic data in the input, so the hours are not scaled)`;
    rows.push({ row: "Exposure", value: mode === "Staged" ? exposure : proposed(exposure) });
    rows.push({ row: "Soak per step", value: mode === "Staged" ? soak : proposed(soak) });
    rows.push({ row: "Guardrails", value: `${preset.Guardrails}. ${guardrails(p.detectors)}` });
  }
  rows.push({ row: "Abort", value: preset.Abort });
  rows.push({ row: "Undo", value: undo });
  rows.push({
    row: "Paged",
    value: mode === "Human" ? `${preset.Paged}: ${p.owner ? `${p.owner} (earlier author of the most touched files, measured from git${p.codeowners ? "" : "; the repo has no CODEOWNERS file"})` : "no earlier author found in git"}` : preset.Paged,
  });
  rows.push({ row: "Sign-off", value: preset["Sign-off"] });
  return rows;
}
