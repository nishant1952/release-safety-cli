import { expect, test } from "bun:test";
import { loadDiff } from "../src/diff";
import { reachFacts, reachSignal } from "../src/signals/reach";
import { RANGE, REPO } from "./fixture";

const diff = loadDiff(REPO, RANGE);
const facts = reachFacts(diff);

test("PR 13: calls on added lines reach two endpoints", () => {
  expect(facts.endpoints.map((e) => e.path)).toEqual(["/api/client-telemetry", "/api/scoreboard"]);
  expect(facts.endpoints[1].via).toEqual(["apps/web/src/App.tsx:447 -> apps/web/src/api.ts:131"]);
  expect(facts.endpoints[0].via).toContain(
    "apps/web/src/App.tsx:442 -> apps/web/src/observability/openobserve.ts:34 -> apps/web/src/observability/openobserve.ts:23",
  );
  expect(facts.endpoints[0].via.length).toBe(5);
});

test("PR 13: endpoints map to apps/api handlers and what they call", () => {
  expect(facts.handlers).toEqual([
    {
      path: "/api/client-telemetry",
      method: "POST",
      at: "apps/api/src/interfaces/http/router.ts:80",
      calls: ["emitAction"],
    },
    {
      path: "/api/scoreboard",
      method: "GET",
      at: "apps/api/src/interfaces/http/router.ts:197",
      calls: ["services.auth.me", "services.scoreboard.forUser", "services.scoreboard.leaderboard", "sessionTokenFromRequest"],
    },
  ]);
});

test("PR 13: catalog has 21 entries and no tiers, so reach is assumed high", () => {
  expect(facts.catalog).toEqual({ entries: 21, tiers: [] });
  const s = reachSignal(facts);
  expect([s.value, s.source]).toEqual(["high", "assumed"]);
  expect(s.note).toEndWith(
    "Worth unknown because the metrics catalog declares no tier for any of its 21 entries, so reach is assumed wide",
  );
});

test("a catalog tier on a reached system makes reach declared", () => {
  const s = reachSignal({
    ...facts,
    catalog: { entries: 21, tiers: [{ name: "arcade_scoreboard_views_total", tier: "low", source: "scoreboard.forUser" }] },
  });
  expect([s.value, s.source]).toEqual(["low", "declared"]);
});
