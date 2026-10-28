// Demo: the API. A PR is measured on the server the first time it is run (in a worker, streaming each stage),
// from the stored clone and exports; later runs reuse that measurement and only redo the decision. With the right
// password the server's key is used and the model calls stream progress as server-sent events. Nothing is fetched
// except the model.
import { afterAll, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, redactingQuoter, run, type PrSummary, type RunResult } from "../apps/demo/server/app";
import { measurePr } from "../apps/demo/server/fixtures";
import { resetLlmLog, setLlmLogPath } from "../src/llmlog";
import "./fixture";

const app = createApp({ key: null, password: null });
// A server with a model key and a password, as its environment would give them.
const modelApp = createApp({ key: "sk-server-only", password: "pw-server-only" });
const get = (path: string) => app.fetch(new Request(`http://demo${path}`));
const request = (path: string, body: unknown) =>
  new Request(`http://demo${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const post = (path: string, body: unknown) => app.fetch(request(path, body));
const postModel = (path: string, body: unknown) => modelApp.fetch(request(path, body));

/** The events of a text/event-stream body, in order. */
async function events(res: Response): Promise<{ event: string; data: any }[]> {
  expect(res.headers.get("content-type")).toBe("text/event-stream");
  return (await res.text())
    .split("\n\n")
    .filter((b) => b.startsWith("event: "))
    .map((b) => ({ event: b.match(/^event: (.+)$/m)![1], data: JSON.parse(b.match(/^data: (.+)$/m)![1]) }));
}
const resultOf = async (res: Response) => (await events(res)).find((e) => e.event === "result")!.data as RunResult;

test("GET /api/prs: the 21 stored exports, number and title only; nothing is decided in advance", async () => {
  const prs: PrSummary[] = await (await get("/api/prs")).json();
  expect(prs.length).toBe(21);
  expect(prs.find((p) => p.n === 13)).toEqual({ n: 13, title: "Add a profile avatar menu beside logout" });
  expect((await post("/api/prs/22/run", {})).status).toBe(404);
});

test("first run of PR 13 measures it on the server, stage by stage, and renders out/pr13.md", async () => {
  const ev = await events(await post("/api/prs/13/run", { overrides: {} }));
  expect(ev.filter((e) => e.event === "stage").map((e) => e.data.stage)).toEqual([
    "diff", "gates", "feature flag", "path", "reach", "detection", "confidence", "reversibility", "revert and history",
  ]);
  const r = ev.find((e) => e.event === "result")!.data as RunResult;
  expect(r.markdown).toBe(readFileSync(new URL("../out/pr13.md", import.meta.url), "utf8"));
  expect(r.fullMarkdown).toBe(readFileSync(new URL("../out/pr13-full.md", import.meta.url), "utf8"));
  expect(r.measureMs).toBeGreaterThan(0);
  // The panel asks only for what was assumed: Reach, Time to revert (with minutes), History.
  expect(r.asks.signals.map((s) => [s.name, s.value])).toEqual([
    ["Reach", "high"], ["Time to revert", "full build and deploy"], ["History", "history unavailable"],
  ]);
  expect([r.asks.revertMinutes, r.asks.advisory, r.asks.stylesheets]).toEqual([true, [], 49]);
}, 60_000);

test("a re-run reuses the measurement and only redoes the decision, in under a second", async () => {
  const ev = await events(await post("/api/prs/13/run", { overrides: { signals: { Reach: "low" } } }));
  expect(ev.filter((e) => e.event === "stage").map((e) => e.data.stage)).toEqual(["measurement in memory reused"]);
  const r = ev.find((e) => e.event === "result")!.data as RunResult;
  expect([r.cell.damage, r.cell.window, r.cell.gridMode, r.brief.mode, r.model, r.measureMs]).toEqual(["low", "long", "Staged", "Human", false, null]);
  expect(r.ms).toBeLessThan(1000);
  // The measurement that came back from the worker and was reused gives the same brief as one measured fresh.
  const fresh = await run(await measurePr(13), { signals: { Reach: "low" } }, null);
  expect(r.markdown).toBe(fresh.markdown);
}, 60_000);

test("PR 11 asks about its red advisory check; PR 4 has nothing assumed but its revert time", async () => {
  const r11 = await resultOf(await post("/api/prs/11/run", {}));
  expect(r11.asks.advisory).toEqual(["FireWeave — flag contract (FAILURE)"]);
  expect(r11.asks.stylesheets).toBe(0);
  const r4 = await resultOf(await post("/api/prs/4/run", {}));
  expect([r4.asks.signals.map((s) => s.name), r4.asks.revertMinutes]).toEqual([["Time to revert", "History"], true]);
}, 60_000);

test("a bad body is a 400, an unknown signal an error event", async () => {
  expect((await post("/api/prs/13/run", { overrides: { revertMinutes: "five" } })).status).toBe(400);
  expect((await post("/api/prs/13/run", { overrides: { colour: "red" } })).status).toBe(400);
  const ev = await events(await post("/api/prs/13/run", { overrides: { signals: { Reech: "low" } } }));
  expect(ev.at(-1)).toEqual({ event: "error", data: { message: 'no signal named "Reech"' } });
}, 30_000);

test("quoted lines are redacted: PR 1's .env.example password at base never reaches the screen", async () => {
  const line = redactingQuoter(await measurePr(1))(".env.example:9")!;
  expect(line).toBe("OPENOBSERVE_PASSWORD=[REDACTED:credential]");
}, 30_000);

// The model, with the server's key, against a local stand-in for the API.
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

test("with the password: a progress event per call, the server's key used, neither echoed, nothing logged to disk", async () => {
  const res = await postModel("/api/prs/13/run", { overrides: { model: true }, password: "pw-server-only" });
  const ev = await events(res.clone());
  const progress = ev.filter((e) => e.event === "progress").map((e) => `${e.data.purpose}:${e.data.phase}`);
  expect(progress.slice(0, 2)).toEqual(["model contract:start", "model contract:end"]);
  expect(progress.filter((p) => p === "reason wording:end").length).toBeGreaterThan(0);
  const r = ev.find((e) => e.event === "result")!.data as RunResult;
  expect(r.model).toBe(true);
  // The canned proposal cites a line on the measured path, so code accepts it and the grid moves.
  const reach = r.brief.signals.find((s) => s.name === "Reach")!;
  expect([reach.value, reach.source, r.cell.damage]).toEqual(["low", "model (cited)", "low"]);
  expect(seenKeys.every((k) => k.includes("sk-server-only"))).toBe(true);
  const text = await res.text();
  expect([text.includes("sk-server-only"), text.includes("pw-server-only")]).toEqual([false, false]);
  expect(existsSync(logFile)).toBe(false);
}, 30_000);

test("the model without the right password, or on a server with no key, is refused before anything runs", async () => {
  const before = seenKeys.length;
  for (const password of [undefined, "", "wrong", "pw-server-onl"]) {
    const res = await postModel("/api/prs/13/run", { overrides: { model: true }, password });
    expect([res.status, await res.json()]).toEqual([401, { error: "wrong password for the model" }]);
  }
  const res = await post("/api/prs/13/run", { overrides: { model: true }, password: "pw-server-only" });
  expect([res.status, await res.json()]).toEqual([503, { error: "the model is not set up on this server" }]);
  expect((await postModel("/api/prs/13/run", { overrides: { model: true }, password: 5 })).status).toBe(400);
  expect(seenKeys.length).toBe(before);
});

test("model not asked for: no call is made and the password is not checked", async () => {
  const before = seenKeys.length;
  const r = await resultOf(await postModel("/api/prs/13/run", { overrides: {}, password: "wrong" }));
  expect([r.model, seenKeys.length]).toEqual([false, before]);
});
