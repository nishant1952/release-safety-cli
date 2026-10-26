import { expect, test } from "bun:test";
import { loadDiff, parseUnifiedDiff } from "../src/diff";
import { Project } from "ts-morph";
import { httpTargetsOnLine, reversibility } from "../src/signals/reversible";
import { RANGE, REPO } from "./fixture";

test("PR 13: reversible, measured, no writes or outbound effects in the diff", () => {
  expect(reversibility(loadDiff(REPO, RANGE))).toEqual({
    name: "Reversible or irreversible",
    value: "reversible",
    source: "measured",
    evidence: [],
    note: "no persisted write, outbound side effect, queue publish or external API client in 243 added lines",
  });
});

test("same repo, commit 528c308 (OpenObserve exporter): env-based fetch targets are not resolved, so irreversible", () => {
  const s = reversibility(loadDiff(REPO, "528c308^..528c308"));
  expect(s.value).toBe("irreversible");
  expect(s.note).toBe("HTTP call, target not resolved one hop in the diff: treated as irreversible because it may leave effects a redeploy cannot undo");
  expect(s.note).not.toContain("external API client");
  expect(s.evidence).toEqual([
    "server/src/observability.ts:46",
    "server/src/observability.ts:68",
    "server/src/observability.ts:304",
  ]);
});

test("each rule group fires on its own pattern", () => {
  const files = parseUnifiedDiff(
    [
      "diff --git a/x.ts b/x.ts",
      "@@ -0,0 +1,4 @@",
      "+  await sql`DELETE FROM matches`;",
      "+  await sendEmail(user.email, body);",
      "+  await queue.publish(\"match.ended\", payload);",
      "+  const r = await fetch('/api/scoreboard');",
      "",
    ].join("\n"),
  );
  const d = { repo: "", base: "b".repeat(40), head: "h".repeat(40), files, added: files[0].added, removed: [], buckets: {} };
  const s = reversibility(d);
  expect(s.value).toBe("irreversible");
  expect(s.evidence).toEqual(["x.ts:1", "x.ts:2", "x.ts:3"]);
  expect(s.note).toBe("persisted write, outbound side effect, queue publish in the diff: a redeploy cannot undo these");
});

test("row-scoped CRUD in app code is not a persisted write (commit 04c6f86, lobby pins)", () => {
  // INSERT INTO pins, DELETE FROM pins WHERE ..., CREATE TABLE IF NOT EXISTS pins: none survive a revert as damage.
  const s = reversibility(loadDiff(REPO, "04c6f86^..04c6f86"));
  expect(s.evidence.filter((e) => e.includes("db/"))).toEqual([]);
});

test("a fetch inside a config file is not an external client (d4a40df compose healthcheck)", () => {
  const s = reversibility(loadDiff(REPO, "d4a40df^1..d4a40df"));
  expect(s.evidence.filter((e) => e.includes(".yml"))).toEqual([]);
});

test("fetch targets resolve one hop: /api is internal, http(s) external, anything else not resolved", () => {
  const sf = new Project({ useInMemoryFileSystem: true }).createSourceFile(
    "/a.ts",
    [
      'const local = "/api/scoreboard";',
      "const tpl = `/api/games/${id}`;",
      'const remote = "https://example.com/x";',
      "const base = process.env.BASE ?? '';",
      "fetch(local);",
      "fetch(tpl);",
      "fetch(remote);",
      "fetch(`${remote}/y`);",
      "fetch(base);",
      "function request(path: string) { return fetch(path); }",
      'fetch("https://example.com/z");',
    ].join("\n"),
  );
  expect([5, 6, 7, 8, 9, 10, 11].map((n) => httpTargetsOnLine(sf, n))).toEqual([
    ["internal"], ["internal"], ["external"], ["external"], ["unresolved"], ["unresolved"], ["external"],
  ]);
});
