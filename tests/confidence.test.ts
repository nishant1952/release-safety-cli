import { expect, test } from "bun:test";
import { loadDiff } from "../src/diff";
import { loadPr } from "../src/pr";
import { confidenceFacts, confidenceSignals } from "../src/signals/confidence";
import { PR_JSON, RANGE, REPO } from "./fixture";

const diff = loadDiff(REPO, RANGE);

test("PR 13: agent provenance measured from the commit trailer and declared in the PR body, agreeing", async () => {
  const facts = confidenceFacts(diff, await loadPr(PR_JSON));
  expect(facts.agent).toEqual({ measured: ["Cursor <cursoragent@cursor.com>"], declared: "Cursor", commit: "c5da112" });
  const r = confidenceSignals(facts, true);
  const prov = r.signals.find((s) => s.name === "Provenance")!;
  expect([prov.value, prov.source, prov.evidence]).toEqual(["agent-assisted (Cursor)", "measured", ["commit c5da112"]]);
  expect(r.disagreements).toEqual([]);
});

test("PR 13: no tests anywhere, single-author repo, no review data: measured confidence is low", async () => {
  const facts = confidenceFacts(diff, await loadPr(PR_JSON));
  expect(facts.coverage.every((c) => c.tests.length === 0)).toBe(true);
  expect(facts.repoAuthors).toEqual(["Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>"]);
  const r = confidenceSignals(facts, true);
  expect(r.signals.map((s) => [s.name, s.value, s.source])).toEqual([
    ["Provenance", "agent-assisted (Cursor)", "measured"],
    ["Confidence: test coverage", "0 of 4 changed code files have a test", "measured"],
    ["Confidence: familiarity", "single-author repo, people part dropped", "measured"],
    ["Confidence: review depth", "0 reviews", "declared"],
  ]);
  expect(r.measuredLevel).toBe("low");
  expect(r.why).toEqual([
    "no test that existed before the change covers any of the 4 changed code files (measured)",
    "single-author repo: familiarity dropped (W appendix)",
  ]);
  expect(r.signals[0].note).toContain("Whether a human was in the loop is not verifiable from the input");
});

test("PR 13 without a PR export: provenance still measured from git", () => {
  const r = confidenceSignals(confidenceFacts(diff, null), false);
  const prov = r.signals.find((s) => s.name === "Provenance")!;
  expect([prov.value, prov.source]).toEqual(["agent-assisted (Cursor)", "measured"]);
  expect(prov.note).toContain("PR description: no PR export found");
});


test("agent-written: tests added in the same change do not count; pre-existing tests do", async () => {
  const facts = confidenceFacts(diff, await loadPr(PR_JSON));
  const withTests = (preExisting: boolean) => ({
    ...facts,
    coverage: facts.coverage.map((c) => ({ ...c, tests: [{ path: "apps/web/src/x.test.ts", preExisting }] })),
  });
  const added = confidenceSignals(withTests(false), true);
  expect(added.measuredLevel).toBe("low");
  expect(added.why).toContain("4 changed files are covered only by tests added in this change, which do not count for an agent-assisted change (W 1d)");
  expect(confidenceSignals(withTests(true), true).measuredLevel).toBe("high");
  // A human-written change counts its own new tests.
  const human = { ...withTests(false), agent: { measured: [], declared: null, commit: "c5da112" } };
  expect(confidenceSignals(human, true).measuredLevel).toBe("high");
});

test("review depth says what the PR export holds: PR 13 lists 0 reviews", async () => {
  const pr = await loadPr(PR_JSON);
  expect(pr!.reviews).toBe(0);
  const r = confidenceSignals(confidenceFacts(diff, pr), true);
  const depth = r.signals.find((s) => s.name === "Confidence: review depth")!;
  expect([depth.value, depth.source, depth.note]).toEqual(["0 reviews", "declared", "the PR export lists 0 reviews"]);
  const noField = confidenceSignals({ ...confidenceFacts(diff, pr), reviews: null }, true).signals.find((s) => s.name === "Confidence: review depth")!;
  expect([noField.value, noField.source, noField.note]).toEqual(["unavailable", "assumed", "the PR export has no reviews field"]);
  const withReviews = confidenceSignals({ ...confidenceFacts(diff, pr), reviews: 2 }, true).signals.find((s) => s.name === "Confidence: review depth")!;
  expect([withReviews.value, withReviews.source]).toEqual(["2 reviews", "declared"]);
});
