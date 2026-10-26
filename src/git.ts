// All repo access goes through git at a fixed revision, never the working tree,
// so the brief depends only on the commit range.

export class Git {
  constructor(readonly repo: string) {}

  run(args: string[]): string {
    const proc = Bun.spawnSync(["git", "-C", this.repo, "-c", "core.quotepath=false", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (proc.exitCode !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${proc.stderr.toString().trim()}`);
    }
    return proc.stdout.toString();
  }

  tryRun(args: string[]): string | null {
    try {
      return this.run(args);
    } catch {
      return null;
    }
  }

  resolve(rev: string): string {
    return this.run(["rev-parse", "--verify", `${rev}^{commit}`]).trim();
  }

  show(rev: string, path: string): string | null {
    return this.tryRun(["show", `${rev}:${path}`]);
  }

  listFiles(rev: string): string[] {
    return this.run(["ls-tree", "-r", "--name-only", rev]).split("\n").filter(Boolean).sort();
  }
}
