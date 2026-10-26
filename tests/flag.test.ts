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

test("PR 13: control lines are the anchor, the read, the ternary, the prop, the guard and the dev config", () => {
  const control = [...facts.lines].filter(([, c]) => c === "control").map(([r]) => r);
  expect(control).toEqual([
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
  expect(cls("apps/web/src/fireweave/fw-tracker.ts:20")).toBe("outside");
  expect(cls("apps/web/src/App.tsx:476")).toBeUndefined(); // ");" bracket-only line is not classed
});

test("PR 13: signal is partial, measured", () => {
  const s = featureFlag(diff, facts);
  expect(s.value).toBe("partial");
  expect(s.source).toBe("measured");
  expect(s.note).toStartWith(
    "flag `profile-avatar-menu` (default false): 85 added lines inside the flag, 6 control lines, 98 outside it",
  );
  expect(s.evidence.slice(0, 6)).toEqual([
    "apps/web/src/App.tsx:428",
    "apps/web/src/App.tsx:532",
    "apps/web/src/App.tsx:533",
    "apps/web/src/App.tsx:539",
    "apps/web/src/App.tsx:554",
    "apps/web/src/fireweave/fw-providers.ts:275",
  ]);
});
