import { expect, test } from "bun:test";
import { addProse } from "../src/prose";
import { makeQuoter, renderBrief } from "../src/render";
import { buildBrief } from "../src/run";
import { RANGE, REPO } from "./fixture";

const render = async () => {
  const b = await buildBrief({ repo: REPO, range: RANGE, prFile: null });
  return renderBrief(b, makeQuoter(REPO, b.base, b.head));
};

test("out/pr13-brief.md is exactly what the tool renders for PR 13", async () => {
  expect(await render()).toBe(await Bun.file(new URL("../out/pr13-brief.md", import.meta.url)).text());
}, 30_000);

// W 2: "Each signal is marked measured, declared or assumed, so the human knows what to distrust."
// Sources the tool never reads may be named only as unread; no line may describe their contents.
const UNREAD: { source: RegExp; honest: RegExp }[] = [
  // The preset cell "Hours, scaled to traffic" (W 3) states a rule, not a fact about traffic.
  { source: /traffic/i, honest: /traffic is not an input|scaled to traffic\s*$/ },
  { source: /CI run history/i, honest: /CI run history is not an input/ },
  { source: /rollout mechanism/i, honest: /rollout mechanism is not extracted/ },
  { source: /exists in production|both states are tested/i, honest: /is not checked/ },
  { source: /\bincidents?\b|\bRCA\b|on-call schedule|freeze calendar/, honest: /^$/ },
];

test("the brief never describes the contents of an input the run did not read", async () => {
  const lines = (await render()).split("\n");
  for (const { source, honest } of UNREAD)
    for (const line of lines.filter((l) => source.test(l)))
      for (const clause of line.split(/[;.(|]/).filter((c) => source.test(c))) expect({ clause, honest: honest.test(clause) }).toEqual({ clause, honest: true });
}, 30_000);

test("LLM prose only for reasons with evidence, and never without a key or when a secret was found", async () => {
  const reasons = [
    { text: "a", evidence: ["x.ts:1"] },
    { text: "b", evidence: [] },
  ];
  const fake = (async () => ({ prose: "Two sentences. Here." })) as any;
  const withKey = await addProse(reasons, () => "line", fake, true, false);
  expect(withKey).toEqual([{ text: "a", evidence: ["x.ts:1"], prose: "Two sentences. Here." }, { text: "b", evidence: [] }]);
  expect(await addProse(reasons, () => "line", fake, false, false)).toEqual(reasons);
  expect(await addProse(reasons, () => "line", fake, true, true)).toEqual(reasons);
});
