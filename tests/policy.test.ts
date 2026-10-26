import { expect, test } from "bun:test";
import { applyPolicy, POLICY } from "../src/policy";
import { failureModeFacts, llmDisagreements } from "../src/signals/failureMode";
import { loadDiff } from "../src/diff";
import { buildBrief } from "../src/run";
import type { Signal } from "../src/types";
import { RANGE, REPO } from "./fixture";

test("policy.json quotes section 2 verbatim", async () => {
  const w = await Bun.file(new URL("../writeup.md", import.meta.url)).text();
  for (const rule of [POLICY.gates.rule, POLICY.damage.rule, POLICY.reversibility.rule, POLICY.probability.rule])
    expect(w).toContain(rule.replace(/^(Gates|Damage|Reversibility|Probability) \((1a|1b|1c|1d)\): /, ""));
  expect(w).toContain(POLICY.disagreement.rule);
});

test("PR 13: four assumed probability inputs lower an already-low confidence; the measured level stays separate", async () => {
  const b = await buildBrief({ repo: REPO, range: RANGE, ignoreDeclared: false, prFile: null });
  expect(b.confidence!.level).toBe("low");
  expect(b.confidence!.why.filter((w) => w.endsWith("(W 2)"))).toEqual([
    "Failure mode (LLM second opinion): unavailable (assumed), lowers confidence, does not raise risk (W 2)",
    "History: history unavailable (assumed), lowers confidence, does not raise risk (W 2)",
    "Confidence: review depth: unavailable (assumed), lowers confidence, does not raise risk (W 2)",
    "Confidence: diff vs task (LLM): unavailable (assumed), lowers confidence, does not raise risk (W 2)",
  ]);
  // Reach and detection were already at their rounded values.
  expect(b.signals.find((s) => s.name === "Reach")!.value).toBe("high");
  expect(b.signals.find((s) => s.name === "Detection apparatus")!.value).toBe("not alerted");
});

const sig = (name: string, value: string, source: Signal["source"]): Signal => ({ name, value, source, evidence: [], note: "n" });

test("assumed damage rounds up, assumed window rounds slow, measured values are untouched", () => {
  const r = applyPolicy(
    [sig("Reach", "low", "assumed"), sig("Feature flag", "full", "assumed"), sig("Path", "unreached", "measured")],
    "high",
    [],
  );
  expect(r.signals.map((s) => s.value)).toEqual(["high", "none", "unreached"]);
  expect(r.level).toBe("high");
});

test("assumed probability lowers confidence only; disagreements lower it too; measured level is kept", () => {
  const r = applyPolicy([sig("History", "history unavailable", "assumed")], "high", ["a vs b"]);
  expect([r.level, r.measuredLevel]).toEqual(["low", "high"]);
});

test("a code-vs-LLM failure-mode disagreement reaches the policy and lowers confidence", () => {
  const rules = failureModeFacts(loadDiff(REPO, RANGE));
  const d = llmDisagreements(false, rules, sig("Failure mode (LLM second opinion)", "security", "assumed"));
  expect(d).toEqual(["failure mode: rules say domain, infra, LLM second opinion says security"]);
  expect(llmDisagreements(true, rules, sig("x", "domain, infra", "assumed"))).toEqual([]);
  expect(applyPolicy([], "high", d).level).toBe("medium");
});

test("only Path and Reach round up; 'the data is touched' is recorded as not applied", () => {
  expect(POLICY.damage.assume).toEqual({ Path: "live", Reach: "high" });
  expect(Object.keys(POLICY.damage.notApplied)).toEqual(["the data is touched"]);
});

test("an available LLM answer is not missing data and does not lower confidence", () => {
  expect(applyPolicy([sig("Failure mode (LLM second opinion)", "domain, infra", "assumed")], "high", []).level).toBe("high");
  expect(applyPolicy([sig("Failure mode (LLM second opinion)", "unavailable", "assumed")], "high", []).level).toBe("medium");
});
