// Demo: what the diff view shows between a run and the one before it, on real runs measured from the stored inputs.
import { expect, test } from "bun:test";
import { run } from "../apps/demo/server/app";
import { measurePr } from "../apps/demo/server/fixtures";
import { diffRuns } from "../apps/demo/web/src/compare";
import "./fixture";

const m13 = await measurePr(13);
const base13 = await run(m13, {}, null);

test("PR 13, Reach low: grid cell and the Reach row move, the mode does not, the probability push is a new reason", async () => {
  const after = await run(m13, { signals: { Reach: "low" } }, null);
  const d = diffRuns(base13, after);
  expect([d.mode.changed, d.mode.after]).toEqual([false, "Human"]);
  expect([d.cell.before, d.cell.after]).toEqual(["high x long", "low x long"]);
  expect(d.changedRows.map((r) => [r.name, r.before, r.after && { value: r.after.value, source: r.after.source }])).toEqual([
    ["Reach", { value: "high", source: "assumed" }, { value: "low", source: "declared by owner" }],
  ]);
  expect(d.unchangedRows.length).toBe(base13.brief.signals.length - 1);
  expect(d.reasons.added.map((r) => r.text)).toEqual([
    "Low damage: the reach is low (declared by owner).",
    "Probability: measured confidence is low, so the mode moves one step toward caution (Staged to Human).",
  ]);
  expect(d.reasons.removed.map((r) => r.text.slice(0, 40))).toEqual([
    "High damage: the path is live (declared)",
    "Probability: measured confidence is low,",
  ]);
  expect(d.reasons.reworded).toEqual([]);
  // Compared with itself, nothing moved.
  const same = diffRuns(after, after);
  expect([same.changedRows.length, same.reasons.added.length, same.cell.changed]).toEqual([0, 0, false]);
});

test("PR 11, advisory checks as required: Human -> Block, gate 1 moves, the advisory reason goes", async () => {
  const m = await measurePr(11);
  const d = diffRuns(await run(m, {}, null), await run(m, { advisoryAsRequired: true }, null));
  expect([d.mode.before, d.mode.after]).toEqual(["Human", "Block"]);
  expect(d.gates.filter((g) => g.changed).map((g) => [g.before, g.after])).toEqual([["1. Table stakes: trip, routes to human", "1. Table stakes: trip, routes to block"]]);
  expect(d.reasons.added[0].text.startsWith("Gate 1 (Table stakes) is trip, so it routes to block")).toBe(true);
});

test("the model's wording on an unchanged reason is listed as reworded, not as unchanged", () => {
  const worded = { ...base13, brief: { ...base13.brief, reasons: base13.brief.reasons.map((r, i) => (i === 0 ? { ...r, prose: "One. Two." } : r)) } };
  const d = diffRuns(base13, worded);
  expect([d.reasons.added.length, d.reasons.removed.length, d.reasons.reworded.map((r) => r.prose)]).toEqual([0, 0, ["One. Two."]]);
});
