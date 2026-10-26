// PR metadata (title, body, author, optional CI checks) is a declared input.
// It is found by matching the resolved range against data/*/REFS.txt, or given with --pr.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface PrMeta {
  file: string;
  title: string;
  body: string;
  author: { login: string; is_bot: boolean };
  /** gh's statusCheckRollup, when the export includes it */
  checks: { name: string; conclusion: string }[] | null;
}

const DATA_DIR = new URL("../data", import.meta.url).pathname;

export function findPrFile(base: string, head: string): string | null {
  let dirs: string[];
  try {
    dirs = readdirSync(DATA_DIR).sort();
  } catch {
    return null;
  }
  for (const d of dirs) {
    let refs: string;
    try {
      refs = readFileSync(join(DATA_DIR, d, "REFS.txt"), "utf8");
    } catch {
      continue;
    }
    const b = refs.match(/base:\s*([0-9a-f]+)/)?.[1];
    const h = refs.match(/head:\s*([0-9a-f]+)/)?.[1];
    if (b && h && base.startsWith(b) && head.startsWith(h)) return join(DATA_DIR, d, "pr.json");
  }
  return null;
}

export async function loadPr(file: string | null): Promise<PrMeta | null> {
  if (!file) return null;
  const f = Bun.file(file);
  if (!(await f.exists())) return null;
  const j = await f.json();
  const rollup = Array.isArray(j.statusCheckRollup)
    ? j.statusCheckRollup.map((c: any) => ({ name: c.name ?? c.context, conclusion: c.conclusion ?? c.state }))
    : null;
  return {
    file,
    title: j.title ?? "",
    body: j.body ?? "",
    author: { login: j.author?.login ?? "", is_bot: Boolean(j.author?.is_bot) },
    checks: rollup,
  };
}
