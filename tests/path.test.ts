import { expect, test } from "bun:test";
import { loadDiff } from "../src/diff";
import { pathFacts, pathSignal } from "../src/signals/path";
import { RANGE, REPO } from "./fixture";

const facts = pathFacts(loadDiff(REPO, RANGE));
const chain = (f: string) => facts.chains.get(f)?.map((h) => `${h.file}:${h.line}`) ?? null;

test("PR 13: entry points come from package.json scripts and index.html", () => {
  expect(facts.entries).toEqual(["apps/api/src/main.ts", "apps/web/src/main.tsx"]);
});

test("PR 13: import chains from changed files up to an entry point", () => {
  expect(chain("apps/api/src/infrastructure/observability/metrics-catalog.ts")).toEqual([
    "apps/api/src/infrastructure/observability/openobserve.ts:9",
    "apps/api/src/bootstrap.ts:12",
    "apps/api/src/main.ts:2",
  ]);
  expect(chain("apps/web/src/App.tsx")).toEqual(["apps/web/src/main.tsx:5"]);
  expect(chain("apps/web/src/fireweave/fw-providers.ts")).toEqual([
    "apps/web/src/fireweave/fw-harness.ts:46",
    "apps/web/src/main.tsx:4",
  ]);
  // A stylesheet is not a code path: listed, never chained (Round 3, Unit 2).
  expect(facts.chains.has("apps/web/src/styles.css")).toBe(false);
  expect(facts.nonCode).toEqual(["apps/web/src/styles.css"]);
  expect(facts.chains.get("apps/web/src/fireweave/fw-tracker.ts")).toBeNull();
});

test("PR 13: ProfileMenu < Shell is mounted by the authed layout route", () => {
  expect(facts.routes).toEqual([
    {
      chain: ["ProfileMenu", "Shell"],
      evidence: ["apps/web/src/App.tsx:554", "apps/web/src/App.tsx:596", "apps/web/src/App.tsx:593"],
      routePath: "(layout)",
      childPaths: ["(index)", "play/:gameId", "scoreboard", "admin"],
      wrappers: ["RequireAuth"],
    },
  ]);
});

test("PR 13: path is live, declared (entry points come from config)", () => {
  const s = pathSignal(facts);
  expect(s.value).toBe("live");
  expect(s.source).toBe("declared");
  expect(s.note).toContain(
    "ProfileMenu < Shell is mounted by route (layout) with child routes (index), play/:gameId, scoreboard, admin behind RequireAuth",
  );
  expect(s.note).toContain("not imported from any entry point: apps/web/src/fireweave/fw-tracker.ts");
});

test("no entry point found: the path is assumed live (W 2)", () => {
  const s = pathSignal({ entries: [], chains: new Map([["a.ts", null]]), routes: [], nonCode: [], onlyNonCode: false });
  expect([s.value, s.source]).toEqual(["live", "assumed"]);
  expect(s.note).toBe("no entry point found in workspace package.json scripts or index.html, so the path is assumed live");
});
