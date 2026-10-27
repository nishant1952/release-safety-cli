import { expect, test } from "bun:test";
import { loadDiff, parseUnifiedDiff, type Diff } from "../src/diff";
import { nonCodeKind } from "../src/files";
import { detectionSignal } from "../src/signals/detection";
import { failureModeFacts, failureModeSignal } from "../src/signals/failureMode";
import { pathFacts, pathSignal } from "../src/signals/path";
import { reachFacts, reachSignal } from "../src/signals/reach";
import { buildBrief } from "../src/run";
import { REPO } from "./fixture";

test("non-code kinds by path", () => {
  const cases: [string, string | null][] = [
    ["README.md", "docs"],
    ["docs/notes.txt", "docs"],
    ["docs/guide.mdx", "docs"],
    ["apps/web/src/styles.css", "stylesheet"],
    ["src/theme.scss", "stylesheet"],
    ["bun.lock", "lockfile"],
    ["pnpm-lock.yaml", "lockfile"],
    [".github/workflows/deploy.yml", "workflow"],
    ["docker-compose.prod.yml", "compose"],
    ["scripts/deploy-prod.sh", "script"],
    [".cursor/rules/x.mdc", "editor config"],
    [".claude/agents/reviewer.md", "editor config"],
    [".vscode/settings.json", "editor config"],
    ["src/App.tsx", null],
    ["package.json", null],
    ["src/deploy.sh", null], // a shell script outside scripts/ is not on the list
  ];
  expect(cases.map(([p]) => [p, nonCodeKind(p)])).toEqual(cases);
});

test("README only (PR 4): not a code path and no reach, both measured; failure mode none", () => {
  const diff = loadDiff(REPO, "f26e6b00..fab0ae6a");
  const path = pathSignal(pathFacts(diff));
  expect([path.value, path.source, path.note]).toEqual(["not a code path", "measured", "every changed file is a non-code file: README.md (docs)"]);
  const reach = reachSignal(reachFacts(diff));
  expect([reach.value, reach.source]).toEqual(["none", "measured"]);
  expect(failureModeSignal(failureModeFacts(diff)).value).toBe("none (docs, tests or editor config only)");
});

test("workflow and README (PR 3): not a code path; the workflow keeps its infra failure mode", () => {
  const diff = loadDiff(REPO, "d4a40df7..0fb48b97");
  expect(pathSignal(pathFacts(diff)).value).toBe("not a code path");
  expect(reachSignal(reachFacts(diff)).value).toBe("none");
  expect(failureModeSignal(failureModeFacts(diff)).value).toBe("infra");
});

test("code mixed with stylesheets (PR 10): judged on the code file, stylesheets listed with no path", () => {
  const diff = loadDiff(REPO, "f9a802d6..0d3e9d15");
  const facts = pathFacts(diff);
  expect([...facts.chains.keys()]).toEqual(["apps/web/src/games/meta.ts"]);
  const path = pathSignal(facts);
  expect([path.value, path.source]).toEqual(["live", "declared"]);
  expect(path.note).toEndWith("Not code paths, listed only: apps/web/src/games/outcome.css (stylesheet), apps/web/src/styles.css (stylesheet)");
  const fm = failureModeFacts(diff);
  expect(fm.perFile.map((p) => p.mode)).toEqual(["domain", "cosmetic", "cosmetic"]);
  expect(failureModeSignal(fm).value).toBe("domain");
});

test("a stylesheet-only change has a cosmetic failure mode and no detector to find", () => {
  const files = parseUnifiedDiff(["diff --git a/src/a.css b/src/a.css", "@@ -1 +1 @@", "-a { color: red; }", "+a { color: blue; }", ""].join("\n"));
  const diff: Diff = { repo: "", base: "b", head: "h", files, added: files.flatMap((f) => f.added), removed: files.flatMap((f) => f.removed), buckets: {} };
  const fm = failureModeFacts(diff);
  expect([failureModeSignal(fm).value, fm.modes]).toEqual(["cosmetic", []]);
  const facts = { modes: fm.modes, emits: [], healthChecks: [], alertFiles: [], watched: [], authAlerts: [], domainTests: [], catalog: null };
  const det = detectionSignal(facts);
  expect([det.value, det.note]).toEqual(["fast", "no failure mode a detector must watch (docs, tests, editor config or stylesheets only)"]);
});

test("README only (PR 4): low damage; the window is still long (undo by full build and deploy, assumed), so Staged", async () => {
  const b = await buildBrief({ repo: REPO, range: "f26e6b00..fab0ae6a", prFile: new URL("./fixtures/pr4.json", import.meta.url).pathname });
  expect(b.mode).toBe("Staged");
  expect(b.modeLine).toBe("Grid: low damage x long window = Staged.");
  expect(b.reasons[0].text).toBe("Low damage: the path is not a code path (measured).");
}, 30_000);
