import { expect, test } from "bun:test";
import { loadDiff } from "../src/diff";
import { runGates } from "../src/gates";
import { applyPolicy } from "../src/policy";
import { REPO } from "./fixture";
import { fixtureRepo } from "./tmprepo";

test("a changed export breaks the contract only when its module is reachable from outside the repo", () => {
  const { repo, range } = fixtureRepo("public-api", ["base", "head"]);
  const g2 = runGates(loadDiff(repo, range), null)[1];
  const at = (e: string) => e.replace(/@[0-9a-f]+:/, ":");
  // Published entries: lib's index (exports ./dist/index.js stands for src/index.ts), the helper it re-exports,
  // and any file of a published package with no "exports" map.
  // A wildcard subpath ("./*": "./src/*.ts") exposes every file it matches.
  expect(g2.checks[0].evidence.map(at).sort()).toEqual([
    "packages/lib/src/helper.ts:1",
    "packages/lib/src/index.ts:3",
    "packages/open/src/deep.ts:1",
    "packages/wild/src/any.ts:1",
  ]);
  const internal = g2.checks.find((c) => c.name === "internal signature changes")!;
  expect(internal.evidence.map(at).sort()).toEqual(["packages/app/src/util.ts:1", "packages/lib/src/internal.ts:1"]);
  expect(internal.note).toContain("packages/app/src/util.ts: @x/app is private");
  expect(internal.note).toContain("packages/lib/src/internal.ts: not an entry of published package @x/lib");
  expect(internal.source).toBe("declared");
  // A manifest that does not parse cannot say whether the package is published: unverifiable, routed to a human (W 2).
  const unknown = g2.checks.find((c) => c.name === "export reachability")!;
  expect([unknown.status, unknown.evidence.map(at)]).toEqual(["unverifiable", ["packages/broken/src/lost.ts:1"]]);
  expect([g2.status, g2.route]).toEqual(["trip", "human"]);
});

test("a repo with no package.json at all: an export's reach is unverifiable, not internal", () => {
  const { repo, range } = fixtureRepo("no-manifest", ["base", "head"]);
  const g2 = runGates(loadDiff(repo, range), null)[1];
  expect([g2.status, g2.route, g2.checks.map((c) => c.name)]).toEqual(["unverifiable", "human", ["breaking change to route, schema or public signature", "export reachability"]]);
});

test("PR 1 and PR 7: removed exports from private workspace packages are internal; gate 2 passes", () => {
  for (const range of ["7eed1d0f..528c3084", "cdb77fe4..0c4e573a"]) {
    const g2 = runGates(loadDiff(REPO, range), null)[1];
    expect([range, g2.status]).toEqual([range, "pass"]);
    // The verdict on those exports was read from package.json, so the breaking check is declared.
    expect(g2.checks[0].source).toBe("declared");
    expect(g2.checks.some((c) => c.name === "internal signature changes")).toBe(true);
  }
});

test("PR 9: the export is internal, but edits to the metrics catalog (a schema file) still trip gate 2", () => {
  const g2 = runGates(loadDiff(REPO, "504f75e5..48a2a83b"), null)[1];
  expect(g2.status).toBe("trip");
  expect(g2.checks[0].evidence.every((e) => e.includes("metrics-catalog.ts"))).toBe(true);
  expect(g2.checks.find((c) => c.name === "internal signature changes")!.evidence).toEqual(["apps/api/src/infrastructure/observability/openobserve.ts@504f75e:245"]);
});

test("with no export removed or changed, the breaking check reads code only and stays measured (PR 13)", () => {
  expect(runGates(loadDiff(REPO, "30ac194..c5da112a"), null)[1].checks[0].source).toBe("measured");
});

test("PR 5 is unchanged: it removes routes", () => {
  const g2 = runGates(loadDiff(REPO, "549a1bc4..3b9c7ed7"), null)[1];
  expect(g2.status).toBe("trip");
  expect(g2.checks[0].evidence).toContain("server/src/index.ts@549a1bc:152"); // /api/game
});

test("an internal signature change lowers confidence one notch and leaves the measured level alone", () => {
  const r = applyPolicy([], "high", [], ["gate 2: 2 export(s) removed or changed in modules internal to the repo (declared by package.json)"]);
  expect([r.level, r.measuredLevel, r.why]).toEqual(["medium", "high", ["gate 2: 2 export(s) removed or changed in modules internal to the repo (declared by package.json), lowers confidence one notch"]]);
});
