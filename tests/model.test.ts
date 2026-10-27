import { expect, test } from "bun:test";
import { loadDiff } from "../src/diff";
import { applyRuling, contractPrompt, judge, modelContract, type ContractAnswer } from "../src/model";
import { makeQuoter } from "../src/render";
import { failureModeFacts } from "../src/signals/failureMode";
import type { Signal } from "../src/types";
import { RANGE, REPO } from "./fixture";

const diff = loadDiff(REPO, RANGE);
const quote = makeQuoter(REPO, diff.base, diff.head);
const rules = failureModeFacts(diff);
const sig = (name: string, value: string, source: Signal["source"]): Signal => ({ name, value, source, evidence: [], note: "n" });
const signals = [
  sig("Reach", "high", "assumed"),
  sig("Time to revert", "full build and deploy", "assumed"),
  sig("Detection apparatus", "slow", "measured"),
  sig("Path", "live", "declared"),
  sig("History", "history unavailable", "assumed"),
];
const answer = (proposals: ContractAnswer["proposals"]): ContractAnswer => ({
  proposals,
  failure_modes: { modes: ["domain", "infra"], reason: "r" },
  coherence: { coherent: true, mismatches: [] },
});
const p = (signal: string, value: string, cite: string) => ({ signal, change: "propose" as const, value, cite, reasoning: "One sentence." });
const canned = (a: ContractAnswer) => (async () => a) as any;

test("canned model answer: a two-step change and a change on a measured signal are both refused", async () => {
  const c = await modelContract("diff", signals, null, "", rules, quote, "30ac194", canned(answer([
    p("Reach", "none", "apps/web/src/App.tsx:442"), // high -> none is two steps on high < low < none
    p("Detection apparatus", "fast", "apps/web/src/App.tsx:442"), // measured: never the model's to change
  ])), true);
  expect(c.ruling.accepted).toEqual([]);
  expect(c.ruling.refused).toEqual([
    'model proposed Reach = "none" (cites apps/web/src/App.tsx:442); refused: 2 steps from "high"; at most one is allowed',
    'model proposed Detection apparatus = "fast" (cites apps/web/src/App.tsx:442); refused: Detection apparatus is measured; the model may only fill assumed signals',
  ]);
  expect(applyRuling(signals, c.ruling)).toEqual(signals);
});

test("a one-step change on an assumed signal citing a real line is accepted and tagged model (cited)", () => {
  const r = judge([p("Reach", "low", "apps/web/src/App.tsx:442")], signals, quote);
  expect(r).toEqual({ accepted: [{ signal: "Reach", from: "high", to: "low", cite: "apps/web/src/App.tsx:442", reasoning: "One sentence." }], refused: [] });
  const reach = applyRuling(signals, r).find((s) => s.name === "Reach")!;
  expect([reach.value, reach.source, reach.evidence]).toEqual(["low", "model (cited)", ["apps/web/src/App.tsx:442"]]);
});

test("refusals: a missing line, a value off the scale, a declared signal, an assumed signal with no scale", () => {
  const r = judge(
    [
      p("Reach", "low", "apps/web/src/App.tsx:99999"),
      p("Reach", "low", "apps/web/src/App.tsx@1234567:442"), // a base-side cite must use this diff's base
      p("Time to revert", "instant", "apps/web/src/App.tsx:442"),
      p("Path", "unreached", "apps/web/src/App.tsx:442"),
      p("History", "no incidents", "apps/web/src/App.tsx:442"),
      { signal: "Reach", change: "no change", value: "high", cite: "", reasoning: "" },
    ],
    signals,
    quote,
    "30ac194",
  );
  expect(r.accepted).toEqual([]);
  expect(r.refused.map((x) => x.split("refused: ")[1])).toEqual([
    "the cited line apps/web/src/App.tsx:99999 is blank or does not exist in the diff or at the head revision",
    "the cited line apps/web/src/App.tsx@1234567:442 is blank or does not exist in the diff or at the head revision",
    '"instant" is not on the scale full build and deploy < one-click rollback',
    "Path is declared; the model may only fill assumed signals",
    "History has no scale the model may move on",
  ]);
});

test("the prompt lists assumed signals with a scale only: never measured or declared signals, gates or the mode", () => {
  const prompt = contractPrompt("", signals, null, "", "30ac194");
  expect(prompt).toContain('- Reach: assumed "high"');
  expect(prompt).toContain('- Time to revert: assumed "full build and deploy"');
  for (const hidden of ["Detection apparatus", "Path:", "History", "Gate", "Mode"]) expect(prompt).not.toContain(hidden);
});

test("no API key: no call, every assumed signal stays assumed, both reads unavailable", async () => {
  let called = false;
  const c = await modelContract("diff", signals, null, "", rules, quote, "30ac194", (async () => ((called = true), null)) as any, false);
  expect(called).toBe(false);
  expect(c.ruling).toEqual({ accepted: [], refused: [] });
  expect([c.failureMode.value, c.failureMode.note, c.coherence.value]).toEqual(["unavailable", "no ANTHROPIC_API_KEY; rules only", "unavailable"]);
  const withheld = await modelContract("diff", signals, null, "", rules, quote, "30ac194", canned(answer([])), true, "gate 1 found a secret in the diff");
  expect(withheld.coherence.note).toBe("diff not sent to the LLM: gate 1 found a secret in the diff");
});

test("the failure-mode and coherence questions ride in the same call and are compared with the rules", async () => {
  const c = await modelContract("diff", signals, null, "", rules, quote, "30ac194", canned({ ...answer([]), failure_modes: { modes: ["domain", "security"], reason: "r" }, coherence: { coherent: false, mismatches: ["x"] } }), true);
  expect([c.failureMode.value, c.failureMode.agrees, c.failureMode.note]).toEqual(["domain, security", false, "disagrees with the rules (domain, infra). r"]);
  expect([c.coherence.value, c.coherence.coherent, c.coherence.note]).toEqual(["mismatch", false, "x"]);
});
