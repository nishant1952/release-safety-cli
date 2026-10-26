import { expect, test } from "bun:test";
import { makeQuoter, renderBrief } from "../src/render";
import { buildBrief } from "../src/run";
import { RANGE, REPO } from "./fixture";

const opts = { repo: REPO, range: RANGE, ignoreDeclared: false, prFile: null };

test("PR 13: quoter reads head lines and base-side lines from git", async () => {
  const b = await buildBrief(opts);
  const quote = makeQuoter(REPO, b.base, b.head);
  expect(quote("apps/web/src/App.tsx:533")).toBe(
    'const profileMenu = fw.controlPoints.getBooleanValue("profile-avatar-menu", false);',
  );
  expect(quote("apps/web/src/fireweave/fw-tracker.ts@30ac194:19")).toBe(
    "export const FW_STAMPS: Array<{ stampId: string }> = [];",
  );
});

test("PR 13: brief sections in order, with title, reasons, quoted gate evidence and provenance", async () => {
  const b = await buildBrief(opts);
  const md = renderBrief(b, makeQuoter(REPO, b.base, b.head));
  expect(md.split("\n")[0]).toBe("# Release brief: Add a profile avatar menu beside logout");
  const headings = md.split("\n").filter((l) => l.startsWith("## "));
  expect(headings).toEqual([
    "## Plan",
    "## Top reasons",
    "## Confidence",
    "## The one unknown",
    "## Disagreements",
    "## Gates",
    "## Provenance",
    "## Changed files",
  ]);
  expect(md).toContain(
    "1. Gate 1 (Table stakes) is unverifiable, so it routes to a human: required CI checks: no CI status was declared for this range.",
  );
  expect(md).toContain(
    '- `apps/api/src/infrastructure/observability/metrics-catalog.ts:128` `name: "arcade_web_profile_menu_opens_total",`',
  );
  expect(md).toContain("| Reversible or irreversible | reversible | measured |");
});

test("PR 13: same input, same brief", async () => {
  const render = async () => {
    const b = await buildBrief(opts);
    return renderBrief(b, makeQuoter(REPO, b.base, b.head));
  };
  expect(await render()).toBe(await render());
}, 30_000);
