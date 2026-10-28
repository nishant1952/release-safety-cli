// The demo split: measure reads the repo and returns plain JSON; decide renders a brief from it. A Measured
// written to disk and read back must give the same brief, byte for byte, as the CLI.
import { expect, test } from "bun:test";
import { loadPr } from "../src/pr";
import { decide, measure } from "../src/run";
import { PR_JSON, RANGE, REPO } from "./fixture";

test("PR 13: Measured survives a JSON round trip, and decide on it renders out/pr13.md", async () => {
  const measured = measure(REPO, RANGE, await loadPr(PR_JSON));
  const text = JSON.stringify(measured);
  const back = JSON.parse(text);
  expect(back).toEqual(measured);
  expect(JSON.stringify(back)).toBe(text);
  const { brief, markdown, cell } = await decide(back);
  expect(markdown).toBe(await Bun.file(new URL("../out/pr13.md", import.meta.url)).text());
  expect([brief.mode, cell.damage, cell.window, cell.gridMode, cell.gateMode, cell.shifted]).toEqual(["Human", "high", "long", "Human", null, false]);
  // The flag's line classes are kept as entries: 86 inside, 7 control, 96 outside (Round 3, Unit 1).
  const count = (c: string) => measured.flag.lines.filter(([, v]) => v === c).length;
  expect([count("inside"), count("control"), count("outside")]).toEqual([86, 7, 96]);
}, 60_000);
