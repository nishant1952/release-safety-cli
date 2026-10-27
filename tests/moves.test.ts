import { expect, test } from "bun:test";
import { loadDiff, parseUnifiedDiff, type Diff } from "../src/diff";
import { runGates } from "../src/gates";
import { reversibility } from "../src/signals/reversible";
import { REPO } from "./fixture";

function synthetic(patch: string[]): Diff {
  const files = parseUnifiedDiff([...patch, ""].join("\n"));
  return { repo: "", base: "b".repeat(40), head: "h".repeat(40), files, added: files.flatMap((f) => f.added), removed: files.flatMap((f) => f.removed), buckets: {} };
}

const TABLE = ["  await sql`", "    CREATE TABLE IF NOT EXISTS pins (", "      user_id INTEGER NOT NULL,", "      game_id TEXT NOT NULL", "    )", "  `;"];

test("a route, an export and a table removed in one file and re-added in another are moves", () => {
  const d = synthetic([
    "diff --git a/src/old.ts b/src/old.ts",
    "@@ -1,8 +0,0 @@",
    '-      if (path === "/api/pins" && req.method === "GET") {',
    "-export function listPins(userId: number): Promise<string[]> {",
    ...TABLE.map((l) => "-" + l),
    "diff --git a/src/new.ts b/src/new.ts",
    "@@ -0,0 +1,8 @@",
    '+  if (path  ===  "/api/pins" && req.method === "GET") {',
    "+export   function listPins(userId: number): Promise<string[]> {",
    ...TABLE.map((l) => "+" + l.replace(/^ {2}/, "")),
  ]);
  const [, g2, g3] = runGates(d, null);
  expect([g2.status, g3.status]).toEqual(["pass", "pass"]);
  const m2 = g2.checks.find((c) => c.name === "moved routes and exports")!;
  expect(m2.note).toBe("removed and re-added in the diff (whitespace normalised; SQL by whole statement, routes by their line, exports by signature, so a changed handler or body is not seen), so not a drop: moved from src/old.ts to src/new.ts (1 route(s), 1 export(s))");
  expect(g2.checks.find((c) => c.name === "additive API surface")).toBeUndefined();
  const m3 = g3.checks.find((c) => c.name === "moved schema statements")!;
  expect(m3.evidence).toEqual(["src/old.ts@bbbbbbb:4", "src/new.ts:4"]);
  expect(reversibility(d).value).toBe("reversible");
});

test("same table name with different columns is not a move: the statement differs", () => {
  const d = synthetic([
    "diff --git a/src/old.ts b/src/old.ts",
    "@@ -1,6 +0,0 @@",
    ...TABLE.map((l) => "-" + l),
    "diff --git a/src/new.ts b/src/new.ts",
    "@@ -0,0 +1,6 @@",
    ...TABLE.map((l) => "+" + l.replace("game_id TEXT", "game_id INTEGER")),
  ]);
  expect(runGates(d, null)[2].checks[0].evidence).toEqual(["src/old.ts@bbbbbbb:2"]);
  expect(reversibility(d).value).toBe("irreversible");
});

test("a destructive statement re-added in a migration file still trips: it may run again under its new name", () => {
  const d = synthetic([
    "diff --git a/db/migrations/001_drop.sql b/db/migrations/001_drop.sql",
    "@@ -1 +0,0 @@",
    "-ALTER TABLE users DROP COLUMN legacy;",
    "diff --git a/db/migrations/007_drop.sql b/db/migrations/007_drop.sql",
    "@@ -0,0 +1 @@",
    "+ALTER TABLE users DROP COLUMN legacy;",
  ]);
  expect(runGates(d, null)[2].checks[0].evidence).toEqual(["db/migrations/007_drop.sql:1"]);
});

test("PR 5: eight routes moved to the new router; five routes and the games table are really gone", () => {
  const [, g2, g3] = runGates(loadDiff(REPO, "549a1bc4..3b9c7ed7"), null);
  const moved = g2.checks.find((c) => c.name === "moved routes and exports")!;
  expect(moved.note).toContain("moved from server/src/index.ts to apps/api/src/interfaces/http/router.ts (8 route(s))");
  const breaking = g2.checks[0].evidence.filter((e) => e.startsWith("server/src/index.ts"));
  // /api/metrics/streams, /api/game, /api/game/new, /api/game/move, /api/stats
  expect(breaking).toEqual(["server/src/index.ts@549a1bc:105", "server/src/index.ts@549a1bc:152", "server/src/index.ts@549a1bc:184", "server/src/index.ts@549a1bc:211", "server/src/index.ts@549a1bc:271"]);
  // `CREATE TABLE IF NOT EXISTS games` is replaced by `matches`, not re-added anywhere.
  expect([g3.status, g3.checks[0].evidence]).toEqual(["trip", ["server/src/db.ts@549a1bc:32"]]);
});
