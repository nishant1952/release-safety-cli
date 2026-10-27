// W 3: gates first, then the damage x window grid, then the one-direction probability shift.
// Batch rule is out of scope: one change.
import type { Reason } from "./brief";
import { ADVISORY_CI } from "./gates";
import type { GateResult, Signal } from "./types";
import type { Level } from "./signals/confidence";

export const MODES = ["Auto", "Staged", "Human", "Block"] as const;
export type Mode = (typeof MODES)[number];
const step = (m: Mode, n = 1): Mode => MODES[Math.min(MODES.indexOf(m) + n, MODES.indexOf("Human"))];
const stricter = (a: Mode, b: Mode): Mode => (MODES.indexOf(a) >= MODES.indexOf(b) ? a : b);

export interface DecisionInput {
  gates: GateResult[];
  signals: Signal[];
  /** confidence from measured facts only (W 2: missing data "does not raise risk on its own") */
  measuredConfidence: Level;
  /** LLM coherence read: false = mismatch; null = unavailable */
  coherent: boolean | null;
}

export interface Decision {
  mode: Mode;
  gateMode: Mode | null;
  gridMode: Mode;
  damage: "high" | "low";
  window: "short" | "long";
  undoFast: boolean;
  detectFast: boolean;
  shifted: boolean;
  llmStep: boolean;
  reasons: Reason[];
  flagAdvice: string | null;
}

const get = (signals: Signal[], name: string) => {
  const s = signals.find((s) => s.name === name);
  if (!s) throw new Error(`decision needs signal "${name}"`);
  return s;
};
const FAST_REVERT = ["one-click rollback", "measured pipeline under 15 minutes"];

// W 3 grid: "Low damage | Auto | Staged", "High damage | Staged | Human".
const GRID: Record<"low" | "high", Record<"short" | "long", Mode>> = {
  low: { short: "Auto", long: "Staged" },
  high: { short: "Staged", long: "Human" },
};

function windowOf(signals: Signal[], flagValue: string) {
  const reversible = get(signals, "Reversible or irreversible").value === "reversible";
  // DECISIONS.md undo-speed resolution: a flag covering the whole change is fast; otherwise time to revert decides.
  const undoFast = flagValue === "full" || FAST_REVERT.includes(get(signals, "Time to revert").value);
  const detectFast = get(signals, "Detection apparatus").value === "fast";
  return { reversible, undoFast, detectFast, window: (reversible && undoFast && detectFast ? "short" : "long") as "short" | "long" };
}

export function decide(input: DecisionInput): Decision {
  const { signals } = input;
  const reasons: Reason[] = [];

  // 1. Gates (W 1a): "They block the release or route it to a human."
  let gateMode: Mode | null = null;
  for (const g of input.gates.filter((g) => g.route !== "none")) {
    gateMode = stricter(gateMode ?? "Auto", g.route === "block" ? "Block" : "Human");
    const failing = g.checks.filter((c) => c.status !== "pass");
    reasons.push({
      text: `Gate ${g.gate} (${g.name}) is ${g.status}, so it routes to ${g.route === "block" ? "block" : "a human"}: ${failing.map((c) => `${c.name}: ${c.note}`).join("; ")}.`,
      evidence: failing.flatMap((c) => c.evidence),
    });
  }

  // A red check nothing requires cannot route the release, but the brief says it is red.
  for (const g of input.gates)
    for (const c of g.checks.filter((c) => c.name === ADVISORY_CI))
      reasons.push({
        text: `Gate ${g.gate}: ${c.note.charAt(0).toUpperCase()}${c.note.slice(1)}.`,
        evidence: c.evidence,
        basis: "the PR export's check rollup and required-checks.json (declared and measured), not on a line of code",
      });

  // 2. Damage (W 1b): path and reach are the primary damage signals.
  const path = get(signals, "Path");
  const reach = get(signals, "Reach");
  const damage = path.value === "live" && reach.value === "high" ? "high" : "low";
  reasons.push({
    text:
      damage === "high"
        ? `High damage: the path is live (${path.source}) and the reach is high (${reach.source}). ${reach.note}.`
        : `Low damage: ${path.value !== "live" ? `the path is ${path.value} (${path.source})` : `the reach is ${reach.value} (${reach.source})`}.`,
    evidence: [...path.evidence.slice(-3), ...reach.evidence.filter((e) => e.startsWith("apps/api/"))],
  });

  // 3. Window (W 1c): "how fast we see it break plus how fast we get back".
  const flag = get(signals, "Feature flag");
  const revert = get(signals, "Time to revert");
  const detection = get(signals, "Detection apparatus");
  const w = windowOf(signals, flag.value);
  const why: string[] = [];
  if (!w.reversible) why.push("the change is irreversible");
  if (!w.undoFast)
    why.push(
      `undo is slow: the flag is ${flag.value}${flag.value === "partial" ? " (edits outside it use the revert path)" : ""} and time to revert is ${revert.value} (${revert.source})`,
    );
  if (!w.detectFast) why.push(`detection is slow (${detection.source}): ${detection.note.split(". ")[0]}`);
  reasons.push({
    text: w.window === "short" ? "Short window: reversible, fast undo and a detector for every failure mode." : `Long window: ${why.join("; ")}.`,
    evidence: [...revert.evidence, ...detection.evidence.slice(0, 3)],
  });

  const gridMode = GRID[damage][w.window];

  // 4. Probability (W 3): "auto moves to staged, staged moves to human. It never moves the other way."
  let mode: Mode = gridMode;
  const shifted = input.measuredConfidence === "low" && gridMode !== "Human";
  if (shifted) mode = step(mode);
  if (input.measuredConfidence === "low")
    reasons.push({
      text: `Probability: measured confidence is low, so the mode moves one step toward caution${gridMode === "Human" ? " (already Human, no further step)" : ` (${gridMode} to ${mode})`}.`,
      evidence: get(signals, "Confidence: test coverage").evidence,
    });

  // Spec "LLM use": the model may move the mode one step toward caution, never loosen it.
  const llmStep = input.coherent === false && mode !== "Human";
  if (llmStep) {
    reasons.push({ text: `LLM found the diff does not match the task: one step toward caution (${mode} to ${step(mode)}).`, evidence: [] });
    mode = step(mode);
  }

  if (gateMode) mode = stricter(mode, gateMode);

  // W 3: "When a change lands in Staged or Human only because it has no flag, the cheapest way left is to add one".
  // No flag can wrap a change that is not a code path (docs, CI, stylesheets only), so no advice then.
  let flagAdvice: string | null = null;
  if (flag.value !== "full" && path.value !== "not a code path") {
    const withFlag = GRID[damage][windowOf(signals, "full").window];
    if (MODES.indexOf(withFlag) < MODES.indexOf(gridMode))
      flagAdvice =
        flag.value === "none"
          ? `Adding a flag around the change would move the grid from ${gridMode} to ${withFlag}.`
          : `Moving the edits outside the flag behind it would move the grid from ${gridMode} to ${withFlag}.`;
  }

  return { mode, gateMode, gridMode, damage, window: w.window, undoFast: w.undoFast, detectFast: w.detectFast, shifted, llmStep, reasons, flagAdvice };
}

export function modeLine(d: Decision): string {
  const grid = `${d.damage} damage x ${d.window} window = ${d.gridMode}`;
  const shift = d.shifted ? `, low confidence moves it to ${step(d.gridMode)}` : "";
  const gate = d.gateMode ? `. Gates route to ${d.gateMode}` : "";
  return `Grid: ${grid}${shift}${gate}.${d.flagAdvice ? ` ${d.flagAdvice}` : ""}`;
}
