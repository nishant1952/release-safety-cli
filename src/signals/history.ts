// W 1d item 6, appendix Probability rank 6: "History: past issues: incidents, reverts and churn",
// extracted from "reverts and follow-up fixes in git history"; ignore "Generated files and
// lockfiles". W 2: "Missing history is reported as 'history unavailable', never 'zero incidents'."
import type { Diff } from "../diff";
import { Git } from "../git";
import type { Signal } from "../types";

const GENERATED = /(^|\/)(bun\.lockb?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$|\.min\.(js|css)$|(^|\/)(dist|build|generated)\//;
const REVERT = /^Revert\b/i;
const FIX = /^(Fix|Fixes|Fixed|Hotfix)\b/i;
export const THIN_COMMITS = 5;
export const THIN_DAYS = 7;

export interface HistoryFacts {
  shallow: boolean;
  /** non-merge commits before base touching the changed files */
  commits: { sha: string; time: number; subject: string; revert: boolean; fix: boolean }[];
  /** first commit time and base commit time (unix seconds) */
  span: { from: number; to: number } | null;
}

export function historyFacts(diff: Diff): HistoryFacts {
  const git = new Git(diff.repo);
  const shallow = git.run(["rev-parse", "--is-shallow-repository"]).trim() === "true";
  const paths = diff.files.map((f) => f.oldPath ?? f.path).filter((p) => !GENERATED.test(p));
  const log = paths.length
    ? git.run(["log", "--no-merges", "--format=%h%x09%ct%x09%s%x09%b%x1e", diff.base, "--", ...paths])
    : "";
  const commits = log
    .split("\x1e")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [sha, time, subject, ...rest] = r.split("\t");
      const body = rest.join("\t");
      return {
        sha,
        time: Number(time),
        subject,
        revert: REVERT.test(subject) || /This reverts commit/.test(body),
        fix: FIX.test(subject),
      };
    });
  const times = git.run(["log", "--format=%ct", diff.base]).split("\n").filter(Boolean).map(Number);
  const span = times.length ? { from: Math.min(...times), to: Math.max(...times) } : null;
  return { shallow, commits, span };
}

const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

export function historySignal(facts: HistoryFacts): Signal {
  const days = facts.span ? (facts.span.to - facts.span.from) / 86400 : 0;
  const spanText = facts.span
    ? `repo history before base spans ${days < 1 ? `${Math.round(days * 24)}h` : `${Math.round(days)} days`} (${day(facts.span.from)} to ${day(facts.span.to)})`
    : "no history before base";
  const n = facts.commits.length;
  const thin = facts.shallow || n < THIN_COMMITS || days < THIN_DAYS;
  const reverts = facts.commits.filter((c) => c.revert);
  const fixes = facts.commits.filter((c) => c.fix && !c.revert);
  const evidence = [...reverts, ...fixes].map((c) => `commit ${c.sha}`);
  if (thin)
    return {
      name: "History",
      value: "history unavailable",
      source: "assumed",
      evidence,
      note:
        `measured: ${n} earlier commits touch the changed files, ${reverts.length} reverts, ${fixes.length} fix commits; ` +
        `${facts.shallow ? "shallow clone; " : ""}${spanText}. Too thin to read as a record (thin: < ${THIN_COMMITS} commits or < ${THIN_DAYS} days)`,
    };
  return {
    name: "History",
    value: `${reverts.length} reverts, ${fixes.length} fix commits in ${n} commits`,
    source: "measured",
    evidence,
    note: `reverts and follow-up fixes touching the changed files; ${spanText}`,
  };
}
