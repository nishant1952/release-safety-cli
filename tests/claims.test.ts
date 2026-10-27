// Round 4, Unit 4: a coherence item that says the change adds, removes or includes something is kept only if
// the diff supports it.
import { expect, test } from "bun:test";
import { loadDiff } from "../src/diff";
import { citationContext, modelContract, unsupportedClaim, type ContractAnswer, type Mismatch } from "../src/model";
import { buildBrief } from "../src/run";
import { failureModeFacts } from "../src/signals/failureMode";
import { pathFacts } from "../src/signals/path";
import { reachFacts } from "../src/signals/reach";
import { REPO } from "./fixture";

const PR1 = { repo: REPO, range: "7eed1d0f..528c3084", prFile: new URL("./fixtures/pr1.json", import.meta.url).pathname };
const item = (text: string, claim: Mismatch["claim"], subject = ""): Mismatch => ({ text, claim, subject });

test("PR 1 end to end: the credentials item is dropped as not supported; supported and other items stay", async () => {
  const answer: ContractAnswer = {
    proposals: [],
    failure_modes: { modes: ["domain", "infra"], reason: "r" },
    coherence: {
      coherent: false,
      mismatches: [
        item("The .env.example change includes real credentials, which is not mentioned.", "other"),
        item("The stream name changes to temp_battle_logs, which the description does not mention.", "adds", "temp_battle_logs"),
        item("The PR adds a rate limiter on the verify endpoint.", "adds", "rateLimit"),
        item("The README says traces are verified only by stream presence.", "other"),
      ],
    },
  };
  const ask = (async (_s: string, _u: string, _x: unknown, purpose: string) => (purpose === "model contract" ? answer : null)) as any;
  const b = await buildBrief({ ...PR1, ask });
  expect(b.disagreements!.filter((d) => d.startsWith("model claim"))).toEqual([
    'model claim not supported by the diff: "The .env.example change includes real credentials, which is not mentioned." (gate 1 found no secret on an added line; a value present at base was not added by this change)',
    'model claim not supported by the diff: "The PR adds a rate limiter on the verify endpoint." ("rateLimit" is on no added line or file)',
  ]);
  const coh = b.signals.find((s) => s.name === "Confidence: diff vs task (LLM)")!;
  expect([coh.value, coh.note]).toEqual([
    "mismatch",
    "The stream name changes to temp_battle_logs, which the description does not mention.; The README says traces are verified only by stream presence. (2 item(s) dropped as not supported by the diff, listed under Disagreements)",
  ]);
  // Dropped items do not lower confidence: no confidence line names them.
  expect(b.confidence!.why.some((w) => w.includes("not supported"))).toBe(false);
}, 60_000);

test("removes needs removed lines or a deleted file; only unsupported items are dropped, and none left means coherent", async () => {
  const diff = loadDiff(REPO, PR1.range);
  const ctx = citationContext(diff, pathFacts(diff), reachFacts(diff));
  expect(unsupportedClaim(item("Removes metrics.ts", "removes", "server/src/metrics.ts"), ctx)).toBeNull();
  expect(unsupportedClaim(item("Removes the games table", "removes", "DROP TABLE games"), ctx)).toBe('"DROP TABLE games" is on no removed line or file');
  expect(unsupportedClaim(item("Adds a password reset flow", "adds", "resetPassword"), ctx)).toBe('"resetPassword" is on no added line or file');
  expect(unsupportedClaim(item("Adds something", "adds"), ctx)).toBe("the item says the change adds something but names no text from the diff");
  expect(unsupportedClaim(item("Commits a hardcoded API key", "other"), { ...ctx, secretAdded: true })).toBeNull();
});

test("every item dropped: the read is coherent, so the mismatch neither lowers confidence nor tightens the mode", async () => {
  const diff = loadDiff(REPO, PR1.range);
  const ctx = citationContext(diff, pathFacts(diff), reachFacts(diff));
  const answer: ContractAnswer = {
    proposals: [],
    failure_modes: { modes: ["domain", "infra"], reason: "r" },
    coherence: { coherent: false, mismatches: [item("Includes real credentials in the env example.", "includes credentials")] },
  };
  const c = await modelContract("", [], null, "", failureModeFacts(diff), () => null, ctx, "7eed1d0", (async () => answer) as any, true);
  expect([c.coherence.value, c.coherence.coherent, c.unsupported.length]).toEqual(["coherent", true, 1]);
});
