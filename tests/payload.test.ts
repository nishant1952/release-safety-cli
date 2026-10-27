// Round 4, Unit 1: nothing secret leaves the process. A local stand-in for the API records the bytes of
// every request, so the test checks what is sent, not what the code meant to send.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDiff } from "../src/diff";
import { Git } from "../src/git";
import { isSecretLine, redact, runGates, withoutSensitiveFiles } from "../src/gates";
import { resetLlmLog, setLlmLogPath } from "../src/llmlog";
import { buildBrief } from "../src/run";
import { REPO } from "./fixture";

const PR1 = { repo: REPO, range: "7eed1d0f..528c3084", prFile: new URL("./fixtures/pr1.json", import.meta.url).pathname };
// The value is read from the repo at base, so the test does not copy the credential into this repo.
const PASSWORD = new Git(REPO).show("7eed1d0f", ".env.example")!.match(/^OPENOBSERVE_PASSWORD=(.+)$/m)![1];
const ANSWER = {
  proposals: [],
  failure_modes: { modes: ["domain", "infra"], reason: "r" },
  coherence: { coherent: true, mismatches: [] },
  prose: "One. Two.",
};
const bodies: string[] = [];
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      bodies.push(await req.text());
      const text = JSON.stringify(ANSWER);
      return Response.json({
        id: "msg_test", type: "message", role: "assistant", model: "claude-sonnet-5-5",
        content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    },
  });
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_BASE_URL = `http://localhost:${server.port}`;
  setLlmLogPath(join(tmpdir(), `payload-test-${process.pid}.jsonl`));
});

afterAll(() => {
  server.stop(true);
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_BASE_URL;
  resetLlmLog();
});

test("PR 1: the OPENOBSERVE_PASSWORD value at base is absent from every byte sent; the call still goes out", async () => {
  expect(PASSWORD.length).toBeGreaterThan(8);
  const brief = await buildBrief(PR1);
  expect(bodies.length).toBeGreaterThan(0);
  for (const body of bodies) {
    expect(body.includes(PASSWORD)).toBe(false);
    expect(body.includes("diff --git a/.env.example")).toBe(false);
  }
  const atBase = brief.signals.find((s) => s.name === "Secrets present at base")!;
  expect([atBase.value, atBase.source, atBase.evidence]).toEqual(["observed", "measured", [".env.example:8", ".env.example:9"]]);
  expect(brief.confidence!.why.find((w) => w.startsWith("Secrets present at base"))).toContain(
    ".env.example:8 (email), .env.example:9 (credential): present in the repo before this change, not added by it",
  );
  // Not a gate trip: gate 1 scans added lines only, and PR 1 adds none with a secret.
  expect(brief.gates[0].checks.find((c) => c.name === "secrets")!.status).toBe("pass");
}, 60_000);

test("a secret in the PR body is redacted on the wire, and the marker is what the model receives", async () => {
  const pr = JSON.parse(await Bun.file(PR1.prFile).text());
  const prFile = join(tmpdir(), `payload-test-pr-${process.pid}.json`);
  await Bun.write(prFile, JSON.stringify({ ...pr, body: `${pr.body}\nKEY_PASSWORD=${PASSWORD}` }));
  bodies.length = 0;
  await buildBrief({ ...PR1, prFile });
  expect(bodies.length).toBeGreaterThan(0);
  expect(bodies.some((b) => b.includes(PASSWORD))).toBe(false);
  expect(bodies.some((b) => b.includes("KEY_PASSWORD=[REDACTED:credential]"))).toBe(true);
}, 60_000);

test("redaction: a context line's value is replaced with its kind; a variable reference is not a secret", () => {
  expect(redact(`  DB_PASSWORD=${PASSWORD}\n  url: postgres://app:hunter22@db:5432/x\n  owner: a@b.io`)).toEqual({
    text: "  DB_PASSWORD=[REDACTED:credential]\n  url: postgres://[REDACTED:URL credentials]@db:5432/x\n  owner: [REDACTED:email]",
    kinds: ["credential", "URL credentials", "email"],
  });
  expect(redact("-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAx7Qw1\n-----END RSA PRIVATE KEY-----").text).toBe(
    "[REDACTED:private key]\n[REDACTED:private key]\n-----END RSA PRIVATE KEY-----",
  );
  // A bare value in an env file is a secret on an added line; a reference to another value is not.
  expect([`KEY_PASSWORD=${PASSWORD}`, "apiKey: process.env.FW_PROJECT_API_KEY!,", "API_KEY=$PUBLIC_API_KEY", "password: hash(x)"].map(isSecretLine)).toEqual([
    true, false, false, false,
  ]);
});

test("env, secrets and credentials files are dropped from the payload entirely", () => {
  const section = (p: string) => `diff --git a/${p} b/${p}\n--- a/${p}\n+++ b/${p}\n@@ -1 +1 @@\n-a\n+b\n`;
  const { text, dropped } = withoutSensitiveFiles(["src/a.ts", ".env.production", "config/secrets.json", "deploy/credentials.yml", "src/secretsView.ts"].map(section).join(""));
  expect(dropped).toEqual([".env.production", "config/secrets.json", "deploy/credentials.yml"]);
  expect(text).toBe(section("src/a.ts") + section("src/secretsView.ts"));
});

test("PR 1's gate 1 is unchanged: no added line carries a secret", () => {
  expect(runGates(loadDiff(REPO, PR1.range), null)[0].checks.find((c) => c.name === "secrets")!.evidence).toEqual([]);
});
