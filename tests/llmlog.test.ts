import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { askJson } from "../src/llm";
import { costOf, llmSummary, resetLlmLog, setLlmLogPath, tokensOf } from "../src/llmlog";
import "./fixture";

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_BASE_URL;
  resetLlmLog();
  setLlmLogPath("logs/llm-calls.jsonl");
});

const stubApi = () =>
  Bun.serve({
    port: 0,
    fetch: () =>
      Response.json({
        id: "msg_x", type: "message", role: "assistant", model: "claude-opus-5-5",
        content: [{ type: "text", text: '{"ok":true}' }], stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 2 },
      }),
  });

test("tokens and estimated cost at list prices; Bedrock IDs priced by their base model", () => {
  const t = tokensOf({
    input_tokens: 10_000,
    output_tokens: 2_000,
    cache_read_input_tokens: 1_000,
    cache_creation_input_tokens: 0,
    output_tokens_details: { thinking_tokens: 500 },
  });
  expect(t).toEqual({ input: 10_000, output: 2_000, thinking: 500, cache_read: 1_000, cache_write: 0, total: 13_000 });
  // Sonnet 5.5: 10k x $2 + 1k x $0.20 + 2k x $10, per million.
  expect(costOf("anthropic.claude-sonnet-5-5", "bedrock", t)).toEqual({ usd: 0.0402, basis: "Anthropic list price; Amazon Bedrock bills separately" });
  expect(costOf("claude-opus-5-5", "anthropic", t)!.usd).toBe(0.0802);
  expect(costOf("some-other-model", "anthropic", t)).toBeNull();
});

test("askJson logs request, response, request id, tokens, latency and cost (local stub API)", async () => {
  const server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const body = await req.json();
      return Response.json(
        {
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: body.model,
          content: [{ type: "text", text: '{"modes":["domain"]}' }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1200, output_tokens: 80, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
        { headers: { "request-id": "req_test_123" } },
      );
    },
  });
  const log = join(mkdtempSync(join(tmpdir(), "llmlog-")), "calls.jsonl");
  setLlmLogPath(log);
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_BASE_URL = `http://localhost:${server.port}`;
  try {
    const answer = await askJson<{ modes: string[] }>("sys", "user prompt", { type: "object" }, "failure-mode second opinion");
    expect(answer).toEqual({ modes: ["domain"] });
  } finally {
    server.stop(true);
  }
  const [entry] = readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  expect(entry).toMatchObject({
    purpose: "failure-mode second opinion",
    provider: "anthropic",
    model: "claude-opus-5-5",
    outcome: "ok",
    request_id: "req_test_123",
    request: { max_tokens: 4000, effort: "low", system: "sys", user: "user prompt" },
    response: { id: "msg_test", stop_reason: "end_turn", text: '{"modes":["domain"]}' },
    tokens: { input: 1200, output: 80, total: 1280 },
    cost: { usd: 0.0064, basis: "Anthropic list price" },
    error: null,
  });
  expect(entry.latency_ms).toBeGreaterThanOrEqual(0);
  expect(llmSummary()).toContain("1 calls (1 ok) on anthropic claude-opus-5-5, 1,200 input / 80 output tokens, est. $0.0064");
});

test("an API error is logged with its status and returns null", async () => {
  const server = Bun.serve({
    port: 0,
    fetch: () => Response.json({ type: "error", error: { type: "authentication_error", message: "bad key" } }, { status: 401, headers: { "request-id": "req_401" } }),
  });
  const log = join(mkdtempSync(join(tmpdir(), "llmlog-")), "calls.jsonl");
  setLlmLogPath(log);
  process.env.ANTHROPIC_API_KEY = "bad";
  process.env.ANTHROPIC_BASE_URL = `http://localhost:${server.port}`;
  try {
    expect(await askJson("s", "u", {}, "diff-vs-task coherence")).toBeNull();
  } finally {
    server.stop(true);
  }
  const entry = JSON.parse(readFileSync(log, "utf8").trim());
  expect([entry.outcome, entry.request_id, entry.error.status, entry.tokens]).toEqual(["api_error", "req_401", 401, null]);
});

test("an unwritable log path never changes the answer or crashes the run", async () => {
  const server = stubApi();
  setLlmLogPath("/dev/null/not-a-dir/calls.jsonl");
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_BASE_URL = `http://localhost:${server.port}`;
  try {
    expect(await askJson<{ ok: boolean }>("s", "u", {}, "reason wording")).toEqual({ ok: true });
  } finally {
    server.stop(true);
  }
  expect(llmSummary()).toContain("1 calls (1 ok)");
  expect(llmSummary()).toEndWith("Log not written (/dev/null/not-a-dir/calls.jsonl)");
});
