// Round 4, Unit 2: a citation must belong to the signal it supports, and may not overturn the measured
// conclusion it is already evidence for.
import { expect, test } from "bun:test";
import { loadDiff } from "../src/diff";
import { citationContext, judge, type ContractAnswer } from "../src/model";
import { makeQuoter } from "../src/render";
import { buildBrief } from "../src/run";
import { pathFacts } from "../src/signals/path";
import { reachFacts } from "../src/signals/reach";
import type { Signal } from "../src/types";
import { PR_JSON, RANGE, REPO } from "./fixture";

const p = (signal: string, value: string, cite: string) => ({ signal, change: "propose" as const, value, cite, reasoning: "One sentence." });

test("PR 13 end to end: the flag line cannot carry reach or undo; a route line on the measured path can", async () => {
  const answer: ContractAnswer = {
    proposals: [
      p("Reach", "low", "apps/web/src/App.tsx:533"), // (a) the flag read, evidence for "flag partial"
      p("Time to revert", "one-click rollback", "apps/web/src/App.tsx:533"), // (b) the same line
      p("Reach", "low", "apps/web/src/App.tsx:593"), // (c) the <Route> that mounts the changed component: a code line on the measured path
    ],
    failure_modes: { modes: ["domain", "infra"], reason: "r" },
    coherence: { coherent: true, mismatches: [] },
  };
  const ask = (async (_s: string, _u: string, _schema: unknown, purpose: string) => (purpose === "model contract" ? answer : { prose: "One. Two." })) as any;
  const b = await buildBrief({ repo: REPO, range: RANGE, prFile: PR_JSON, ask });
  const sig = (n: string) => b.signals.find((s) => s.name === n)!;
  const refused = b.disagreements!.filter((d) => d.startsWith("model proposed"));
  expect(refused).toEqual([
    'model proposed Reach = "low" (cites apps/web/src/App.tsx:533); refused by the measured evidence rule: apps/web/src/App.tsx:533 is evidence for Feature flag = partial (measured), and the flag does not cover the whole change, so its lines cannot show the change reaches fewer systems, is unreached, or is undone in one click',
    'model proposed Time to revert = "one-click rollback" (cites apps/web/src/App.tsx:533); refused by the measured evidence rule: apps/web/src/App.tsx:533 is evidence for Feature flag = partial (measured), and the flag does not cover the whole change, so its lines cannot show the change reaches fewer systems, is unreached, or is undone in one click; and by the citation domain rule: Time to revert needs a line in a workflow, deploy script, compose file or rollback config; apps/web/src/App.tsx:533 is not one',
  ]);
  expect([sig("Reach").value, sig("Reach").source, sig("Reach").evidence]).toEqual(["low", "model (cited)", ["apps/web/src/App.tsx:593"]]);
  expect([sig("Time to revert").value, sig("Time to revert").source]).toEqual(["full build and deploy", "assumed"]);
  const undo = b.plan!.find((r) => r.row === "Undo")!.value;
  expect(undo).toContain("revert and redeploy (time to revert: full build and deploy, assumed) for the edits outside it");
  expect(undo).not.toContain("one-click");
  // Refusals are listed but do not lower confidence.
  expect(b.confidence!.why.some((w) => w.includes("model proposed"))).toBe(false);
  expect(b.mode).toBe("Human");
}, 60_000);

test("citation domains: a stylesheet line cannot carry reach; a workflow line can carry time to revert", () => {
  const diff = loadDiff(REPO, RANGE);
  const ctx = citationContext(diff, pathFacts(diff), reachFacts(diff));
  const quote = makeQuoter(REPO, diff.base, diff.head);
  const sig = (name: string, value: string): Signal => ({ name, value, source: "assumed", evidence: [], note: "n" });
  const r = judge(
    [
      p("Reach", "low", "apps/web/src/styles.css:715"),
      p("Time to revert", "one-click rollback", ".github/workflows/deploy.yml:15"),
      p("Detection apparatus", "fast", "apps/web/src/App.tsx:456"),
    ],
    [sig("Reach", "high"), sig("Time to revert", "full build and deploy"), sig("Detection apparatus", "slow")],
    quote,
    ctx,
  );
  expect(r.refused.map((x) => x.split("refused by ")[1])).toEqual([
    "the citation domain rule: Reach needs a code line on the measured path, or a route or handler definition; apps/web/src/styles.css:715 is not one (stylesheet)",
    "the citation domain rule: no citation domain is defined for Detection apparatus",
  ]);
  expect(r.accepted.map((a) => a.signal)).toEqual(["Time to revert"]);
  // Source code named deploy* is not a release file.
  const deployStore = judge([p("Time to revert", "one-click rollback", "apps/web/src/App.tsx:533")], [sig("Time to revert", "full build and deploy")], () => "x", ctx);
  expect(deployStore.refused.length).toBe(1);
});

test("a move toward caution is never refused for contradicting a measured conclusion", () => {
  const diff = loadDiff(REPO, RANGE);
  const ctx = citationContext(diff, pathFacts(diff), reachFacts(diff));
  const flag: Signal = { name: "Feature flag", value: "partial", source: "measured", evidence: ["apps/web/src/App.tsx:533"], note: "n" };
  const reach: Signal = { name: "Reach", value: "low", source: "assumed", evidence: [], note: "n" };
  const r = judge([p("Reach", "high", "apps/web/src/App.tsx:533")], [flag, reach], makeQuoter(REPO, diff.base, diff.head), ctx);
  expect([r.accepted.length, r.refused]).toEqual([1, []]);
});
