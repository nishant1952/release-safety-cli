// Where the baked inputs live, relative to the repo root, and how they are read back.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Measured } from "../../../src/run";

export const FIXTURES = "apps/demo/fixtures";
export const REPO = join(FIXTURES, "arcade.git");
export const PRS = join(FIXTURES, "prs");
export const MEASURED = join(FIXTURES, "measured");
export const PR_NUMBERS = Array.from({ length: 21 }, (_, i) => i + 1);

const ROOT = new URL("../../..", import.meta.url).pathname;

/** "base: 30ac194  head: c5da112a  repo: ..." -> "30ac194..c5da112a" */
export function rangeOf(refs: string): string {
  const b = refs.match(/base:\s*([0-9a-f]+)/)?.[1];
  const h = refs.match(/head:\s*([0-9a-f]+)/)?.[1];
  if (!b || !h) throw new Error(`REFS.txt has no base and head: ${refs.trim()}`);
  return `${b}..${h}`;
}

/** A baked measurement, with its repo path made absolute so git can be run from any directory. */
export function loadMeasured(n: number): Measured {
  const m: Measured = JSON.parse(readFileSync(join(ROOT, MEASURED, `pr${n}.json`), "utf8"));
  return { ...m, repo: join(ROOT, m.repo) };
}
