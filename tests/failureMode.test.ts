import { expect, test } from "bun:test";
import { loadDiff } from "../src/diff";
import { failureModeFacts, failureModeSecondOpinion, failureModeSignal } from "../src/signals/failureMode";
import { RANGE, REPO } from "./fixture";

const facts = failureModeFacts(loadDiff(REPO, RANGE));

test("PR 13: rules on touched paths give domain and infra", () => {
  expect(facts.perFile.map((p) => [p.path, p.mode, p.at])).toEqual([
    ["apps/api/src/infrastructure/observability/metrics-catalog.ts", "infra", "apps/api/src/infrastructure/observability/metrics-catalog.ts:127"],
    ["apps/web/src/App.tsx", "domain", "apps/web/src/App.tsx:1"],
    ["apps/web/src/fireweave/fw-providers.ts", "infra", "apps/web/src/fireweave/fw-providers.ts:275"],
    ["apps/web/src/fireweave/fw-tracker.ts", "infra", "apps/web/src/fireweave/fw-tracker.ts:19"],
    ["apps/web/src/styles.css", "domain", "apps/web/src/styles.css:715"],
  ]);
  const s = failureModeSignal(facts);
  expect([s.value, s.source]).toEqual(["domain, infra", "measured"]);
  expect(s.note).toEndWith("Matched on file path; each evidence line is the file's first change");
});

test("PR 13 without a key: LLM second opinion marked unavailable", async () => {
  const { agrees, ...s } = await failureModeSecondOpinion("", null, facts, undefined, false);
  expect([s.value, s.source, s.note, agrees]).toEqual(["unavailable", "assumed", "no ANTHROPIC_API_KEY or AWS_BEARER_TOKEN_BEDROCK; rules only", null]);
});

test("LLM answer is compared with the rules, never replaces them", async () => {
  const fake = (modes: string[]) => (async () => ({ modes, reason: "r" })) as any;
  const agree = await failureModeSecondOpinion("", null, facts, fake(["infra", "domain"]), true);
  expect(agree.note).toStartWith("agrees with the rules (domain, infra)");
  expect(agree.agrees).toBe(true);
  const disagree = await failureModeSecondOpinion("", null, facts, fake(["domain", "security"]), true);
  expect([disagree.value, disagree.source]).toEqual(["domain, security", "assumed"]);
  expect(disagree.note).toStartWith("disagrees with the rules (domain, infra)");
  expect(disagree.agrees).toBe(false);
  const withheld = await failureModeSecondOpinion("", null, facts, fake(["infra"]), true, "gate 1 found a secret in the diff");
  expect(withheld.note).toBe("diff not sent to the LLM: gate 1 found a secret in the diff");
});
