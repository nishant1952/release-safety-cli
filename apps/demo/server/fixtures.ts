// The demo's stored inputs, relative to the repo root: a bare clone of arcade and the 21 PR exports. Nothing
// computed from them is stored; a PR is measured from these when a viewer asks for it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Git } from "../../../src/git";
import { findPrFiles, loadPr } from "../../../src/pr";
import { measure, type Measured } from "../../../src/run";

export const FIXTURES = "apps/demo/fixtures";
export const REPO = join(FIXTURES, "arcade.git");
export const PRS = join(FIXTURES, "prs");
export const PR_NUMBERS = Array.from({ length: 21 }, (_, i) => i + 1);

const ROOT = new URL("../../..", import.meta.url).pathname;

/** "base: 30ac194  head: c5da112a  repo: ..." -> "30ac194..c5da112a" */
export function rangeOf(refs: string): string {
  const b = refs.match(/base:\s*([0-9a-f]+)/)?.[1];
  const h = refs.match(/head:\s*([0-9a-f]+)/)?.[1];
  if (!b || !h) throw new Error(`REFS.txt has no base and head: ${refs.trim()}`);
  return `${b}..${h}`;
}

/** Number and title of each stored export, from its pr.json. */
export function listExports(): { n: number; title: string }[] {
  return PR_NUMBERS.map((n) => ({ n, title: JSON.parse(readFileSync(join(ROOT, PRS, `pr${n}`, "pr.json"), "utf8")).title ?? "" }));
}

/**
 * measure() for one PR from the stored clone and exports. The export is found by matching the range against
 * the stored exports, the way the CLI matches data/, so PR 17 and PR 18 (one range) list both exports.
 */
export async function measurePr(n: number, onStage?: (stage: string, ms: number) => void): Promise<Measured> {
  const repo = join(ROOT, REPO);
  const range = rangeOf(readFileSync(join(ROOT, PRS, `pr${n}`, "REFS.txt"), "utf8"));
  const [b, h] = range.split("..");
  const git = new Git(repo);
  const prFiles = findPrFiles(git.resolve(b), git.resolve(h), join(ROOT, PRS));
  return measure(repo, range, await loadPr(prFiles[0] ?? null), prFiles, onStage);
}
