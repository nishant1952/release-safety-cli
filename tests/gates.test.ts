import { expect, test } from "bun:test";
import { loadDiff, parseUnifiedDiff, type Diff } from "../src/diff";
import { runGates } from "../src/gates";
import { loadPr } from "../src/pr";
import { PR_JSON, RANGE, REPO } from "./fixture";

const diff = loadDiff(REPO, RANGE);

test("PR 13: gate 1 unverifiable (no CI status declared) routes to human; gates 2 and 3 pass", async () => {
  const pr = await loadPr(PR_JSON);
  expect(pr!.checks).toBeNull();
  const gates = runGates(diff, pr);
  expect(gates.map((g) => [g.gate, g.status, g.route])).toEqual([
    [1, "unverifiable", "human"],
    [2, "pass", "none"],
    [3, "pass", "none"],
  ]);
  expect(gates[0].checks.map((c) => [c.name, c.status, c.source])).toEqual([
    ["secrets", "pass", "measured"],
    ["PII", "pass", "measured"],
    ["hardcoded environment values", "pass", "measured"],
    ["required CI checks", "unverifiable", "assumed"],
  ]);
  const additive = gates[1].checks.find((c) => c.name === "additive API surface")!;
  expect(additive.evidence).toEqual([
    "apps/api/src/infrastructure/observability/metrics-catalog.ts:128",
    "apps/api/src/infrastructure/observability/metrics-catalog.ts:135",
    "apps/api/src/infrastructure/observability/metrics-catalog.ts:142",
    "apps/api/src/infrastructure/observability/metrics-catalog.ts:149",
  ]);
  expect(gates[1].checks[0].evidence).toEqual([]);
  expect(gates[2].checks[0].evidence).toEqual([]);
});

function synthetic(patch: string): Diff {
  const files = parseUnifiedDiff(patch);
  return {
    repo: "",
    base: "b".repeat(40),
    head: "h".repeat(40),
    files,
    added: files.flatMap((f) => f.added),
    removed: files.flatMap((f) => f.removed),
    buckets: {},
  };
}

test("trip paths: changed export signature, removed route, raw UPDATE, secret, red CI", () => {
  const d = synthetic(
    [
      "diff --git a/src/a.ts b/src/a.ts",
      "@@ -1,2 +1,4 @@",
      "-export function score(user: User): number {",
      "+export function score(user: User, game: string): number {",
      '-      if (path === "/api/old" && req.method === "GET") {',
      "+  await sql`UPDATE matches SET status = 'x'`;",
      '+const apiKey = "abcd1234efgh5678";',
      "",
    ].join("\n"),
  );
  const gates = runGates(d, {
    file: "",
    title: "",
    body: "",
    author: { login: "", is_bot: false },
    checks: [{ name: "build", conclusion: "FAILURE" }],
  });
  expect(gates.map((g) => [g.status, g.route])).toEqual([
    ["trip", "block"],
    ["trip", "human"],
    ["trip", "human"],
  ]);
  expect(gates[1].checks[0].evidence).toEqual(["src/a.ts@bbbbbbb:1", "src/a.ts@bbbbbbb:2"]);
  expect(gates[2].checks[0].evidence).toEqual(["src/a.ts:2"]);
  expect(gates[0].checks.find((c) => c.name === "secrets")!.evidence).toEqual(["src/a.ts:3"]);
});
