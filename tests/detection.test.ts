import { expect, test } from "bun:test";
import { loadDiff } from "../src/diff";
import { detectionDisagreements, detectionFacts, detectionSignal } from "../src/signals/detection";
import { failureModeFacts } from "../src/signals/failureMode";
import { RANGE, REPO } from "./fixture";

const diff = loadDiff(REPO, RANGE);
const failure = failureModeFacts(diff);
const facts = detectionFacts(diff, failure);

test("PR 13: five metric calls through the `metric as record` import, classed by name and value", () => {
  expect(facts.emits.map((e) => [e.at, e.name, e.kind])).toEqual([
    ["apps/web/src/App.tsx:442", "arcade_web_profile_menu_opens_total", "count"],
    ["apps/web/src/App.tsx:451", "arcade_web_profile_menu_load_success_total", "count"],
    ["apps/web/src/App.tsx:456", "arcade_web_profile_menu_load_ms", "latency"],
    ["apps/web/src/App.tsx:466", "arcade_web_profile_menu_load_errors_total", "error rate"],
    ["apps/web/src/App.tsx:471", "arcade_web_profile_menu_load_ms", "latency"],
  ]);
});

test("PR 13: deploy health checks come only from files the deploy workflow runs", () => {
  expect(facts.healthChecks).toEqual(["docker/compose.prod.yml:13", "docker/compose.prod.yml:49", "scripts/deploy-prod.sh:74"]);
  expect([facts.alertFiles, facts.domainTests]).toEqual([[], []]);
});

test("PR 13: infra has detectors, domain has no business-level check, so detection is slow (measured)", () => {
  const s = detectionSignal(facts);
  expect([s.value, s.source]).toEqual(["slow", "measured"]);
  expect(s.note).toStartWith(
    "domain: no business-level check (no value metric, no test of the changed domain files); infra: latency metric arcade_web_profile_menu_load_ms, error rate metric arcade_web_profile_menu_load_errors_total, deploy health check. Every failure mode needs its detector",
  );
  expect(s.evidence).toEqual([
    "apps/web/src/App.tsx:456",
    "apps/web/src/App.tsx:466",
    "apps/web/src/App.tsx:471",
    "docker/compose.prod.yml:13",
    "docker/compose.prod.yml:49",
    "scripts/deploy-prod.sh:74",
  ]);
});

test("PR 13: catalog and code agree on the metric names", () => {
  expect(detectionDisagreements(facts)).toEqual([]);
});

test("fast only when every failure mode has its detector; a value metric is a business-level check", () => {
  const withValue = { ...facts, emits: [...facts.emits, { at: "a.ts:1", via: "record", name: "wins_shown", kind: "value" as const }] };
  const s = detectionSignal(withValue);
  expect([s.value, s.source]).toEqual(["fast", "measured"]);
  const infraOnlyDeclared = { ...facts, modes: ["infra" as const], emits: [] };
  expect([detectionSignal(infraOnlyDeclared).value, detectionSignal(infraOnlyDeclared).source]).toEqual(["fast", "declared"]);
  const securityNoAlert = { ...facts, modes: ["security" as const] };
  expect([detectionSignal(securityNoAlert).value, detectionSignal(securityNoAlert).source]).toEqual(["slow", "assumed"]);
});
