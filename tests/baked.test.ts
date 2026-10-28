// Demo: the stored inputs (bun run demo:bake) are the demo's only input. Each of the 21 PRs, measured from the
// stored bare clone and exports and decided with no overrides, must render the CLI's brief in out/ byte for byte.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { measurePr, PR_NUMBERS } from "../apps/demo/server/fixtures";
import { decide } from "../src/run";
import "./fixture";

test("all 21 PRs, measured from the stored clone and exports, decide to their out/prN.md brief", async () => {
  const modes: string[] = [];
  for (const n of PR_NUMBERS) {
    const m = await measurePr(n);
    expect(m.repo.endsWith("apps/demo/fixtures/arcade.git")).toBe(true);
    const { markdown, brief } = await decide(m);
    expect({ n, same: markdown === readFileSync(new URL(`../out/pr${n}.md`, import.meta.url), "utf8") }).toEqual({ n, same: true });
    modes.push(`${n}:${brief.mode}`);
  }
  expect(modes.join(" ")).toBe(
    "1:Human 2:Human 3:Staged 4:Staged 5:Human 6:Staged 7:Human 8:Human 9:Human 10:Human 11:Human 12:Staged 13:Human 14:Human 15:Human 16:Human 17:Human 18:Human 19:Human 20:Human 21:Human",
  );
}, 180_000);

test("pr17 and pr18 share a range, so both exports match, as in data/", async () => {
  const m18 = await measurePr(18);
  expect(m18.prFiles.map((f) => f.split("/").slice(-2).join("/"))).toEqual(["pr17/pr.json", "pr18/pr.json"]);
}, 60_000);
