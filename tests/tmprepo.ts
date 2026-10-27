// Builds a throwaway git repo from fixture trees: one commit per tree, in order. Returns the repo
// path and the range from the first commit to the last, for tests that need a repo the CLI can read.
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FIXTURES = new URL("./fixtures/", import.meta.url).pathname;

export function fixtureRepo(name: string, trees: string[]): { repo: string; range: string } {
  const repo = mkdtempSync(join(tmpdir(), `rs-${name}-`));
  const git = (...args: string[]) => {
    const p = Bun.spawnSync(["git", "-C", repo, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", ...args]);
    if (p.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${p.stderr}`);
    return p.stdout.toString().trim();
  };
  git("init", "-q");
  const shas: string[] = [];
  for (const tree of trees) {
    for (const e of readdirSync(repo)) if (e !== ".git") rmSync(join(repo, e), { recursive: true });
    cpSync(join(FIXTURES, name, tree), repo, { recursive: true });
    git("add", "-A");
    git("commit", "-q", "--allow-empty", "-m", tree);
    shas.push(git("rev-parse", "HEAD"));
  }
  return { repo, range: `${shas[0]}..${shas[shas.length - 1]}` };
}
