// What moved between two runs of one PR: mode, grid cell, gates, confidence, the top reasons and the
// provenance rows. Reasons and disagreements are compared by their text; a row is one signal, by name.
import type { Reason } from "../../../../src/brief";
import type { RunResult } from "../../server/app";

export interface Change<T> {
  before: T;
  after: T;
  changed: boolean;
}

export interface Row {
  name: string;
  before: { value: string; source: string } | null;
  after: { value: string; source: string; note: string } | null;
}

export interface BriefDiff {
  mode: Change<string>;
  cell: Change<string>;
  gates: Change<string>[];
  confidence: Change<string>;
  /** unchanged = same text; reworded = same text whose LLM wording or model evidence changed */
  reasons: { added: Reason[]; removed: Reason[]; reworded: Reason[]; unchanged: number };
  changedRows: Row[];
  unchangedRows: Row[];
  disagreements: { added: string[]; removed: string[] };
}

const change = <T>(before: T, after: T): Change<T> => ({ before, after, changed: before !== after });
export const cellOf = (r: RunResult) => `${r.cell.damage} x ${r.cell.window}`;
const gateText = (g: RunResult["brief"]["gates"][number]) => `${g.gate}. ${g.name}: ${g.status}${g.route !== "none" ? `, routes to ${g.route}` : ""}`;
const extras = (r: Reason) => JSON.stringify([r.prose ?? null, r.model ?? null]);

export function diffRuns(before: RunResult, after: RunResult): BriefDiff {
  const b = before.brief;
  const a = after.brief;
  const bTexts = new Set(b.reasons.map((r) => r.text));
  const aTexts = new Set(a.reasons.map((r) => r.text));
  const rows: Row[] = [];
  const names = [...new Set([...b.signals.map((s) => s.name), ...a.signals.map((s) => s.name)])];
  for (const name of names) {
    const x = b.signals.find((s) => s.name === name);
    const y = a.signals.find((s) => s.name === name);
    rows.push({ name, before: x ? { value: x.value, source: x.source } : null, after: y ? { value: y.value, source: y.source, note: y.note } : null });
  }
  const same = (r: Row) => r.before?.value === r.after?.value && r.before?.source === r.after?.source;
  const bDis = b.disagreements ?? [];
  const aDis = a.disagreements ?? [];
  return {
    mode: change(b.mode ?? "", a.mode ?? ""),
    cell: change(cellOf(before), cellOf(after)),
    gates: b.gates.map((g, i) => change(gateText(g), gateText(a.gates[i]))),
    confidence: change(b.confidence?.level ?? "", a.confidence?.level ?? ""),
    reasons: {
      added: a.reasons.filter((r) => !bTexts.has(r.text)),
      removed: b.reasons.filter((r) => !aTexts.has(r.text)),
      reworded: a.reasons.filter((r) => bTexts.has(r.text) && extras(r) !== extras(b.reasons.find((x) => x.text === r.text)!)),
      unchanged: a.reasons.filter((r) => bTexts.has(r.text)).length,
    },
    changedRows: rows.filter((r) => !same(r)),
    unchangedRows: rows.filter(same),
    disagreements: { added: aDis.filter((d) => !bDis.includes(d)), removed: bDis.filter((d) => !aDis.includes(d)) },
  };
}
