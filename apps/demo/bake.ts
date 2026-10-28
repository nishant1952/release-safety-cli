// bun run demo:bake. Stores everything the demo reads, once, so nothing is fetched at runtime:
//   fixtures/arcade.git   a bare clone of fireweave-HQ-Demo/arcade with every PR head (refs/pull/*/head)
//   fixtures/prs/prN/     pr.json, REFS.txt and required-checks.json, copied from data/prN
// and then checks that each of the 21 PRs measures. Run from anywhere; paths are relative to the repo root.
// Exits 1 if any PR fails to measure.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURES, measurePr, PRS, PR_NUMBERS, REPO } from "./server/fixtures";

process.chdir(new URL("../..", import.meta.url).pathname);
const SOURCE = process.env.ARCADE_SOURCE ?? "https://github.com/fireweave-HQ-Demo/arcade.git";

function git(...args: string[]) {
  const p = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${p.stderr.toString().trim()}`);
  return p.stdout.toString();
}

// 1. The bare clone, made once. PR heads that never reached main are only on the pull refs.
if (!existsSync(REPO)) {
  console.log(`cloning ${SOURCE} into ${REPO}`);
  git("clone", "--bare", "--quiet", SOURCE, REPO);
  git("-C", REPO, "fetch", "--quiet", "origin", "+refs/pull/*/head:refs/pull/*/head");
  // Hook samples and the fetch record are not needed to read the repo.
  rmSync(join(REPO, "hooks"), { recursive: true, force: true });
  rmSync(join(REPO, "FETCH_HEAD"), { force: true });
} else console.log(`${REPO} exists, not cloned again`);

// 2. The exports. data/ is gitignored, so on a machine without it the committed copies are used.
// PR 13's pr.json and REFS.txt were moved to tests/fixtures (DECISIONS.md, Inputs); its range is in PROMPT.md.
const PR13_REFS = "base: 30ac194  head: c5da112a  repo: /Users/nishant/fireweave-study/arcade\n";
for (const n of PR_NUMBERS) {
  const dest = join(PRS, `pr${n}`);
  const src = join("data", `pr${n}`);
  if (!existsSync(src)) {
    if (!existsSync(join(dest, "pr.json"))) throw new Error(`no export for PR ${n}: neither ${src} nor ${dest}`);
    continue;
  }
  mkdirSync(dest, { recursive: true });
  const prJson = existsSync(join(src, "pr.json")) ? join(src, "pr.json") : join("tests", "fixtures", `pr${n}.json`);
  cpSync(prJson, join(dest, "pr.json"));
  if (existsSync(join(src, "REFS.txt"))) cpSync(join(src, "REFS.txt"), join(dest, "REFS.txt"));
  else if (n === 13) writeFileSync(join(dest, "REFS.txt"), PR13_REFS);
  else throw new Error(`no REFS.txt for PR ${n}`);
  cpSync(join(src, "required-checks.json"), join(dest, "required-checks.json"));
}
console.log(`exports for ${PR_NUMBERS.length} PRs in ${PRS}`);

// 3. A check, not an output: every PR must measure from the stored clone and exports, or the bake (and the
// image build) fails. Nothing is written: the server measures each PR when a viewer asks for it.
const failed: string[] = [];
for (const n of PR_NUMBERS) {
  const started = performance.now();
  try {
    const m = await measurePr(n);
    console.log(`pr${n} ${m.base.slice(0, 8)}..${m.head.slice(0, 8)} measures in ${Math.round(performance.now() - started)} ms`);
  } catch (error) {
    failed.push(`pr${n}: ${(error as Error).message}`);
  }
}
if (failed.length) {
  console.error(`measurement failed for ${failed.length} PR(s):\n${failed.join("\n")}`);
  process.exit(1);
}
console.log(`stored inputs for ${PR_NUMBERS.length} PRs in ${FIXTURES}; all measure`);
