// Round 5: the short layout drops detail, never anything unfavourable. A gate that trips and a refused model
// proposal are shown in full in the short view too.
import { expect, test } from "bun:test";
import type { Brief } from "../src/brief";
import type { ContractAnswer } from "../src/model";
import { makeQuoter, renderFull, renderShort } from "../src/render";
import { buildBrief } from "../src/run";
import { PR_JSON, RANGE, REPO } from "./fixture";

test("PR 5: gates trip, so the short view has the full gate table and its evidence lines", async () => {
  const b = await buildBrief({ repo: REPO, range: "549a1bc4..3b9c7ed7", prFile: new URL("./fixtures/pr5.json", import.meta.url).pathname });
  const quote = makeQuoter(REPO, b.base, b.head);
  const short = renderShort(b, quote);
  const gates = (md: string) => md.slice(md.indexOf("## Gates\n"), md.indexOf("\n## ", md.indexOf("## Gates\n") + 1));
  expect(b.gates.map((g) => g.status)).toEqual(["trip", "trip", "trip"]);
  expect(short).toContain("| 1. Table stakes | trip | human |");
  expect(short).toContain("Gate 1, hardcoded environment values:\n- `apps/api/src/main.ts:35` `console.log('arcade centre on http://localhost:${server.port}');`");
  expect(short).toContain("Gate 3, destructive schema change or mutation of existing data:\n- `server/src/db.ts@549a1bc:32` `CREATE TABLE IF NOT EXISTS games (`");
  // The same table and evidence lines the full layout shows.
  expect(gates(short)).toBe(gates(renderFull(b, quote)));
  // A secret already in the repo is shown in full too.
  expect(short).toContain("## Secrets present at base\n\n.env.example:9 (email), .env.example:10 (credential)");
}, 60_000);

test("a refused model proposal appears in the short view", async () => {
  const answer: ContractAnswer = {
    // The flag read is evidence for "flag partial" (measured), so it cannot show low reach: refused.
    proposals: [{ signal: "Reach", change: "propose", value: "low", cite: "apps/web/src/App.tsx:533", reasoning: "One sentence." }],
    failure_modes: { modes: ["domain", "infra"], reason: "r" },
    coherence: { coherent: true, mismatches: [] },
  };
  const ask = (async (_s: string, _u: string, _schema: unknown, purpose: string) => (purpose === "model contract" ? answer : { prose: "One. Two." })) as any;
  const b = await buildBrief({ repo: REPO, range: RANGE, prFile: PR_JSON, ask });
  const short = renderShort(b, makeQuoter(REPO, b.base, b.head));
  const refused = b.disagreements!.filter((d) => d.startsWith("model proposed"));
  expect(refused.length).toBe(1);
  expect(short).toContain("Sources disagree on 1 point, listed below.");
  expect(short).toContain(`## Disagreements\n\n- ${refused[0]}\n`);
  expect(short).toContain("| Model | claude-sonnet-5-5 | model | 0 proposals accepted, 1 refused |");
}, 30_000);

test("lowered confidence names what lowered it, never a note that lowers nothing", () => {
  const b: Brief = {
    base: "a".repeat(40), head: "b".repeat(40), title: "t", titleSource: "PR title, declared", files: [], gates: [], signals: [],
    mode: "Staged", modeLine: null, plan: null, reasons: [], unknown: null, disagreements: [],
    confidence: {
      level: "low",
      measuredLevel: "high",
      measured: ["single-author repo: familiarity dropped (W appendix)"],
      why: ["single-author repo: familiarity dropped (W appendix)", "History: history unavailable (assumed), lowers confidence, does not raise risk (W 2)"],
    },
  };
  const short = renderShort(b, () => null);
  expect(short).toContain("Confidence low, high from measured facts. Lowered by: History: history unavailable (assumed).");
  expect(short).not.toContain("Lowered by: single-author");
});
