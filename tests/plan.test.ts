import { expect, test } from "bun:test";
import type { Decision } from "../src/decide";
import { buildPlan } from "../src/plan";
import PLANS from "../src/plans.json";
import { buildBrief } from "../src/run";
import type { Signal } from "../src/types";
import { RANGE, REPO } from "./fixture";

test("plans.json cells are the section 3 table verbatim", async () => {
  const w = await Bun.file(new URL("../writeup.md", import.meta.url)).text();
  for (const row of ["Exposure", "Soak per step", "Guardrails", "Abort", "Paged", "Sign-off"] as const)
    expect(w).toContain(`| ${row} | ${PLANS.presets.Auto[row]} | ${PLANS.presets.Staged[row]} | ${PLANS.presets.Human[row]} |`);
});

test("PR 13: Human plan proposes the staged preset, guardrails per failure mode, undo per reversibility signals", async () => {
  const b = await buildBrief({ repo: REPO, range: RANGE, prFile: null });
  const row = (r: string) => b.plan!.find((p) => p.row === r)!.value;
  expect(b.plan!.map((p) => p.row)).toEqual(["Exposure", "Soak per step", "Guardrails", "Abort", "Undo", "Paged", "Sign-off"]);
  expect(row("Exposure")).toBe(
    "Proposed by the system: Small slice, soak, widen; slice by flag percentage on `profile-avatar-menu` for the code inside it; edits outside the flag reach everyone at deploy (rollout mechanism is not extracted, so all-at-once is assumed). Approved or edited by the owner",
  );
  expect(row("Guardrails")).toBe(
    "Same as staged, plus whatever the owner adds. domain: business checks, none found on the changed path; " +
      "infra: resources and latency, watch latency metric arcade_web_profile_menu_load_ms, measured (apps/web/src/App.tsx:456, apps/web/src/App.tsx:471); " +
      "error rate metric arcade_web_profile_menu_load_errors_total, measured (apps/web/src/App.tsx:466); deploy health check, declared (docker/compose.prod.yml:13, docker/compose.prod.yml:49, scripts/deploy-prod.sh:74)",
  );
  expect(row("Undo")).toBe(
    "flip `profile-avatar-menu` off (flag partial, measured) for the code inside the flag; revert and redeploy (time to revert: full build and deploy, assumed) for the edits outside it.",
  );
  expect(row("Paged")).toBe(
    "Named owner before step one: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local> (earlier author of the most touched files, measured from git; the repo has no CODEOWNERS file)",
  );
  expect(row("Abort")).toBe("Owner decides");
  expect(row("Sign-off")).toBe("Required before step one");
});

const sig = (name: string, value: string, source: Signal["source"] = "measured"): Signal => ({ name, value, source, evidence: [], note: "" });
const plan = (mode: Decision["mode"], flag: string) =>
  buildPlan({
    decision: { mode } as Decision,
    signals: [sig("Feature flag", flag), sig("Time to revert", "full build and deploy", "assumed")],
    detectors: [],
    flagKey: "k",
    owner: null,
    codeowners: false,
  });

test("Auto and Block presets; undo without a flag is a revert and redeploy", () => {
  expect(plan("Auto", "full").map((r) => r.value)).toEqual([
    "100% in one step", "Minutes", "Deploy health check and error rate", "Any error spike, undo",
    "Behind a flag, undo is a flip and a slice is a flag percentage. Undo: flip `k` off (flag full, measured).", "Nobody", "None",
  ]);
  expect(plan("Staged", "none").find((r) => r.row === "Undo")!.value).toBe(
    "Without one, undo is a rollback or redeploy and a slice is a canary or percentage deploy. Undo: revert and redeploy (time to revert: full build and deploy, assumed).",
  );
  expect(plan("Block", "full")).toEqual([{ row: "Release", value: "Blocked by a gate. Fix the gate before a plan is proposed." }]);
});
