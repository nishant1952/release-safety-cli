// Demo, Unit 3: the baked measurements (bun run demo:bake) are the demo's only input. Decided without overrides
// and quoted from the baked bare clone, each must render the CLI's brief in out/ byte for byte.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loadMeasured, PR_NUMBERS } from "../apps/demo/server/fixtures";
import { decide } from "../src/run";
import "./fixture";

test("all 21 baked PRs decide to their out/prN.md brief, with no key and no source repo", async () => {
  const modes: string[] = [];
  for (const n of PR_NUMBERS) {
    const m = loadMeasured(n);
    expect(m.repo.endsWith("apps/demo/fixtures/arcade.git")).toBe(true);
    const { markdown, brief } = await decide(m);
    expect({ n, same: markdown === readFileSync(new URL(`../out/pr${n}.md`, import.meta.url), "utf8") }).toEqual({ n, same: true });
    modes.push(`${n}:${brief.mode}`);
  }
  expect(modes.join(" ")).toBe(
    "1:Human 2:Human 3:Staged 4:Staged 5:Human 6:Staged 7:Human 8:Human 9:Human 10:Human 11:Human 12:Staged 13:Human 14:Human 15:Human 16:Human 17:Human 18:Human 19:Human 20:Human 21:Human",
  );
}, 60_000);

test("the baked exports are the 21 PR exports, and pr17 and pr18 share a range as in data/", () => {
  const m17 = loadMeasured(17);
  const m18 = loadMeasured(18);
  expect([m17.base, m17.head]).toEqual([m18.base, m18.head]);
  expect(m18.prFiles).toEqual(["apps/demo/fixtures/prs/pr17/pr.json", "apps/demo/fixtures/prs/pr18/pr.json"]);
  expect(loadMeasured(13).pr!.title).toBe(JSON.parse(readFileSync(new URL("./fixtures/pr13.json", import.meta.url), "utf8")).title);
});
