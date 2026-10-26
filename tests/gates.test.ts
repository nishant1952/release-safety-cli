import { expect, test } from "bun:test";
import { loadDiff, parseUnifiedDiff, type Diff } from "../src/diff";
import { looksLikeSecret, runGates, statementAt } from "../src/gates";
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
    reviews: null,
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
  const g1 = runGates(d, { file: "", title: "", body: "", author: { login: "", is_bot: false }, checks: [{ name: "ci", conclusion: "SUCCESS" }], reviews: null })[0];
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

test("CI status comes from each PR export's rollup; every listed check counts as required", async () => {
  const ci = async (dir: string, range: string) =>
    runGates(loadDiff(REPO, range), await loadPr(new URL(`../data/${dir}/pr.json`, import.meta.url).pathname))[0].checks.find((c) => c.name === "required CI checks")!;
  expect((await ci("pr14", "9dfc79d0..71e8103d")).status).toBe("pass"); // two SUCCESS
  expect((await ci("pr4", "f26e6b00..fab0ae6a")).status).toBe("pass"); // NEUTRAL counts as green
  const red = await ci("pr11", "206fa144..974d34ce"); // flag contract FAILURE
  expect([red.status, red.note]).toEqual(["trip", "not green in the PR export's rollup: FireWeave — flag contract (FAILURE)"]);
  const empty = await ci("pr9", "504f75e5..48a2a83b");
  expect([empty.status, empty.note]).toEqual(["pass", "the PR export's rollup lists no checks"]);
});
