// W 1d item 2, appendix Probability rank 2: "Confidence (primary): review depth, the author's and
// reviewer's familiarity with the touched files, test coverage of the diff, and coherence between
// the task, the PR description and the code"; ignore "Single-author repos (drop the people part)".
// W 1d "Agent-written changes: author familiarity means nothing here ... Confidence then leans on
// reviewer familiarity, tests that existed before the change, and whether the diff matches the task."
// W 1d item 5 / appendix rank 5: "Provenance ... Commit and PR metadata".
import { posix } from "node:path";
import type { Diff } from "../diff";
import { Git } from "../git";
import { askJson, llmAvailable, NO_CREDENTIAL } from "../llm";
import type { PrMeta } from "../pr";
import type { Signal } from "../types";

const CODE = /\.(ts|tsx|js|jsx|mjs)$/;
export const TEST_FILE = /\.(test|spec)\.[jt]sx?$|(^|\/)(tests?|__tests__)\/.+\.[jt]sx?$/;
const AGENT_TRAILER = /^Co-authored-by:\s*(.+?)\s*<([^>]+)>/gim;
const AGENT_NAME = /cursor|copilot|claude|codex|devin|aider|agent|bot\b|\[bot\]/i;

export type Level = "high" | "medium" | "low";

export interface ConfidenceFacts {
  codeFiles: string[];
  /** changed code file -> test files at head that import it, and whether each existed at base */
  coverage: { file: string; tests: { path: string; preExisting: boolean }[] }[];
  /** distinct non-merge commit authors in the repo before base */
  repoAuthors: string[];
  /** changed file -> earlier authors of that file */
  fileAuthors: { file: string; authors: string[] }[];
  changeAuthors: string[];
  agent: { measured: string[]; declared: string | null; commit: string };
  /** reviews in the PR export; null when no export was found or it has no reviews field */
  reviews: number | null;
}

export function importsFile(testPath: string, text: string, file: string): boolean {
  const target = file.replace(/\.[^.]+$/, "");
  for (const m of text.matchAll(/(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g)) {
    if (!m[1].startsWith(".")) continue;
    const resolved = posix.normalize(posix.join(posix.dirname(testPath), m[1])).replace(/\.[jt]sx?$/, "");
    if (resolved === target || resolved === posix.join(target, "index")) return true;
  }
  return false;
}

export function confidenceFacts(diff: Diff, pr: PrMeta | null): ConfidenceFacts {
  const git = new Git(diff.repo);
  const codeFiles = diff.files.filter((f) => CODE.test(f.path) && f.status !== "deleted").map((f) => f.path);
  const headTests = git.listFiles(diff.head).filter((p) => TEST_FILE.test(p));
  const baseTests = new Set(git.listFiles(diff.base).filter((p) => TEST_FILE.test(p)));
  const coverage = codeFiles.map((file) => ({
    file,
    tests: headTests
      .filter((t) => importsFile(t, git.show(diff.head, t) ?? "", file))
      .map((t) => ({ path: t, preExisting: baseTests.has(t) })),
  }));
  const authorsOf = (args: string[]) =>
    [...new Set(git.run(["log", "--no-merges", "--format=%an <%ae>", ...args]).split("\n").filter(Boolean))].sort();
  const repoAuthors = authorsOf([diff.base]);
  const fileAuthors = diff.files.map((f) => ({ file: f.path, authors: authorsOf([diff.base, "--", f.oldPath ?? f.path]) }));
  const changeAuthors = authorsOf([`${diff.base}..${diff.head}`]);
  const messages = git.run(["log", "--no-merges", "--format=%B%x1e", `${diff.base}..${diff.head}`]);
  const measured = [...new Set([...messages.matchAll(AGENT_TRAILER)].filter((m) => AGENT_NAME.test(m[0])).map((m) => `${m[1]} <${m[2]}>`))].sort();
  const declared = pr ? (pr.body.match(/Made with \[?([\w .-]+?)\]?(\(|$|\s)/m)?.[1] ?? (pr.author.is_bot ? pr.author.login : null)) : null;
  const lastCommit = git.run(["log", "-1", "--format=%h", diff.head]).trim();
  return { codeFiles, coverage, repoAuthors, fileAuthors, changeAuthors, agent: { measured, declared, commit: lastCommit }, reviews: pr?.reviews ?? null };
}

const reviewText = (f: ConfidenceFacts, prFound: boolean) =>
  !prFound ? "no PR export was found for this range" : f.reviews === null ? "the PR export has no reviews field" : `the PR export lists ${f.reviews} reviews`;

const lower = (l: Level): Level => (l === "high" ? "medium" : "low");

export interface ConfidenceResult {
  signals: Signal[];
  /** level from measured facts only; the missing-data policy lowers it further for assumed inputs */
  measuredLevel: Level;
  why: string[];
  disagreements: string[];
  agentWritten: boolean;
}

/** prFound: whether a PR export was found for the range. */
export function confidenceSignals(f: ConfidenceFacts, prFound: boolean): ConfidenceResult {
  const signals: Signal[] = [];
  const why: string[] = [];
  const disagreements: string[] = [];

  // Provenance: commit trailers are measured (git); the PR body is declared.
  const agentWritten = f.agent.measured.length > 0 || f.agent.declared !== null;
  const agents = [...new Set([...f.agent.measured.map((a) => a.split(" <")[0]), ...(f.agent.declared ? [f.agent.declared] : [])])];
  signals.push({
    name: "Provenance",
    value: agentWritten ? `agent-assisted (${agents.join(", ")})` : "no agent named",
    // An agent named only in the PR description is declared; trailers, or their absence, are read from git.
    source: !f.agent.measured.length && f.agent.declared ? "declared" : "measured",
    evidence: f.agent.measured.length ? [`commit ${f.agent.commit}`] : [],
    note:
      `commit trailers: ${f.agent.measured.join(", ") || "none"}; PR description: ${prFound ? (f.agent.declared ? `"Made with ${f.agent.declared}"` : "no agent named") : "no PR export found"}; ` +
      `author(s) in git: ${f.changeAuthors.join(", ")}. Whether a human was in the loop is not verifiable from the input`,
  });
  if (prFound && f.agent.measured.length && !f.agent.declared)
    disagreements.push("provenance: commit trailers name an agent but the PR description does not");
  if (f.agent.declared && !f.agent.measured.length)
    disagreements.push(`provenance: PR description says "Made with ${f.agent.declared}" but no commit trailer names an agent`);

  // Test coverage of the diff, and whether those tests existed before the change.
  const covered = f.coverage.filter((c) => c.tests.length);
  const preExisting = f.coverage.filter((c) => c.tests.some((t) => t.preExisting));
  const coverageValue = !f.codeFiles.length
    ? "no code files changed"
    : `${covered.length} of ${f.codeFiles.length} changed code files have a test`;
  signals.push({
    name: "Confidence: test coverage",
    value: coverageValue,
    source: "measured",
    evidence: covered.flatMap((c) => c.tests.map((t) => `${t.path}:1`)),
    note: `tests that import a changed file; ${preExisting.length} covered by tests that existed before the change. Uncovered: ${f.coverage.filter((c) => !c.tests.length).map((c) => c.file).join(", ") || "none"}`,
  });

  // Familiarity: dropped for single-author repos; author familiarity means nothing for agent-written changes.
  const singleAuthor = f.repoAuthors.length <= 1;
  const newToFiles = f.fileAuthors.filter((fa) => fa.authors.length && !f.changeAuthors.some((a) => fa.authors.includes(a)));
  signals.push({
    name: "Confidence: familiarity",
    value: singleAuthor ? "single-author repo, people part dropped" : agentWritten ? "agent-written, author familiarity ignored" : newToFiles.length ? `author new to ${newToFiles.length} touched files` : "author has touched every file before",
    source: "measured",
    evidence: [],
    note: `repo authors before base: ${f.repoAuthors.join(", ") || "none"}; per file: ${f.fileAuthors.map((fa) => `${fa.file} (${fa.authors.length})`).join(", ")}. Reviewer familiarity needs review data: ${reviewText(f, prFound)}`,
  });

  signals.push({
    name: "Confidence: review depth",
    value: f.reviews === null ? "unavailable" : `${f.reviews} reviews`,
    source: f.reviews === null ? "assumed" : "declared",
    evidence: [],
    note: reviewText(f, prFound),
  });

  // Measured level. For agent-written changes only tests that existed before the change count:
  // W 1d "The agent ... may have written its own tests ... Confidence then leans on ... tests that existed before the change".
  const counted = agentWritten ? preExisting : covered;
  const kind = agentWritten ? "test that existed before the change" : "test";
  let level: Level = "high";
  if (f.codeFiles.length && counted.length === 0) {
    level = "low";
    why.push(`no ${kind} covers any of the ${f.codeFiles.length} changed code files (measured)`);
  } else if (counted.length < f.codeFiles.length) {
    level = lower(level);
    why.push(`${f.codeFiles.length - counted.length} of ${f.codeFiles.length} changed code files have no ${kind} (measured)`);
  }
  if (agentWritten && covered.length > preExisting.length)
    why.push(`${covered.length - preExisting.length} changed files are covered only by tests added in this change, which do not count for an agent-assisted change (W 1d)`);
  if (!singleAuthor && !agentWritten && newToFiles.length) {
    level = lower(level);
    why.push(`author has no earlier commits on ${newToFiles.map((n) => n.file).join(", ")} (measured)`);
  }
  if (singleAuthor) why.push("single-author repo: familiarity dropped (W appendix)");
  return { signals, measuredLevel: level, why, disagreements, agentWritten };
}

const COHERENCE_SCHEMA = {
  type: "object",
  properties: { coherent: { type: "boolean" }, mismatches: { type: "array", items: { type: "string" } } },
  required: ["coherent", "mismatches"],
  additionalProperties: false,
};

/** LLM check of the diff against the task and PR description. Can only lower confidence. */
export async function coherenceCheck(
  diffText: string,
  pr: PrMeta | null,
  commitMessage: string,
  ask: typeof askJson = askJson,
  available = llmAvailable(),
  withheld: string | null = null,
): Promise<Signal & { coherent: boolean | null }> {
  const name = "Confidence: diff vs task (LLM)";
  const unavailable = (note: string) => ({ name, value: "unavailable", source: "assumed" as const, evidence: [], note, coherent: null });
  if (!available) return unavailable(NO_CREDENTIAL);
  if (withheld) return unavailable(`diff not sent to the LLM: ${withheld}`);
  const answer = await ask<{ coherent: boolean; mismatches: string[] }>(
    "You check whether a code change does what its task and description say: nothing missing, nothing extra. " +
      "List each concrete mismatch between the description and the diff.",
    `Commit message:\n${commitMessage}\n\nPR title: ${pr?.title ?? "(none)"}\n\nPR description:\n${pr?.body ?? "(none)"}\n\nDiff:\n${diffText}`,
    COHERENCE_SCHEMA,
  );
  if (!answer) return unavailable("LLM call failed or was refused");
  return {
    name,
    value: answer.coherent ? "coherent" : "mismatch",
    source: "assumed",
    evidence: [],
    note: answer.mismatches.length ? answer.mismatches.join("; ") : "no mismatch named",
    coherent: answer.coherent,
  };
}
