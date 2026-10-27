// Demo, Unit 4: the API over the baked measurements. Runs are decided on the baked Measured; with a key from the
// request the model calls stream progress as server-sent events. Nothing is fetched except the model.
import { afterAll, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, redactingQuoter, type PrDetail, type PrSummary, type RunResult } from "../apps/demo/server/app";
import { loadMeasured } from "../apps/demo/server/fixtures";
import { resetLlmLog, setLlmLogPath } from "../src/llmlog";
import "./fixture";

const app = await createApp();
const get = (path: string) => app.fetch(new Request(`http://demo${path}`));
const post = (path: string, body: unknown) =>
  app.fetch(new Request(`http://demo${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

/** The events of a text/event-stream body, in order. */
async function events(res: Response): Promise<{ event: string; data: any }[]> {
  expect(res.headers.get("content-type")).toBe("text/event-stream");
  return (await res.text())
    .split("\n\n")
    .filter((b) => b.startsWith("event: "))
    .map((b) => ({ event: b.match(/^event: (.+)$/m)![1], data: JSON.parse(b.match(/^data: (.+)$/m)![1]) }));
}
const resultOf = async (res: Response) => (await events(res)).find((e) => e.event === "result")!.data as RunResult;

test("GET /api/prs: the 21 PRs with their baked baseline mode and grid cell", async () => {
  const prs: PrSummary[] = await (await get("/api/prs")).json();
  expect(prs.length).toBe(21);
  expect(prs.find((p) => p.n === 13)).toEqual({ n: 13, title: "Add a profile avatar menu beside logout", mode: "Human", cell: "high x long" });
  expect(prs.find((p) => p.n === 4)).toMatchObject({ mode: "Staged", cell: "low x long" });
});

test("GET /api/prs/13: the baseline renders out/pr13.md; the model reads are read-only", async () => {
  const d: PrDetail = await (await get("/api/prs/13")).json();
  expect(d.baseline.markdown).toBe(readFileSync(new URL("../out/pr13.md", import.meta.url), "utf8"));
  expect([d.range, d.baseline.model, d.readOnly]).toEqual(["30ac194..c5da112", false, ["Failure mode (LLM second opinion)", "Confidence: diff vs task (LLM)"]]);
  expect((await get("/api/prs/22")).status).toBe(404);
});

test("POST /api/prs/13/run: Reach low as owner, decided in under a second", async () => {
  const r = await resultOf(await post("/api/prs/13/run", { overrides: { signals: { Reach: "low" } } }));
  expect([r.cell.damage, r.cell.window, r.cell.gridMode, r.brief.mode, r.model]).toEqual(["low", "long", "Staged", "Human", false]);
  expect(r.ms).toBeLessThan(1000);
  // The baseline is unchanged by a run.
  const d: PrDetail = await (await get("/api/prs/13")).json();
  expect(d.baseline.brief.mode).toBe("Human");
  expect(d.baseline.cell.damage).toBe("high");
});

test("a bad body is a 400, an unknown signal an error event", async () => {
  expect((await post("/api/prs/13/run", { overrides: { revertMinutes: "five" } })).status).toBe(400);
  expect((await post("/api/prs/13/run", { overrides: { colour: "red" } })).status).toBe(400);
  const ev = await events(await post("/api/prs/13/run", { overrides: { signals: { Reech: "low" } } }));
  expect(ev).toEqual([{ event: "error", data: { message: 'no signal named "Reech"' } }]);
});

test("quoted lines are redacted: PR 1's .env.example password at base never reaches the screen", () => {
  const m = loadMeasured(1);
  const line = redactingQuoter(m)(".env.example:9")!;
  expect(line).toBe("OPENOBSERVE_PASSWORD=[REDACTED:credential]");
});

// The model, with a key from the request, against a local stand-in for the API.
const logFile = join(tmpdir(), `demo-api-test-${process.pid}.jsonl`);
const seenKeys: string[] = [];
const ANSWER = {
  proposals: [{ signal: "Reach", change: "propose", value: "low", cite: "apps/web/src/App.tsx:593", reasoning: "The menu mounts under one route." }],
  failure_modes: { modes: ["domain", "infra"], reason: "r" },
  coherence: { coherent: true, mismatches: [] },
  prose: "One. Two.",
};
const stand = Bun.serve({
  port: 0,
  fetch(req) {
    seenKeys.push(req.headers.get("authorization") ?? req.headers.get("x-api-key") ?? "");
    return Response.json({
      id: "msg_test", type: "message", role: "assistant", model: "claude-sonnet-5-5",
      content: [{ type: "text", text: JSON.stringify(ANSWER) }], stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    });
  },
});
process.env.ANTHROPIC_BASE_URL = `http://localhost:${stand.port}`;
setLlmLogPath(logFile);
afterAll(() => {
  stand.stop(true);
  delete process.env.ANTHROPIC_BASE_URL;
  resetLlmLog();
});

test("with a key: a progress event per call, the key used and never echoed, nothing logged to disk", async () => {
  const res = await post("/api/prs/13/run", { overrides: { model: true }, modelKey: "sk-page-only" });
  const ev = await events(res.clone());
  const progress = ev.filter((e) => e.event === "progress").map((e) => `${e.data.purpose}:${e.data.phase}`);
  expect(progress.slice(0, 2)).toEqual(["model contract:start", "model contract:end"]);
  expect(progress.filter((p) => p === "reason wording:end").length).toBeGreaterThan(0);
  const r = ev.find((e) => e.event === "result")!.data as RunResult;
  expect(r.model).toBe(true);
  // The canned proposal cites a line on the measured path, so code accepts it and the grid moves.
  const reach = r.brief.signals.find((s) => s.name === "Reach")!;
  expect([reach.value, reach.source, r.cell.damage]).toEqual(["low", "model (cited)", "low"]);
  expect(seenKeys.every((k) => k.includes("sk-page-only"))).toBe(true);
  expect((await res.text()).includes("sk-page-only")).toBe(false);
  expect(existsSync(logFile)).toBe(false);
}, 30_000);

test("model switched off with a key: no call is made", async () => {
  const before = seenKeys.length;
  const r = await resultOf(await post("/api/prs/13/run", { overrides: { model: false }, modelKey: "sk-page-only" }));
  expect([r.model, seenKeys.length]).toEqual([false, before]);
});
