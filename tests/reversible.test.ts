import { expect, test } from "bun:test";
import { loadDiff, parseUnifiedDiff } from "../src/diff";
import { reversibility } from "../src/signals/reversible";
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

test("same repo, commit 528c308 (OpenObserve exporter): external API client makes it irreversible", () => {
  const s = reversibility(loadDiff(REPO, "528c308^..528c308"));
  expect(s.value).toBe("irreversible");
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
      "+  await sql`INSERT INTO matches (user_id) VALUES (${id})`;",
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
