import { expect, test } from "bun:test";
import type { DecisionInput } from "../src/decide";
import { buildBrief } from "../src/run";
import type { Signal } from "../src/types";
import { oneUnknown, unknownText } from "../src/unknown";
import { RANGE, REPO, PR_JSON } from "./fixture";

test("PR 13: no single assumed input changes Human; with all favourable it stays Human on measured facts", async () => {
  const b = await buildBrief({ repo: REPO, range: RANGE, prFile: PR_JSON });
  expect(b.unknown).toBe(
    "No single assumed input changes the mode. Considered: Reach (high); Time to revert (full build and deploy); " +
      "Failure mode (LLM second opinion) (cannot move the mode); History (cannot move the mode); " +
      "Confidence: diff vs task (LLM) (cannot move the mode). With all of them at their favourable value the mode is Human, so the call rests on what is known: " +
      "Detection apparatus slow (measured), without which it would be Staged; confidence low (measured), without which it would be Staged.",
  );
}, 30_000);

const s = (name: string, value: string, source: Signal["source"] = "measured"): Signal => ({ name, value, source, evidence: [], note: "" });
const input = (reachSource: Signal["source"], ci: "unverifiable" | "pass"): DecisionInput => ({
  gates: [
    {
      gate: 1,
      name: "Table stakes",
      status: ci,
      route: ci === "pass" ? "none" : "human",
      checks: [{ name: "required CI checks", status: ci, source: "assumed", evidence: [], note: "" }],
    },
  ],
  measuredConfidence: "high",
  coherent: null,
  signals: [
    s("Path", "live"),
    s("Reach", "high", reachSource),
    s("Reversible or irreversible", "reversible"),
    s("Feature flag", "full"),
    s("Time to revert", "full build and deploy", "assumed"),
    s("Detection apparatus", "fast"),
    s("Confidence: test coverage", "x"),
  ],
});

test("the first flip that changes the mode is reported, gates before signals", () => {
  // Staged by the grid (high damage, short window); the CI gate holds it at Human.
  expect(unknownText(oneUnknown(input("assumed", "unverifiable"), []))).toBe(
    "**gate 1 required CI checks**: assumed unverifiable. If it were pass, the mode would move from Human to Staged.",
  );
  // With CI green, assumed Reach is the one unknown: low reach makes it Auto.
  expect(unknownText(oneUnknown(input("assumed", "pass"), []))).toBe(
    "**Reach**: assumed high. If it were low, the mode would move from Staged to Auto.",
  );
});

test("holding names only known inputs that change the mode, not every unfavourable one", () => {
  // Only time to revert is assumed. Known: path live, reach high, flag partial, detection slow.
  const i = input("measured", "pass");
  i.signals = i.signals.map((x) =>
    x.name === "Feature flag" ? { ...x, value: "partial" } : x.name === "Detection apparatus" ? { ...x, value: "slow" } : x,
  );
  const u = oneUnknown(i, []);
  expect(u.first).toBeNull();
  // With time to revert flipped fast, the partial flag no longer matters, so it is not named.
  expect(u.holding).toEqual([
    { what: "Path live (measured)", mode: "Staged" },
    { what: "Reach high (measured)", mode: "Staged" },
    { what: "Detection apparatus slow (measured)", mode: "Staged" },
  ]);
});
