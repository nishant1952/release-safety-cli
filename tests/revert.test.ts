import { expect, test } from "bun:test";
import { loadDiff } from "../src/diff";
import { dispatchRefInput, offersRollback, revertFacts, revertSignal } from "../src/signals/revert";
import { RANGE, REPO } from "./fixture";

const diff = loadDiff(REPO, RANGE);

test("PR 13: one deploy workflow, no rollback, a declared 5-minute timeout; unknown duration rounds to slow", () => {
  const f = revertFacts(diff);
  expect(f).toEqual({
    workflows: [{ path: ".github/workflows/deploy.yml", rollback: null, timeouts: [{ value: 5, line: 15 }] }],
    measuredMinutes: null,
  });
  const s = revertSignal(f);
  expect([s.value, s.source, s.evidence]).toEqual(["full build and deploy", "assumed", [".github/workflows/deploy.yml:15"]]);
  expect(s.note).toContain("Declared job timeout: 5 min (a bound, not a measurement)");
});

test("fast only for a one-click rollback (declared) or a measured pipeline under 15 minutes", () => {
  expect(revertSignal({ workflows: [{ path: "w.yml", rollback: 3, timeouts: [] }], measuredMinutes: null }).value).toBe("one-click rollback");
  expect(revertSignal({ workflows: [], measuredMinutes: 9 }).value).toBe("measured pipeline under 15 minutes");
  expect(revertSignal({ workflows: [], measuredMinutes: 20 }).value).toBe("full build and deploy");
});

test("dispatch inputs are scoped by indentation: a later `with: version:` is not a ref input", () => {
  const yml = (inputs: string) =>
    ["on:", "  workflow_dispatch:", "    inputs:", inputs, "jobs:", "  deploy:", "    steps:", "      - uses: actions/setup-node@v4", "        with:", "          version: 20", "          ref: main"].join("\n").split("\n");
  expect(dispatchRefInput(yml("      env:\n        type: string"))).toBeNull();
  expect(dispatchRefInput(yml("      sha:\n        type: string"))).toBe(4);
  expect(dispatchRefInput(["on:", "  workflow_dispatch:", "jobs:", "  x:", "    with:", "      ref: main"])).toBeNull();
});

test("rollback lines: job ids and names count; negations, comments and env keys do not", () => {
  for (const yes of ["  rollback:", "  rollback-prod:", "name: Rollback production", "      - name: roll back to previous sha"])
    expect(offersRollback(yes)).toBe(true);
  for (const no of ["name: No rollback available", "    ROLLBACK_ENABLED: false", "# rollback: manual", "    run: echo rollback"])
    expect(offersRollback(no)).toBe(false);
});
