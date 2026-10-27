// What the release owner may enter in place of what was measured or assumed (the demo's owner panel, the
// CLI's --overrides). Applied before the model contract, so the model sees only the signals still assumed.
// W 2: "Measured beats declared": an owner value for a measured signal is listed as a disagreement and the
// measured value stands. An assumed or declared value is replaced and tagged "declared by owner".
import { nonCodeKind } from "./files";
import { withCiChecks } from "./gates";
import type { PrMeta } from "./pr";
import type { Measured } from "./run";
import { featureFlag, type LineClass } from "./signals/flag";
import type { GateResult, Signal } from "./types";

export interface Overrides {
  /** owner values by signal name */
  signals?: Record<string, string>;
  /** false: no model call, even with a key */
  model?: boolean;
  /** every check in the PR export's rollup counts as required by gate 1 */
  advisoryAsRequired?: boolean;
  /** added stylesheet lines count as covered by the flag rather than outside it */
  stylesheetsCovered?: boolean;
  /** time to revert as a measured pipeline, in minutes */
  revertMinutes?: number | null;
}

/** Signals the model writes in decide; an owner value for them has nothing to replace. */
const MODEL_READS = ["Failure mode (LLM second opinion)", "Confidence: diff vs task (LLM)"];

export interface Applied {
  pr: PrMeta | null;
  gates: GateResult[];
  early: Signal[];
  late: Signal[];
  atBase: Signal | null;
  /** owner values that a measured signal outranks (W 2), listed as disagreements */
  disagreements: string[];
}

const owned = (s: Signal, value: string, why: string): Signal => ({
  name: s.name,
  value,
  source: "declared by owner",
  evidence: [],
  note: `${why}; was "${s.value}" (${s.source}): ${s.note}`,
});

/** Throws on a signal name the measurement does not have, so a typo is not silently ignored. */
export function applyOverrides(m: Measured, o: Overrides = {}): Applied {
  let { pr, gates, early, late, atBase } = m;
  const disagreements: string[] = [];

  if (o.advisoryAsRequired && pr?.checks && pr.required) {
    const checks = [...new Set([...pr.required.checks, ...pr.checks.map((c) => c.name)])];
    pr = { ...pr, required: { checks, source: `${pr.required.source}; the owner treats every check in the rollup as required` } };
    gates = [withCiChecks(gates[0], pr), ...gates.slice(1)];
  }

  if (o.stylesheetsCovered && m.flag.flags.length) {
    let moved = 0;
    const lines = new Map<string, LineClass>(
      m.flag.lines.map(([ref, cls]) => {
        if (cls !== "outside" || nonCodeKind(ref.replace(/:\d+$/, "")) !== "stylesheet") return [ref, cls];
        moved++;
        return [ref, "inside"];
      }),
    );
    const flag = featureFlag({ ...m.flag, lines });
    const was = early.find((s) => s.name === flag.name)!;
    // The lines are still measured; when the owner's counting rule changes the value, the value rests on the owner.
    if (moved) flag.note += `. The owner counts stylesheet lines as covered by the flag: ${moved} line(s) moved from outside to inside`;
    if (flag.value !== was.value) flag.source = "declared by owner";
    early = early.map((s) => (s.name === flag.name ? flag : s));
  }

  const values = { ...o.signals };
  const why: Record<string, string> = {};
  if (o.revertMinutes !== undefined && o.revertMinutes !== null) {
    if (!(o.revertMinutes >= 0)) throw new Error(`revertMinutes must be a number of minutes, got ${o.revertMinutes}`);
    // DECISIONS.md undo-speed resolution: a measured pipeline under 15 minutes is fast.
    values["Time to revert"] = o.revertMinutes < 15 ? "measured pipeline under 15 minutes" : `measured pipeline of ${o.revertMinutes} minutes`;
    why["Time to revert"] = `the owner measured the build and deploy pipeline at ${o.revertMinutes} minutes`;
  }

  const known = [...early, ...late, ...(atBase ? [atBase] : [])].map((s) => s.name);
  for (const name of Object.keys(values)) {
    if (MODEL_READS.includes(name)) throw new Error(`"${name}" is the model's answer; it cannot be declared by the owner`);
    if (!known.includes(name)) throw new Error(`no signal named "${name}"`);
  }
  const apply = (s: Signal): Signal => {
    const v = values[s.name]?.trim();
    if (!v || v === s.value) return s;
    if (s.source === "measured") {
      disagreements.push(`the owner declares ${s.name} = "${v}", but it is measured as "${s.value}"; measured beats declared, so the measured value stands (W 2)`);
      return s;
    }
    return owned(s, v, why[s.name] ?? "declared by the owner");
  };
  return { pr, gates, early: early.map(apply), late: late.map(apply), atBase: atBase && apply(atBase), disagreements };
}
