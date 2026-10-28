// What the release owner may enter in place of what was measured or assumed (the demo's owner panel, the
// CLI's --overrides). Applied before the model contract, so the model sees only the signals still assumed.
// An owner value replaces the signal and is tagged "declared by owner". W 2 says "Measured beats declared", so
// for the demo a value that replaces a measured or declared one is contested: the brief marks it with a caution,
// and one over a measured value is also listed as a disagreement (DECISIONS.md, Round 6).
import type { Level } from "./signals/confidence";
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
  /** the measured confidence level, in place of the one test coverage and familiarity gave */
  confidence?: Level;
}

/** An owner value that replaced a measured or declared one (not an assumed one): the brief marks it with a caution. */
export interface Contested {
  name: string;
  value: string;
  was: string;
  wasSource: string;
}

/**
 * The values the decision tests for each signal it reads (src/decide.ts, src/unknown.ts). An owner value outside
 * the set would fall through the grid's equality tests as favourable ("Reach = banana" is not "high"), so it is
 * refused. Time to revert as a measured pipeline comes only from revertMinutes. Other signals only lower
 * confidence, so their values are free text.
 */
export const VALUES: Record<string, string[]> = {
  "Reversible or irreversible": ["irreversible", "reversible"],
  "Feature flag": ["none", "partial", "full"],
  Path: ["live", "unreached", "not a code path"],
  Reach: ["high", "low", "none"],
  "Detection apparatus": ["slow", "fast"],
  "Time to revert": ["full build and deploy", "one-click rollback"],
};

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
  /** each switch that took effect, as a sentence: a switch can change what a measured value counts without retagging it */
  switches: string[];
  /** owner values that replaced a measured or declared value, confidence included */
  contested: Contested[];
  /** the measured confidence level the decision uses: the owner's when declared */
  measuredLevel: Level;
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
  const switches: string[] = [];
  const contested: Contested[] = [];
  let measuredLevel = m.confidence.measuredLevel;
  if (o.confidence !== undefined) {
    if (!["high", "medium", "low"].includes(o.confidence)) throw new Error(`confidence must be high, medium or low, got ${o.confidence}`);
    if (o.confidence !== measuredLevel) {
      disagreements.push(`the owner declares confidence ${o.confidence} over the measured ${measuredLevel}; the decision uses the owner's value`);
      contested.push({ name: "Confidence", value: o.confidence, was: measuredLevel, wasSource: "measured" });
      measuredLevel = o.confidence;
    }
  }

  if (o.model === false) switches.push("the owner switched the model off for this run");

  if (o.advisoryAsRequired && pr?.checks && pr.required) {
    const checks = [...new Set([...pr.required.checks, ...pr.checks.map((c) => c.name)])];
    pr = { ...pr, required: { checks, source: `${pr.required.source}; the owner treats every check in the rollup as required` } };
    // The required set is now the owner's, so the CI verdict rests on the owner.
    const gate1 = withCiChecks(gates[0], pr);
    const ci = gate1.checks.find((c) => c.name === "required CI checks");
    if (ci) contested.push({ name: "Gate 1, required CI checks", value: ci.status, was: gates[0].checks.find((c) => c.name === ci.name)?.status ?? "", wasSource: "measured" });
    gate1.checks = gate1.checks.map((c) => (c.name === "required CI checks" ? { ...c, source: "declared by owner" } : c));
    gates = [gate1, ...gates.slice(1)];
    switches.push("the owner treats every check in the PR export's rollup as required by gate 1");
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
    if (moved) {
      flag.note += `. The owner counts stylesheet lines as covered by the flag: ${moved} line(s) moved from outside to inside`;
      switches.push(`the owner counts stylesheet lines as covered by the flag: ${moved} line(s) moved from outside to inside, so the Feature flag line counts rest on the owner`);
    }
    if (flag.value !== was.value) {
      flag.source = "declared by owner";
      contested.push({ name: flag.name, value: flag.value, was: was.value, wasSource: was.source });
    }
    early = early.map((s) => (s.name === flag.name ? flag : s));
  }

  const values = { ...o.signals };
  for (const [name, v] of Object.entries(values))
    if (VALUES[name] && v.trim() && !VALUES[name].includes(v.trim()))
      throw new Error(`"${v}" is not a value of ${name}; it must be one of: ${VALUES[name].join(", ")}${name === "Time to revert" ? " (a measured pipeline is set with revertMinutes)" : ""}`);
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
    if (s.source !== "assumed") contested.push({ name: s.name, value: v, was: s.value, wasSource: s.source });
    if (s.source === "measured")
      disagreements.push(`the owner declares ${s.name} = "${v}" over the measured "${s.value}"; the decision uses the owner's value`);
    return owned(s, v, why[s.name] ?? "declared by the owner");
  };
  return { pr, gates, early: early.map(apply), late: late.map(apply), atBase: atBase && apply(atBase), disagreements, switches, contested, measuredLevel };
}
