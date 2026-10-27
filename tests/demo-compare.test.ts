// Demo, Unit 6: what the diff view shows after a run, on real runs of the baked measurements.
import { expect, test } from "bun:test";
import { run } from "../apps/demo/server/app";
import { loadMeasured } from "../apps/demo/server/fixtures";
import { describeOverrides, diffRuns } from "../apps/demo/web/src/compare";
import "./fixture";

const m13 = loadMeasured(13);
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
  // Compared with itself, nothing moved.
  const same = diffRuns(after, after);
  expect([same.changedRows.length, same.reasons.added.length, same.cell.changed]).toEqual([0, 0, false]);
});

test("PR 11, advisory checks as required: Human -> Block, gate 1 moves, the advisory reason goes", async () => {
  const m = loadMeasured(11);
  const d = diffRuns(await run(m, {}, null), await run(m, { advisoryAsRequired: true }, null));
  expect([d.mode.before, d.mode.after]).toEqual(["Human", "Block"]);
  expect(d.gates.filter((g) => g.changed).map((g) => [g.before, g.after])).toEqual([["1. Table stakes: trip → human", "1. Table stakes: trip → block"]]);
  expect(d.reasons.added[0].text.startsWith("Gate 1 (Table stakes) is trip, so it routes to block")).toBe(true);
});

test("history lines name the overrides", () => {
  expect(describeOverrides({ signals: { Reach: "low" }, revertMinutes: 5, advisoryAsRequired: true }, true)).toBe("Reach = low; revert 5 min; advisory checks required; model on");
  expect(describeOverrides({}, false)).toBe("no overrides");
});
