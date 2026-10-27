// bun run export <owner/repo> <pr-number> <repo-path> [--out dir] [--required-only]
// Writes a PR export: pr.json (gh pr view), REFS.txt (the range), and required-checks.json, the check
// names branch protection and repository rules require on the PR's base branch. --required-only
// writes just required-checks.json next to an existing export, leaving pr.json as it was.
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const PR_FIELDS = "author,body,reviews,state,statusCheckRollup,title,url,baseRefName,baseRefOid,headRefOid";

function gh(args: string[]): { ok: true; json: any } | { ok: false; error: string } {
  const p = Bun.spawnSync(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) return { ok: false, error: p.stderr.toString().trim().split("\n").pop() ?? `exit ${p.exitCode}` };
  return { ok: true, json: JSON.parse(p.stdout.toString()) };
}

const names = (xs: any[] | undefined, key = "context") => (xs ?? []).map((x) => (typeof x === "string" ? x : x?.[key])).filter(Boolean);

/** Required check names on a branch, and which endpoints said so. Null when neither source could be read. */
export function requiredChecks(repo: string, branch: string): { checks: string[]; source: string } | null {
  const found = new Set<string>();
  const said: string[] = [];
  let read = false;
  const protection = gh(["api", `repos/${repo}/branches/${branch}/protection`]);
  if (protection.ok) {
    const r = protection.json.required_status_checks;
    const c = [...names(r?.contexts), ...names(r?.checks)];
    c.forEach((n) => found.add(n));
    said.push(`GET repos/${repo}/branches/${branch}/protection: ${c.length} required status check(s)`);
    read = true;
  } else {
    said.push(`GET repos/${repo}/branches/${branch}/protection: ${protection.error}`);
    // The protection endpoint needs admin rights; the branch summary is readable with pull rights.
    const summary = gh(["api", `repos/${repo}/branches/${branch}`]);
    if (summary.ok) {
      const r = summary.json.protection?.required_status_checks;
      const c = [...names(r?.contexts), ...names(r?.checks)];
      c.forEach((n) => found.add(n));
      said.push(`GET repos/${repo}/branches/${branch}: protected=${summary.json.protected}, ${c.length} required status check(s)`);
      read = true;
    } else said.push(`GET repos/${repo}/branches/${branch}: ${summary.error}`);
  }
  const rules = gh(["api", `repos/${repo}/rules/branches/${branch}`]);
  if (rules.ok) {
    const c = (rules.json as any[])
      .filter((r) => r.type === "required_status_checks")
      .flatMap((r) => names(r.parameters?.required_status_checks));
    c.forEach((n) => found.add(n));
    said.push(`GET repos/${repo}/rules/branches/${branch}: ${c.length} required status check(s) in rules`);
    read = true;
  } else said.push(`GET repos/${repo}/rules/branches/${branch}: ${rules.error}`);
  return read ? { checks: [...found].sort(), source: said.join("; ") } : null;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (f: string) => {
    const i = args.indexOf(f);
    return i === -1 ? null : args.splice(i, f === "--out" ? 2 : 1)[f === "--out" ? 1 : 0];
  };
  const out = flag("--out");
  const requiredOnly = flag("--required-only") !== null;
  const [repo, number, repoPath] = args;
  if (!repo || !number || (!repoPath && !requiredOnly)) {
    console.error("usage: bun run export <owner/repo> <pr-number> <repo-path> [--out dir] [--required-only]");
    process.exit(2);
  }
  const dir = out ?? new URL(`../data/pr${number}`, import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  const pr = gh(["pr", "view", number, "-R", repo, "--json", requiredOnly ? "baseRefName" : PR_FIELDS]);
  if (!pr.ok) throw new Error(`gh pr view ${number}: ${pr.error}`);
  if (!requiredOnly) {
    await Bun.write(join(dir, "pr.json"), JSON.stringify(pr.json, null, 2) + "\n");
    await Bun.write(join(dir, "REFS.txt"), `base: ${pr.json.baseRefOid.slice(0, 8)}  head: ${pr.json.headRefOid.slice(0, 8)}  repo: ${repoPath}\n`);
  }
  const required = requiredChecks(repo, pr.json.baseRefName);
  if (required) await Bun.write(join(dir, "required-checks.json"), JSON.stringify(required, null, 2) + "\n");
  else console.error(`required checks for ${pr.json.baseRefName} could not be read; required-checks.json not written`);
  console.error(`${dir}: ${requiredOnly ? "" : "pr.json, REFS.txt, "}${required ? `required-checks.json (${required.checks.length} required)` : "no required-checks.json"}`);
}
