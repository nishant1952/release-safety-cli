import { expect, test } from "bun:test";
import { addProse } from "../src/prose";
import { makeQuoter, renderFull, renderShort } from "../src/render";
import { buildBrief } from "../src/run";
import { RANGE, REPO, PR_JSON } from "./fixture";

// One brief, two layouts: both render from the same object, never from each other.
let built: Promise<{ short: string; full: string }> | null = null;
const layouts = () =>
  (built ??= buildBrief({ repo: REPO, range: RANGE, prFile: PR_JSON }).then((b) => {
    const quote = makeQuoter(REPO, b.base, b.head);
    return { short: renderShort(b, quote), full: renderFull(b, quote) };
  }));
const golden = (name: string) => Bun.file(new URL(`../out/${name}`, import.meta.url)).text();

test("out/pr13.md is exactly the short layout the tool renders for PR 13", async () => {
  expect((await layouts()).short).toBe(await golden("pr13.md"));
}, 30_000);

test("out/pr13-full.md is exactly the full layout, unchanged by the rename", async () => {
  expect((await layouts()).full).toBe(await golden("pr13-full.md"));
}, 30_000);

test("the short layout of PR 13 is under half the words of the full one", async () => {
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const { short, full } = await layouts();
  expect(words(short)).toBeLessThan(words(full) / 2);
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
  { source: /outside the repo/i, honest: /alert config outside the repo is not an input/ },
];

for (const layout of ["short", "full"] as const)
  test(`the ${layout} brief never describes the contents of an input the run did not read`, async () => {
    // A parenthetical that is only a name, like "(OpenObserve)", is a label, not a clause: drop it before splitting,
    // unless the name is itself an unread source, like "(RCA)".
    const label = /\s*\([A-Z][\w-]*\)/g;
    const lines = (await layouts())[layout]
      .split("\n")
      .map((l) => l.replace(label, (m) => (UNREAD.some(({ source }) => source.test(m)) ? m : "")));
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
