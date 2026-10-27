import { expect, test } from "bun:test";
import { loadDiff } from "../src/diff";
import { failureModeFacts, failureModeSignal } from "../src/signals/failureMode";
import { RANGE, REPO } from "./fixture";

const facts = failureModeFacts(loadDiff(REPO, RANGE));

test("PR 13: rules on touched paths give domain and infra", () => {
  expect(facts.perFile.map((p) => [p.path, p.mode, p.at])).toEqual([
    ["apps/api/src/infrastructure/observability/metrics-catalog.ts", "infra", "apps/api/src/infrastructure/observability/metrics-catalog.ts:127"],
    ["apps/web/src/App.tsx", "domain", "apps/web/src/App.tsx:1"],
    ["apps/web/src/fireweave/fw-providers.ts", "domain", "apps/web/src/fireweave/fw-providers.ts:275"],
    ["apps/web/src/fireweave/fw-tracker.ts", "domain", "apps/web/src/fireweave/fw-tracker.ts:19"],
    ["apps/web/src/styles.css", "cosmetic", "apps/web/src/styles.css:715"],
  ]);
  const s = failureModeSignal(facts);
  expect([s.value, s.source]).toEqual(["domain, infra", "measured"]);
  expect(s.note).toEndWith("Matched on file path; each evidence line is the file's first change");
});
