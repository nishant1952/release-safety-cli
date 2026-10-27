import { Git } from "./git";

export type Side = "head" | "base";

export interface Line {
  file: string;
  line: number;
  text: string;
  side: Side;
}

export interface ChangedFile {
  path: string;
  oldPath: string | null;
  status: "added" | "modified" | "deleted" | "renamed";
  binary: boolean;
  added: Line[];
  removed: Line[];
}

export interface Diff {
  repo: string;
  base: string;
  head: string;
  files: ChangedFile[];
  added: Line[];
  removed: Line[];
  /** directory -> changed file paths in it */
  buckets: Record<string, string[]>;
}

/** Evidence reference. Head-side lines are `path:line`; base-side lines carry the base sha. */
export function ref(l: Pick<Line, "file" | "line" | "side">, base?: string): string {
  return l.side === "head" ? `${l.file}:${l.line}` : `${l.file}@${(base ?? "base").slice(0, 7)}:${l.line}`;
}

export function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "." : path.slice(0, i);
}

export function parseUnifiedDiff(text: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  let cur: ChangedFile | null = null;
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  for (const raw of text.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      const m = raw.match(/^diff --git a\/(.+) b\/(.+)$/);
      if (!m) throw new Error(`unparsed diff header: ${raw}`);
      cur = { path: m[2], oldPath: m[1], status: "modified", binary: false, added: [], removed: [] };
      files.push(cur);
      inHunk = false;
      continue;
    }
    if (!cur) continue;
    if (raw.startsWith("@@")) {
      const m = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (!m) throw new Error(`unparsed hunk header: ${raw}`);
      oldLine = Number(m[1]);
      newLine = Number(m[2]);
      inHunk = true;
    } else if (!inHunk) {
      if (raw.startsWith("new file mode")) cur.status = "added";
      else if (raw.startsWith("deleted file mode")) cur.status = "deleted";
      else if (raw.startsWith("rename to ")) cur.status = "renamed";
      else if (raw.startsWith("Binary files ")) cur.binary = true;
    } else if (raw.startsWith("+")) cur.added.push({ file: cur.path, line: newLine++, text: raw.slice(1), side: "head" });
    else if (raw.startsWith("-")) cur.removed.push({ file: cur.oldPath!, line: oldLine++, text: raw.slice(1), side: "base" });
    else if (raw.startsWith(" ")) {
      oldLine++;
      newLine++;
    }
  }
  for (const f of files) if (f.status === "added") f.oldPath = null;
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function loadDiff(repo: string, range: string): Diff {
  const m = range.match(/^(.+?)\.\.(.+)$/);
  if (!m) throw new Error(`range must be <base>..<head>, got ${range}`);
  const git = new Git(repo);
  const base = git.resolve(m[1]);
  const head = git.resolve(m[2]);
  const text = git.run(["diff", "--no-color", "--no-ext-diff", "--find-renames", "--unified=0", base, head]);
  const files = parseUnifiedDiff(text);
  const buckets: Record<string, string[]> = {};
  for (const f of files) (buckets[dirOf(f.path)] ??= []).push(f.path);
  const sortedBuckets = Object.fromEntries(Object.keys(buckets).sort().map((k) => [k, buckets[k]]));
  return {
    repo,
    base,
    head,
    files,
    added: files.flatMap((f) => f.added),
    removed: files.flatMap((f) => f.removed),
    buckets: sortedBuckets,
  };
}

/** Context lines of a diff with context (unchanged at base and head), cited by their head line. */
export function contextLines(text: string): Line[] {
  const out: Line[] = [];
  let file = "";
  let newLine = 0;
  let inHunk = false;
  for (const raw of text.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      file = raw.match(/^diff --git a\/.+ b\/(.+)$/)?.[1] ?? "";
      inHunk = false;
    } else if (raw.startsWith("@@")) {
      newLine = Number(raw.match(/\+(\d+)/)![1]);
      inHunk = true;
    } else if (!inHunk) continue;
    else if (raw.startsWith("+")) newLine++;
    else if (raw.startsWith(" ")) out.push({ file, line: newLine++, text: raw.slice(1), side: "head" });
  }
  return out;
}

/** The range's diff with normal context, for the optional LLM reads. */
export function diffText(diff: Diff): string {
  return new Git(diff.repo).run(["diff", "--no-color", "--no-ext-diff", "--find-renames", diff.base, diff.head]);
}
