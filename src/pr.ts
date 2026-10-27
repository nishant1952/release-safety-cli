// PR metadata (title, body, author, optional CI checks) is a declared input.
// It is found by matching the resolved range against data/*/REFS.txt, or given with --pr.
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export interface PrMeta {
  file: string;
  title: string;
  body: string;
  author: { login: string; is_bot: boolean };
  /** gh's statusCheckRollup, when the export includes it; a check still running has conclusion PENDING */
  checks: { name: string; conclusion: string }[] | null;
  /** required-checks.json beside the export: names branch protection and rules require; null when the file is missing */
  required: { checks: string[]; source: string } | null;
  /** review count from gh's `reviews` or `latestReviews`, null when the export has neither field */
  reviews: number | null;
}

const DATA_DIR = new URL("../data", import.meta.url).pathname;

const natural = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

/** Every PR export under dir whose REFS.txt matches the range, in natural order (pr2 before pr10). */
export function findPrFiles(base: string, head: string, dir = DATA_DIR): string[] {
  let dirs: string[];
  try {
    dirs = readdirSync(dir).sort(natural);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const d of dirs) {
    let refs: string;
    try {
      refs = readFileSync(join(dir, d, "REFS.txt"), "utf8");
    } catch {
      continue;
    }
    const b = refs.match(/base:\s*([0-9a-f]+)/)?.[1];
    const h = refs.match(/head:\s*([0-9a-f]+)/)?.[1];
    if (b && h && base.startsWith(b) && head.startsWith(h)) found.push(join(dir, d, "pr.json"));
  }
  return found;
}

export const findPrFile = (base: string, head: string): string | null => findPrFiles(base, head)[0] ?? null;

export async function loadPr(file: string | null): Promise<PrMeta | null> {
  if (!file) return null;
  const f = Bun.file(file);
  if (!(await f.exists())) return null;
  const j = await f.json();
  const rollup = Array.isArray(j.statusCheckRollup)
    ? j.statusCheckRollup.map((c: any) => ({ name: c.name ?? c.context, conclusion: (c.conclusion || c.state || "PENDING").toUpperCase() }))
    : null;
  // data/<pr>/pr.json -> data/<pr>/required-checks.json; tests/fixtures/pr11.json -> tests/fixtures/pr11.required-checks.json
  const reqFile = Bun.file(basename(file) === "pr.json" ? join(dirname(file), "required-checks.json") : file.replace(/\.json$/, ".required-checks.json"));
  const req = (await reqFile.exists()) ? await reqFile.json() : null;
  return {
    file,
    title: j.title ?? "",
    body: j.body ?? "",
    author: { login: j.author?.login ?? "", is_bot: Boolean(j.author?.is_bot) },
    checks: rollup,
    required: req && Array.isArray(req.checks) ? { checks: req.checks.map(String), source: String(req.source ?? "") } : null,
    reviews: Array.isArray(j.reviews) ? j.reviews.length : Array.isArray(j.latestReviews) ? j.latestReviews.length : null,
  };
}
