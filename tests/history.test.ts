import { expect, test } from "bun:test";
import { loadDiff } from "../src/diff";
import { historyFacts, historySignal } from "../src/signals/history";
import { RANGE, REPO } from "./fixture";

const facts = historyFacts(loadDiff(REPO, RANGE));

test("PR 13: eight earlier commits touch the changed files, none a revert or fix", () => {
  expect(facts.shallow).toBe(false);
  expect(facts.commits.map((c) => c.sha)).toEqual([
    "974d34c", "f6e4962", "0d3e9d1", "48a2a83", "85298bc", "0c4e573", "34ff9e7", "3b9c7ed",
  ]);
  expect(facts.commits.filter((c) => c.revert || c.fix)).toEqual([]);
  // "…and fix Docker hot reload" is not a follow-up fix commit: only a leading Fix/Revert counts.
  expect(facts.commits.find((c) => c.sha === "85298bc")!.fix).toBe(false);
});

test("PR 13: the whole history spans about four hours, so history is unavailable, not 'zero incidents'", () => {
  expect(facts.span).toEqual({ from: 1791264781, to: 1791280357 });
  const s = historySignal(facts);
  expect([s.value, s.source]).toEqual(["history unavailable", "assumed"]);
  expect(s.note).toBe(
    "measured: 8 earlier commits touch the changed files, 0 reverts, 0 fix commits; repo history before base spans 4h (2026-10-06 to 2026-10-06). Too thin to read as a record (thin: < 5 commits or < 7 days)",
  );
});

test("long enough history reports counts, measured", () => {
  const s = historySignal({ ...facts, span: { from: 0, to: 30 * 86400 } });
  expect([s.value, s.source]).toEqual(["0 reverts, 0 fix commits in 8 commits", "measured"]);
});
