// Demo, Unit 2: owner values and the four switches, applied by decide on one measurement.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { askWithKey, type CallProgress } from "../src/llm";
import { resetLlmLog, setLlmLogPath } from "../src/llmlog";
import { loadPr } from "../src/pr";
import { decide, measure, type Measured } from "../src/run";
import { PR_JSON, RANGE, REPO } from "./fixture";

const fixture = (n: number) => new URL(`./fixtures/pr${n}.json`, import.meta.url).pathname;
// One measurement per PR; every test decides on it with different overrides.
const pr13: Measured = measure(REPO, RANGE, await loadPr(PR_JSON));
const pr4: Measured = measure(REPO, "f26e6b00..fab0ae6a", await loadPr(fixture(4)));
const pr11: Measured = measure(REPO, "206fa14..974d34c", await loadPr(fixture(11)));

test("PR 13: Reach low as owner moves the grid high x long -> low x long; the probability shift keeps it Human", async () => {
  const { brief, cell } = await decide(pr13, { signals: { Reach: "low" } });
  expect([cell.damage, cell.window, cell.gridMode, cell.shifted, brief.mode]).toEqual(["low", "long", "Staged", true, "Human"]);
  const reach = brief.signals.find((s) => s.name === "Reach")!;
  expect([reach.value, reach.source, reach.evidence]).toEqual(["low", "declared by owner", []]);
  expect(reach.note.startsWith('declared by the owner; was "high" (assumed): measured: calls reach POST /api/client-telemetry')).toBe(true);
  expect(brief.reasons.map((r) => r.text)).toContain("Low damage: the reach is low (declared by owner).");
  expect(brief.reasons.map((r) => r.text)).toContain("Probability: measured confidence is low, so the mode moves one step toward caution (Staged to Human).");
  // No longer assumed, so the one unknown no longer offers it.
  expect(brief.unknown).not.toContain("Reach (high)");
}, 30_000);

test("PR 4: a measured 5-minute revert shortens the window: Staged -> Auto", async () => {
  expect((await decide(pr4)).brief.mode).toBe("Staged");
  const { brief, cell } = await decide(pr4, { revertMinutes: 5 });
  expect([cell.damage, cell.window, brief.mode]).toEqual(["low", "short", "Auto"]);
  const revert = brief.signals.find((s) => s.name === "Time to revert")!;
  expect([revert.value, revert.source]).toEqual(["measured pipeline under 15 minutes", "declared by owner"]);
  expect(revert.note.startsWith('the owner measured the build and deploy pipeline at 5 minutes; was "full build and deploy" (assumed)')).toBe(true);
  // 15 minutes or more is not fast.
  expect((await decide(pr4, { revertMinutes: 20 })).brief.mode).toBe("Staged");
}, 30_000);

test("PR 11: advisory checks treated as required trip gate 1: Human -> Block", async () => {
  const before = await decide(pr11);
  expect(before.brief.mode).toBe("Human");
  expect(before.brief.confidence!.why.some((w) => w.startsWith("gate 1: red advisory check"))).toBe(true);
  const { brief, cell } = await decide(pr11, { advisoryAsRequired: true });
  expect([brief.mode, cell.gateMode, brief.gates[0].route]).toEqual(["Block", "Block", "block"]);
  const ci = brief.gates[0].checks.find((c) => c.name === "required CI checks")!;
  expect([ci.status, ci.source]).toEqual(["trip", "declared by owner"]);
  expect(ci.note).toContain("required and not green: FireWeave — flag contract (FAILURE)");
  expect(ci.note).toContain("the owner treats every check in the rollup as required");
  expect(brief.gates[0].checks.some((c) => c.name === "advisory CI checks")).toBe(false);
  expect(brief.reasons[0].text.startsWith("Gate 1 (Table stakes) is trip, so it routes to block")).toBe(true);
  // A red check that is now required is no longer an advisory notch.
  expect(brief.confidence!.why.some((w) => w.startsWith("gate 1: red advisory check"))).toBe(false);
}, 30_000);

test("measured beats declared: an owner value for a measured signal is a disagreement, and the measured value stands", async () => {
  const base = await decide(pr13);
  const { brief } = await decide(pr13, { signals: { "Detection apparatus": "fast" } });
  const det = brief.signals.find((s) => s.name === "Detection apparatus")!;
  expect([det.value, det.source]).toEqual(["slow", "measured"]);
  expect(brief.disagreements).toContain('the owner declares Detection apparatus = "fast", but it is measured as "slow"; measured beats declared, so the measured value stands');
  expect(brief.mode).toBe(base.brief.mode);
}, 30_000);

test("an owner value outside a decision signal's values is refused, so it cannot fall through the grid as favourable", async () => {
  expect(decide(pr13, { signals: { Reach: "banana" } })).rejects.toThrow('"banana" is not a value of Reach; it must be one of: high, low, none');
  expect(decide(pr13, { signals: { "Time to revert": "instant" } })).rejects.toThrow("a measured pipeline is set with revertMinutes");
  // A probability signal only lowers confidence, so its value is free text.
  expect((await decide(pr13, { signals: { History: "two reverts last month" } })).brief.signals.find((s) => s.name === "History")!.source).toBe("declared by owner");
}, 30_000);

test("an unknown signal or a model read cannot be declared", async () => {
  expect(decide(pr13, { signals: { Reech: "low" } })).rejects.toThrow('no signal named "Reech"');
  expect(decide(pr13, { signals: { "Confidence: diff vs task (LLM)": "coherent" } })).rejects.toThrow("is the model's answer");
});

test("PR 13: stylesheet lines counted as covered move inside the flag; other outside lines keep it partial", async () => {
  const { brief } = await decide(pr13, { stylesheetsCovered: true });
  const flag = brief.signals.find((s) => s.name === "Feature flag")!;
  expect([flag.value, flag.source]).toEqual(["partial", "measured"]);
  const css = pr13.flag.lines.filter(([ref, c]) => ref.startsWith("apps/web/src/styles.css:") && c === "outside").length;
  expect(css).toBeGreaterThan(0);
  expect(flag.note).toContain(`${css} line(s) moved from outside to inside`);
}, 30_000);

test("model switched off: nothing is asked, and both reads say so", async () => {
  let asked = 0;
  const ask = (async () => {
    asked++;
    return null;
  }) as any;
  const { brief } = await decide(pr13, { model: false }, undefined, { ask });
  expect(asked).toBe(0);
  expect(brief.signals.find((s) => s.name === "Confidence: diff vs task (LLM)")!.note).toBe("diff not sent to the LLM: the model is switched off");
}, 30_000);

// A key held by the caller: progress hears each call start and end, and nothing goes to the log file.
let server: ReturnType<typeof Bun.serve>;
const logFile = join(tmpdir(), `overrides-test-${process.pid}.jsonl`);
beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: (req) =>
      Response.json({
        id: "msg_test", type: "message", role: "assistant", model: "claude-sonnet-5-5",
        content: [{ type: "text", text: JSON.stringify({ key: `${req.headers.get("x-api-key") ?? ""}${req.headers.get("authorization") ?? ""}`.includes("page-key") }) }], stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 3, output_tokens: 2 },
      }),
  });
  process.env.ANTHROPIC_BASE_URL = `http://localhost:${server.port}`;
  setLlmLogPath(logFile);
});
afterAll(() => {
  server.stop(true);
  delete process.env.ANTHROPIC_BASE_URL;
  resetLlmLog();
});

test("askWithKey sends the caller's key, reports start and end, and writes no log", async () => {
  const seen: CallProgress[] = [];
  const ask = askWithKey("page-key", (p) => seen.push(p));
  expect(await ask<{ key: boolean }>("s", "u", { type: "object" }, "model contract")).toEqual({ key: true });
  expect(seen.map((p) => [p.purpose, p.done === null ? "start" : p.done.outcome])).toEqual([["model contract", "start"], ["model contract", "ok"]]);
  expect(existsSync(logFile)).toBe(false);
});

test("the CLI takes the same object with --overrides", () => {
  const proc = Bun.spawnSync(
    ["bun", "run", "src/cli.ts", REPO, "f26e6b00..fab0ae6a", "--pr", fixture(4), "--overrides", JSON.stringify({ revertMinutes: 5 })],
    { cwd: new URL("..", import.meta.url).pathname, env: { ...process.env, ANTHROPIC_API_KEY: "" } },
  );
  expect(proc.stdout.toString().split("\n").find((l) => l.startsWith("**Mode:"))).toBe("**Mode: Auto.** Grid: low damage x short window = Auto.");
}, 60_000);
