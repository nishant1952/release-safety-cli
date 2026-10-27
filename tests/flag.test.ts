import { expect, test } from "bun:test";
import { loadDiff } from "../src/diff";
import { featureFlag, flagFacts } from "../src/signals/flag";
import { RANGE, REPO } from "./fixture";

const diff = loadDiff(REPO, RANGE);
const facts = flagFacts(diff);
const cls = (r: string) => facts.lines.get(r);

test("PR 13: one control point, default false", () => {
  expect(facts.flags).toEqual([{ key: "profile-avatar-menu", defaultValue: "false", at: "apps/web/src/App.tsx:533" }]);
});

test("PR 13: control lines are the flag client import, the anchor, the read, the ternary, the prop, the guard and the dev config", () => {
  const control = [...facts.lines].filter(([, c]) => c === "control").map(([r]) => r);
  expect(control).toEqual([
    "apps/web/src/App.tsx:16", // import { fw } ... (its one reference is the flag read)
    "apps/web/src/App.tsx:428", // if (!enabled || !user) return null;
    "apps/web/src/App.tsx:532", // @fireweave-controlpoint profile-avatar-menu
    "apps/web/src/App.tsx:533", // getBooleanValue("profile-avatar-menu", false)
    "apps/web/src/App.tsx:539", // {profileMenu ? null : (
    "apps/web/src/App.tsx:554", // <ProfileMenu enabled={profileMenu} />
    "apps/web/src/fireweave/fw-providers.ts:275", // local: { controlPoints: { "profile-avatar-menu": true } }
  ]);
});

test("PR 13: inside vs outside the flag's branch", () => {
  expect(cls("apps/web/src/App.tsx:430")).toBe("inside"); // const initial = ... (after the guard)
  expect(cls("apps/web/src/App.tsx:442")).toBe("inside"); // void record(opens_total) in toggle
  expect(cls("apps/web/src/App.tsx:540")).toBe("inside"); // <p className="hint"> (flag-off branch)
  expect(cls("apps/web/src/App.tsx:405")).toBe("outside"); // useAuth() runs before the guard
  expect(cls("apps/web/src/App.tsx:412")).toBe("outside"); // useEffect registered before the guard
  expect(cls("apps/web/src/App.tsx:553")).toBe("outside"); // <div className="topbar-actions"> for everyone
  expect(cls("apps/web/src/styles.css:715")).toBe("outside");
  expect(cls("apps/web/src/fireweave/fw-tracker.ts:20")).toBe("outside"); // exported FW_STAMPS: no reference in the repo, so not moved by call site
  expect(cls("apps/web/src/App.tsx:476")).toBeUndefined(); // ");" bracket-only line is not classed
  // By call site: `record` is used only inside the menu's flag branch; ProfileMenu is rendered for everyone.
  expect(cls("apps/web/src/App.tsx:17")).toBe("inside"); // import { metric as record } ...
  expect(cls("apps/web/src/App.tsx:404")).toBe("outside"); // function ProfileMenu: rendered at 554 outside the flag
  expect(facts.byCallSite.map((c) => [c.name, c.at, c.cls])).toEqual([
    ["fw", "apps/web/src/App.tsx:16", "control"],
    ["record", "apps/web/src/App.tsx:17", "inside"],
  ]);
});

test("PR 13: signal is partial, measured", () => {
  const s = featureFlag(diff, facts);
  expect(s.value).toBe("partial");
  expect(s.source).toBe("measured");
  expect(s.note).toStartWith(
    "flag `profile-avatar-menu` (default false): 86 added lines inside the flag, 7 control lines, 96 outside it",
  );
  expect(s.evidence.slice(0, 7)).toEqual([
    "apps/web/src/App.tsx:16",
    "apps/web/src/App.tsx:428",
    "apps/web/src/App.tsx:532",
    "apps/web/src/App.tsx:533",
    "apps/web/src/App.tsx:539",
    "apps/web/src/App.tsx:554",
    "apps/web/src/fireweave/fw-providers.ts:275",
  ]);
});

test("a module-level component, its constant, import and type, used only under the flag, are inside: full", async () => {
  const { fixtureRepo } = await import("./tmprepo");
  const { repo, range } = fixtureRepo("flag-callsite", ["base", "head"]);
  const d = loadDiff(repo, range);
  const f = flagFacts(d);
  expect(f.byCallSite.map((c) => [c.name, c.at, c.cls])).toEqual([
    ["Badge", "src/App.tsx:2", "inside"],
    ["BANNER_TEXT", "src/App.tsx:4", "inside"],
    ["Banner", "src/App.tsx:6", "inside"],
    ["BadgeProps", "src/Badge.tsx:1", "inside"],
    ["Badge", "src/Badge.tsx:3", "inside"],
  ]);
  const s = featureFlag(d, f);
  expect(s.value).toBe("full");
  expect([...f.lines].filter(([, c]) => c === "outside")).toEqual([]);
});

test("a declaration that runs a call when the module loads stays outside, flag or not", async () => {
  const { fixtureRepo } = await import("./tmprepo");
  const { repo, range } = fixtureRepo("flag-callsite", ["base", "head-load"]);
  const d = loadDiff(repo, range);
  const f = flagFacts(d);
  expect(f.lines.get("src/App.tsx:4")).toBe("outside"); // const BANNER_TEXT = String(Date.now());
  expect(f.lines.get("src/App.tsx:7")).toBe("inside"); // Banner's body: only rendered under the flag
  expect(featureFlag(d, f).value).toBe("partial");
});
