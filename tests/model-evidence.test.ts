// Round 4, Unit 3: the brief shows the model's evidence where the reader looks.
import { expect, test } from "bun:test";
import { modelEvidence } from "../src/decide";
import { relabelFilled, type ContractAnswer } from "../src/model";
import { makeQuoter, renderBrief } from "../src/render";
import { buildBrief } from "../src/run";
import type { Signal } from "../src/types";
import { PR_JSON, RANGE, REPO } from "./fixture";

test("PR 13: top reason 1 opens with the model's cited line and sentence, then the measured lines it superseded", async () => {
  const answer: ContractAnswer = {
    proposals: [{ signal: "Reach", change: "propose", value: "low", cite: "apps/web/src/App.tsx:593", reasoning: "The menu mounts under one route." }],
    failure_modes: { modes: ["domain", "infra"], reason: "r" },
    coherence: { coherent: true, mismatches: [] },
  };
  const ask = (async (_s: string, _u: string, _x: unknown, purpose: string) => (purpose === "model contract" ? answer : null)) as any;
  const b = await buildBrief({ repo: REPO, range: RANGE, prFile: PR_JSON, ask });
  const md = renderBrief(b, makeQuoter(REPO, b.base, b.head));
  const reason1 = md.split("## Top reasons\n\n")[1].split("\n2. ")[0].split("\n");
  expect(reason1.slice(0, 4)).toEqual([
    "1. Low damage: the reach is low (model (cited)).",
    "   - `apps/web/src/App.tsx:593` `<Route` (the model's citation for Reach, which was high (assumed))",
    "     Model's reasoning: The menu mounts under one route.",
    "     - `apps/web/src/App.tsx:442` `void record(\"arcade_web_profile_menu_opens_total\", 1, {` (measured, superseded by the model's citation)",
  ]);
  // The provenance row keeps the old value.
  expect(md).toContain('| Reach | low | model (cited) | `apps/web/src/App.tsx:593`. model (cited): The menu mounts under one route. Was "high" (assumed)');
}, 60_000);

const filled = (name: string, value: string, was: string[]): Signal => ({
  name, value, source: "model (cited)", evidence: ["a.ts:1"], note: "n", model: { reasoning: "r", was: { value: "x", evidence: was } },
});

test("a claim that nothing is reached is contradicted by the lines that show something is; config lines are declared", () => {
  expect(modelEvidence([filled("Reach", "none", ["a.ts:5"])])![0].prior).toEqual([{ ref: "a.ts:5", label: "measured, contradicts the proposal" }]);
  expect(modelEvidence([filled("Path", "unreached", ["b.ts@1234567:3"])])![0].prior[0].label).toBe("measured, contradicts the proposal");
  expect(modelEvidence([filled("Time to revert", "one-click rollback", [".github/workflows/deploy.yml:15"])])![0].prior).toEqual([
    { ref: ".github/workflows/deploy.yml:15", label: "declared, superseded by the model's citation" },
  ]);
  expect(modelEvidence([{ ...filled("Reach", "low", []), source: "assumed", model: undefined }])).toBeUndefined();
});

test("confidence lines stop calling a filled signal assumed", () => {
  const ruling = { accepted: [{ signal: "Detection apparatus", from: "slow", to: "fast", cite: "a.ts:1", reasoning: "r" }], refused: [] };
  expect(relabelFilled(["Detection apparatus: slow (assumed), lowers confidence, does not raise risk (W 2)", "History: history unavailable (assumed), lowers confidence"], ruling)).toEqual([
    'Detection apparatus: filled by the model (cited a.ts:1) from "slow" to "fast"; confidence is computed before a fill, so it still counts as missing data here (W 2)',
    "History: history unavailable (assumed), lowers confidence",
  ]);
});
