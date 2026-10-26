import { expect, test } from "bun:test";
import { decide, type DecisionInput } from "../src/decide";
import { buildBrief } from "../src/run";
import type { Signal } from "../src/types";
import { RANGE, REPO } from "./fixture";

test("PR 13: gate 1 routes to Human; the grid alone is also Human (high damage, long window)", async () => {
  const b = await buildBrief({ repo: REPO, range: RANGE, ignoreDeclared: false, prFile: null });
  expect(b.mode).toBe("Human");
  expect(b.modeLine).toBe("Grid: high damage x long window = Human. Gates route to Human.");
  expect(b.reasons.map((r) => r.text.split(":")[0])).toEqual(["Gate 1 (Table stakes) is unverifiable, so it routes to a human", "High damage", "Long window", "Probability"]);
  expect(b.reasons[1].evidence).toEqual([
    "apps/web/src/App.tsx:554",
    "apps/web/src/App.tsx:596",
    "apps/web/src/App.tsx:593",
    "apps/api/src/interfaces/http/router.ts:80",
    "apps/api/src/interfaces/http/router.ts:197",
  ]);
});

const s = (name: string, value: string): Signal => ({ name, value, source: "measured", evidence: [], note: "n" });
const input = (o: Partial<Record<string, string>>, extra: Partial<DecisionInput> = {}): DecisionInput => ({
  gates: [],
  measuredConfidence: "high",
  coherent: null,
  signals: [
    s("Path", o.path ?? "live"),
    s("Reach", o.reach ?? "high"),
    s("Reversible or irreversible", o.rev ?? "reversible"),
    s("Feature flag", o.flag ?? "full"),
    s("Time to revert", o.revert ?? "full build and deploy"),
    s("Detection apparatus", o.detect ?? "fast"),
    s("Confidence: test coverage", "x"),
  ],
  ...extra,
});

test("grid: low/short Auto, low/long Staged, high/short Staged, high/long Human", () => {
  expect(decide(input({ reach: "low" })).mode).toBe("Auto");
  expect(decide(input({ reach: "low", detect: "slow" })).mode).toBe("Staged");
  expect(decide(input({})).mode).toBe("Staged");
  expect(decide(input({ detect: "slow" })).mode).toBe("Human");
});

test("window: irreversible is long; a partial flag needs a fast revert; a one-click rollback is fast undo", () => {
  expect(decide(input({ reach: "low", rev: "irreversible" })).window).toBe("long");
  expect(decide(input({ reach: "low", flag: "partial" })).window).toBe("long");
  expect(decide(input({ reach: "low", flag: "partial", revert: "one-click rollback" })).window).toBe("short");
});

test("probability moves one step toward caution only, and only from measured low confidence", () => {
  expect(decide(input({ reach: "low" }, { measuredConfidence: "low" })).mode).toBe("Staged");
  expect(decide(input({ reach: "low", detect: "slow" }, { measuredConfidence: "low" })).mode).toBe("Human");
  expect(decide(input({ detect: "slow" }, { measuredConfidence: "low" })).mode).toBe("Human");
  expect(decide(input({ reach: "low" }, { measuredConfidence: "medium" })).mode).toBe("Auto");
});

test("the LLM can add one step toward caution, never loosen", () => {
  expect(decide(input({ reach: "low" }, { coherent: false })).mode).toBe("Staged");
  expect(decide(input({ reach: "low" }, { coherent: true })).mode).toBe("Auto");
});

test("gates override: block beats everything, unverifiable routes to human", () => {
  const gate = (route: "block" | "human") => ({ gate: 1 as const, name: "Table stakes", status: "trip" as const, route, checks: [] });
  expect(decide(input({ reach: "low" }, { gates: [gate("block")] })).mode).toBe("Block");
  expect(decide(input({ reach: "low" }, { gates: [gate("human")] })).mode).toBe("Human");
});

test("the brief says when a flag is the cheapest way left (W 3)", () => {
  expect(decide(input({ reach: "low", flag: "none" })).flagAdvice).toBe("Adding a flag around the change would move the grid from Staged to Auto.");
  expect(decide(input({ reach: "low", flag: "none", detect: "slow" })).flagAdvice).toBeNull();
});
