import { expect, test } from "bun:test";
import { loadDiff } from "../src/diff";
import { detectionDisagreements, detectionFacts, detectionSignal } from "../src/signals/detection";
import { RANGE, REPO } from "./fixture";

const diff = loadDiff(REPO, RANGE);
const facts = detectionFacts(diff);

test("PR 13: five metric calls on changed lines, through the `metric as record` import", () => {
  expect(facts.emits).toEqual([
    { at: "apps/web/src/App.tsx:442", via: "record", name: "arcade_web_profile_menu_opens_total" },
    { at: "apps/web/src/App.tsx:451", via: "record", name: "arcade_web_profile_menu_load_success_total" },
    { at: "apps/web/src/App.tsx:456", via: "record", name: "arcade_web_profile_menu_load_ms" },
    { at: "apps/web/src/App.tsx:466", via: "record", name: "arcade_web_profile_menu_load_errors_total" },
    { at: "apps/web/src/App.tsx:471", via: "record", name: "arcade_web_profile_menu_load_ms" },
  ]);
});

test("PR 13: no alert config in the repo, so no alert on the changed path is assumed", () => {
  expect(facts.alertFiles).toEqual([]);
  const s = detectionSignal(facts);
  expect([s.value, s.source]).toEqual(["not alerted", "assumed"]);
  expect(s.note).toEndWith("no alert, SLO or dashboard config in the repo, so no alert on the changed path is assumed");
});

test("PR 13: catalog and code agree on the four new metric names", () => {
  expect(facts.catalog).toEqual({ missing: [], declaredOnly: [] });
  expect(detectionDisagreements(facts)).toEqual([]);
});

test("PR 13 with --ignore-declared: alert config and catalog not read", () => {
  const f = detectionFacts(diff, true);
  expect([f.alertFiles, f.catalog]).toEqual([null, null]);
  expect(detectionSignal(f).note).toContain("alert config not read, so no alert on the changed path is assumed");
});

test("a catalog name the code does not emit is reported as a disagreement", () => {
  expect(detectionDisagreements({ ...facts, catalog: { missing: ["x_total"], declaredOnly: [] } })).toEqual([
    "metrics emitted in code but not declared in the metrics catalog: x_total",
  ]);
});
