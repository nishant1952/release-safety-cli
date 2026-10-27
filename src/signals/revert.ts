// W 1c item 6, appendix Reversibility rank 6: "Time to revert ... the time to push, build and
// release a new change, or to roll back"; extracted from "CI pipeline duration history, one-click
// rollback". Resolution in DECISIONS.md: one-click rollback or a measured pipeline under 15 minutes
// is fast; unknown rounds to slow (W 2 "a full build and deploy to revert, never 'instant'").
import { Git } from "../git";
import type { Diff } from "../diff";
import type { Signal } from "../types";

export const FAST_PIPELINE_MINUTES = 15;
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;
// A rollback offered by the workflow itself: a `name:` value or a lowercase key (job id, input)
// naming it. Negated names ("no rollback") and env-style keys (ROLLBACK_ENABLED) do not count.
export const offersRollback = (l: string) =>
  /^\s*(-\s*)?name:\s*["']?[^#\n]*\broll ?back\b/i.test(l)
    ? !/\b(no|not|without|disabled?|never)\b/i.test(l)
    : /^\s*[a-z0-9-]*roll-?back[a-z0-9-]*:/.test(l);
const REF_INPUT = /^(ref|sha|version|tag|commit)$/i;
const indent = (l: string) => l.match(/^\s*/)![0].length;

/** Line (1-based) of a workflow_dispatch input that takes a ref, scoped by indentation; null if none. */
export function dispatchRefInput(lines: string[]): number | null {
  const d = lines.findIndex((l) => /^\s*workflow_dispatch:\s*$/.test(l));
  if (d < 0) return null;
  let i = d + 1;
  while (i < lines.length && (!lines[i].trim() || lines[i].trim().startsWith("#"))) i++;
  if (i >= lines.length || indent(lines[i]) <= indent(lines[d]) || !/^\s*inputs:\s*$/.test(lines[i])) return null;
  const inputsIndent = indent(lines[i]);
  let keyIndent = -1;
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j];
    if (!l.trim() || l.trim().startsWith("#")) continue;
    if (indent(l) <= inputsIndent) break;
    if (keyIndent < 0) keyIndent = indent(l);
    if (indent(l) !== keyIndent) continue;
    const key = l.trim().match(/^([\w-]+):/)?.[1];
    if (key && REF_INPUT.test(key)) return j + 1;
  }
  return null;
}

export interface RevertFacts {
  /** CI workflow files (declared config) */
  workflows: { path: string; rollback: number | null; timeouts: { value: number; line: number }[] }[];
  /** measured pipeline duration in minutes; CI run history is not an input, so always null here */
  measuredMinutes: number | null;
}

export function revertFacts(diff: Diff): RevertFacts {
  const git = new Git(diff.repo);
  const workflows = git
    .listFiles(diff.head)
    .filter((p) => WORKFLOW.test(p))
    .map((path) => {
      const text = git.show(diff.head, path) ?? "";
      const lines = text.split("\n");
      const rbLine = lines.findIndex(offersRollback);
      return {
        path,
        rollback: rbLine >= 0 ? rbLine + 1 : dispatchRefInput(lines),
        timeouts: lines.flatMap((l, i) => {
          const m = l.match(/^\s*timeout-minutes:\s*(\d+)/);
          return m ? [{ value: Number(m[1]), line: i + 1 }] : [];
        }),
      };
    });
  return { workflows, measuredMinutes: null };
}

export function revertSignal(f: RevertFacts): Signal<"one-click rollback" | "measured pipeline under 15 minutes" | "full build and deploy"> {
  const name = "Time to revert";
  const rollback = f.workflows.find((w) => w.rollback !== null);
  if (rollback)
    return {
      name,
      value: "one-click rollback",
      source: "declared",
      evidence: [`${rollback.path}:${rollback.rollback}`],
      note: "a deploy workflow offers a rollback or a dispatch that takes a ref",
    };
  if (f.measuredMinutes !== null && f.measuredMinutes < FAST_PIPELINE_MINUTES)
    return { name, value: "measured pipeline under 15 minutes", source: "measured", evidence: [], note: `${f.measuredMinutes} minutes` };
  const bounds = f.workflows.flatMap((w) => w.timeouts.map((t) => ({ path: w.path, ...t })));
  return {
    name,
    value: "full build and deploy",
    source: "assumed",
    evidence: bounds.map((b) => `${b.path}:${b.line}`),
    note:
      `no one-click rollback in ${f.workflows.length} workflow file(s); CI run history is not an input, so pipeline duration is not measured` +
      (bounds.length ? `. Declared job timeout: ${bounds.map((b) => `${b.value} min`).join(", ")} (a bound, not a measurement)` : "") +
      ". Unknown rounds to slow: a full build and deploy to revert (W 2)",
  };
}
