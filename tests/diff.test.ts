import { expect, test } from "bun:test";
import { loadDiff, parseUnifiedDiff } from "../src/diff";
import { PR_DIFF, RANGE, REPO } from "./fixture";

const diff = loadDiff(REPO, RANGE);

test("PR 13: changed files, statuses and line counts", () => {
  expect(diff.base).toBe("30ac1949a47c2daa839f8a5f43aec9a84df3ff2a");
  expect(diff.head).toBe("c5da112a135dec70034f81d75b0f54e71a159227");
  expect(diff.files.map((f) => [f.path, f.status, f.added.length, f.removed.length])).toEqual([
    ["apps/api/src/infrastructure/observability/metrics-catalog.ts", "modified", 28, 0],
    ["apps/web/src/App.tsx", "modified", 145, 16],
    ["apps/web/src/fireweave/fw-providers.ts", "modified", 1, 1],
    ["apps/web/src/fireweave/fw-tracker.ts", "modified", 3, 1],
    ["apps/web/src/styles.css", "modified", 66, 0],
  ]);
  expect(diff.added.length).toBe(243);
  expect(diff.removed.length).toBe(18);
});

test("PR 13: added and removed lines carry the right file:line", () => {
  const at = (file: string, line: number) => diff.added.find((l) => l.file === file && l.line === line)?.text;
  expect(at("apps/web/src/App.tsx", 404)).toBe("function ProfileMenu({ enabled }: { enabled: boolean }) {");
  expect(at("apps/web/src/App.tsx", 533)).toBe(
    '  const profileMenu = fw.controlPoints.getBooleanValue("profile-avatar-menu", false);',
  );
  expect(at("apps/web/src/fireweave/fw-providers.ts", 275)).toBe(
    '    local: { controlPoints: { "profile-avatar-menu": true } },',
  );
  const removed = diff.removed.find((l) => l.file === "apps/web/src/fireweave/fw-tracker.ts");
  expect(removed).toEqual({
    file: "apps/web/src/fireweave/fw-tracker.ts",
    line: 19,
    text: "export const FW_STAMPS: Array<{ stampId: string }> = [];",
    side: "base",
  });
});

test("PR 13: files bucketed by directory", () => {
  expect(diff.buckets).toEqual({
    "apps/api/src/infrastructure/observability": ["apps/api/src/infrastructure/observability/metrics-catalog.ts"],
    "apps/web/src": ["apps/web/src/App.tsx", "apps/web/src/styles.css"],
    "apps/web/src/fireweave": ["apps/web/src/fireweave/fw-providers.ts", "apps/web/src/fireweave/fw-tracker.ts"],
  });
});

test("PR 13: git range yields the same changed lines as the PR 13 diff fixture", async () => {
  const fromFile = parseUnifiedDiff(await Bun.file(PR_DIFF).text());
  const key = (l: { file: string; line: number; text: string }) => `${l.file}:${l.line}:${l.text}`;
  expect(fromFile.flatMap((f) => f.added).map(key)).toEqual(diff.added.map(key));
  expect(fromFile.flatMap((f) => f.removed).map(key)).toEqual(diff.removed.map(key));
});
