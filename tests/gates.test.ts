import { expect, test } from "bun:test";
import { loadDiff, parseUnifiedDiff, type Diff } from "../src/diff";
import { looksLikeSecret, runGates, statementAt } from "../src/gates";
import { loadPr } from "../src/pr";
import { PR_JSON, RANGE, REPO } from "./fixture";

const diff = loadDiff(REPO, RANGE);

test("PR 13: CI is green in the export's rollup, so all three gates pass", async () => {
  const pr = await loadPr(PR_JSON);
  expect(pr!.checks).toEqual([
    { name: "FireWeave — flag contract", conclusion: "SUCCESS" },
    { name: "FireWeave — rollout readiness", conclusion: "SUCCESS" },
  ]);
  const gates = runGates(diff, pr);
  expect(gates.map((g) => [g.gate, g.status, g.route])).toEqual([
    [1, "pass", "none"],
    [2, "pass", "none"],
    [3, "pass", "none"],
  ]);
  expect(gates[0].checks.map((c) => [c.name, c.status, c.source])).toEqual([
    ["secrets", "pass", "measured"],
    ["PII", "pass", "measured"],
    ["hardcoded environment values", "pass", "measured"],
    ["required CI checks", "pass", "measured"],
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
    required: null,
    reviews: null,
  });
  expect(gates.map((g) => [g.status, g.route])).toEqual([
    ["trip", "block"],
    ["trip", "human"],
    ["trip", "human"],
  ]);
  // The route is public; with no repo to read manifests from, the export's reach is unverifiable (Round 3, Unit 4).
  expect(gates[1].checks[0].evidence).toEqual(["src/a.ts@bbbbbbb:2"]);
  expect(gates[1].checks.find((c) => c.name === "export reachability")!.status).toBe("unverifiable");
  expect(gates[2].checks[0].evidence).toEqual(["src/a.ts:2"]);
  expect(gates[0].checks.find((c) => c.name === "secrets")!.evidence).toEqual(["src/a.ts:3"]);
});

test("a credential-named key with a plain-word value is not a secret (PR 9, 48a2a83: reason: user ? \"bad_password\" : \"unknown_user\")", () => {
  const gates = runGates(loadDiff(REPO, "48a2a83^..48a2a83"), null);
  expect(gates[0].checks.find((c) => c.name === "secrets")!.status).toBe("pass");
  expect(["unknown_user", "bad_password", "changeme", "${DB_PASSWORD}", "your-api-key"].map(looksLikeSecret)).toEqual([false, false, false, false, false]);
  expect(["abcd1234efgh5678", "S3cr3t!pass", "hunter22"].map(looksLikeSecret)).toEqual([true, true, true]);
});

test("hardcoded URLs and IPs in docs, config and comments do not trip; in code they route to a human, not block (528c308)", () => {
  const gates = runGates(loadDiff(REPO, "528c308^..528c308"), null);
  const hard = gates[0].checks.find((c) => c.name === "hardcoded environment values")!;
  expect(hard.evidence.some((e) => e.startsWith("README.md"))).toBe(false);
  const d = synthetic(
    ["diff --git a/src/a.ts b/src/a.ts", "@@ -0,0 +1,2 @@", '+const api = "http://10.0.0.5:8080";', "+// see http://localhost:3000", ""].join("\n"),
  );
  const g1 = runGates(d, { file: "", title: "", body: "", author: { login: "", is_bot: false }, checks: [{ name: "ci", conclusion: "SUCCESS" }], required: null, reviews: null })[0];
  expect(g1.checks.find((c) => c.name === "hardcoded environment values")!.evidence).toEqual(["src/a.ts:1"]);
  expect([g1.status, g1.route]).toEqual(["trip", "human"]);
});

test("row-scoped UPDATE/DELETE in app code passes gate 3 (0e61b2d password change, 04c6f86 pins)", () => {
  for (const range of ["0e61b2d^..0e61b2d", "04c6f86^..04c6f86"]) {
    const g3 = runGates(loadDiff(REPO, range), null)[2];
    expect([range, g3.status]).toEqual([range, "pass"]);
  }
});

test("gate 3 trips on an UPDATE without WHERE in code, and on any UPDATE in a migration file", () => {
  const code = synthetic(["diff --git a/src/a.ts b/src/a.ts", "@@ -0,0 +1,3 @@", "+  await sql`", "+    UPDATE users SET role = 'admin'", "+  `;", ""].join("\n"));
  expect(runGates(code, null)[2].checks[0].evidence).toEqual(["src/a.ts:2"]);
  const scopedCode = synthetic(["diff --git a/src/a.ts b/src/a.ts", "@@ -0,0 +1,2 @@", "+    UPDATE users SET role = 'admin'", "+    WHERE id = ${id}`;", ""].join("\n"));
  expect(runGates(scopedCode, null)[2].status).toBe("pass");
  const migration = synthetic(["diff --git a/db/migrations/002.sql b/db/migrations/002.sql", "@@ -0,0 +1 @@", "+UPDATE users SET role = 'user' WHERE role IS NULL;", ""].join("\n"));
  expect(runGates(migration, null)[2].checks[0].evidence).toEqual(["db/migrations/002.sql:1"]);
});

test("SQL quoted in a doc does not trip gate 3 (38f7192 adds a Cursor SKILL.md with SQL)", () => {
  const g3 = runGates(loadDiff(REPO, "38f7192^1..38f7192"), null)[2];
  expect(g3.checks[0].evidence.filter((e) => e.endsWith(".md") || e.includes(".md:"))).toEqual([]);
});

test("a dropped table definition trips gate 3 (50f606b replaces `games` with `matches`)", () => {
  // git sees server/src/db.ts -> apps/api/.../client.ts as a rename; the only removed definition is games.
  const g3 = runGates(loadDiff(REPO, "50f606b^1..50f606b"), null)[2];
  expect(g3.checks[0].evidence).toEqual(["server/src/db.ts@549a1bc:32"]);
});

test("the WHERE lookahead stops at the next statement", () => {
  const lines = ["const a = sql`UPDATE users SET role = 'x'", "const b = await sql`SELECT * FROM t WHERE id = 1`"];
  expect(/WHERE/.test(statementAt(lines, 0, lines[0].indexOf("UPDATE")))).toBe(false);
  const multi = ["      UPDATE users SET role = 'admin', password_hash = ${passwordHash}", "        WHERE username = ${username}", "      `;"];
  expect(/WHERE/.test(statementAt(multi, 0, 6))).toBe(true);
});

test("CI status comes from each PR export's rollup; without required-checks.json every listed check is assumed required", async () => {
  const ci = async (dir: string, range: string) =>
    runGates(loadDiff(REPO, range), await loadPr(new URL(`./fixtures/${dir}.json`, import.meta.url).pathname))[0].checks.find((c) => c.name === "required CI checks")!;
  expect((await ci("pr14", "9dfc79d0..71e8103d")).status).toBe("pass"); // two SUCCESS
  expect((await ci("pr4", "f26e6b00..fab0ae6a")).status).toBe("pass"); // NEUTRAL counts as green
  const assumed = ". The export has no required-checks.json, so every rollup check is assumed required";
  const empty = await ci("pr9", "504f75e5..48a2a83b");
  expect([empty.status, empty.source, empty.note]).toEqual(["pass", "assumed", "the PR export's rollup lists no checks" + assumed]);
});

const prWith = (checks: { name: string; conclusion: string }[], required: string[] | null) => ({
  file: "",
  title: "",
  body: "",
  author: { login: "", is_bot: false },
  checks,
  required: required && { checks: required, source: "test" },
  reviews: null,
});
const g1 = (pr: ReturnType<typeof prWith>) => runGates(synthetic(""), pr)[0];
const ciOf = (pr: ReturnType<typeof prWith>) => g1(pr).checks.filter((c) => c.name.includes("CI")).map((c) => [c.name, c.status, c.source]);

test("required CI checks are measured: red required blocks, absent or pending required routes to a human, red advisory only lowers confidence", () => {
  const rollup = [
    { name: "build", conclusion: "SUCCESS" },
    { name: "lint", conclusion: "FAILURE" },
    { name: "e2e", conclusion: "PENDING" },
  ];
  // A required check that is not green trips and blocks.
  expect([g1(prWith(rollup, ["build", "lint"])).route, ciOf(prWith(rollup, ["build", "lint"]))]).toEqual(["block", [["required CI checks", "trip", "measured"]]]);
  // Pending or absent required checks cannot be verified: a human, not a block. The red lint is advisory.
  for (const req of [["build", "e2e"], ["build", "deploy"]])
    expect([g1(prWith(rollup, req)).route, ciOf(prWith(rollup, req))]).toEqual([
      "human",
      [["required CI checks", "unverifiable", "measured"], ["advisory CI checks", "pass", "declared"]],
    ]);
  // No required checks configured: the gate cannot block on CI; the red check is listed.
  const none = g1(prWith(rollup, []));
  expect([none.route, ciOf(prWith(rollup, []))]).toEqual(["none", [["required CI checks", "pass", "measured"], ["advisory CI checks", "pass", "declared"]]]);
  expect(none.checks.find((c) => c.name === "advisory CI checks")!.note).toStartWith("red advisory check, no required checks on the repo: lint (FAILURE)");
  // No required-checks.json in the export: every rollup check is treated as required, provenance assumed.
  expect([g1(prWith(rollup, null)).route, ciOf(prWith(rollup, null))]).toEqual(["block", [["required CI checks", "trip", "assumed"]]]);
  // No rollup at all: unverifiable, as before.
  expect(ciOf({ ...prWith([], []), checks: null as any })).toEqual([["required CI checks", "unverifiable", "assumed"]]);
});

test("PR 11: no required checks on the repo, so the red flag-contract check is advisory and the release is not blocked", async () => {
  const pr = await loadPr(new URL("./fixtures/pr11.json", import.meta.url).pathname);
  expect(pr!.required!.checks).toEqual([]);
  const g = runGates(loadDiff(REPO, "206fa144..974d34ce"), pr)[0];
  expect(g.route).not.toBe("block");
  expect(g.checks.find((c) => c.name === "advisory CI checks")!.note).toStartWith(
    "red advisory check, no required checks on the repo: FireWeave — flag contract (FAILURE)",
  );
});
