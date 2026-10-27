# Release brief: Put logo, games, and scoreboard on one header row

Range `9dfc79d..71e8103`, 6 files changed. Title: PR title, declared.

**Mode: Human.** Grid: high damage x long window = Human.

## Plan

| Step | Proposed |
|---|---|
| Exposure | Proposed by the system: Small slice, soak, widen; slice by flag percentage on `profile-avatar-menu` for the code inside it; edits outside the flag reach everyone at deploy (rollout mechanism is not extracted, so all-at-once is assumed). Approved or edited by the owner |
| Soak per step | Proposed by the system: Hours, scaled to traffic (traffic is not an input, so the hours are not scaled). Approved or edited by the owner |
| Guardrails | Same as staged, plus whatever the owner adds. domain: business checks, none found on the changed path; infra: resources and latency, watch deploy health check, declared (docker/compose.prod.yml:49, scripts/deploy-prod.sh:74) |
| Abort | Owner decides |
| Undo | flip `profile-avatar-menu` off (flag partial, measured) for the code inside the flag; revert and redeploy (time to revert: full build and deploy, assumed) for the edits outside it. |
| Paged | Named owner before step one: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local> (earlier author of the most touched files, measured from git; the repo has no CODEOWNERS file) |
| Sign-off | Required before step one |

## Top reasons

1. High damage: the path is live (declared) and the reach is high (assumed). measured: calls reach POST /api/client-telemetry (emitAction). Worth unknown because the metrics catalog declares no tier for any of its 23 entries, so reach is assumed wide. Not code paths, listed only: .fireweave/agent-instructions.md (docs), apps/web/src/styles.css (stylesheet).
   - `apps/web/src/main.tsx:4` `import { initFwHarness } from "./fireweave/fw-harness";`
   - `apps/web/src/App.tsx:610` `<Shell />`
   - `apps/web/src/App.tsx:607` `<Route`
   - `apps/api/src/interfaces/http/router.ts:80` `if (path === "/api/client-telemetry" && req.method === "POST") {`
2. Long window: undo is slow: the flag is partial (edits outside it use the revert path) and time to revert is full build and deploy (assumed); detection is slow (measured): domain: no business-level check (no value metric, no test of the changed domain files); infra: deploy health check.
   - `.github/workflows/deploy.yml:15` `timeout-minutes: 5`
   - `docker/compose.prod.yml:49` `healthcheck:`
   - `scripts/deploy-prod.sh:74` `if curl -fsS --max-time 1 "http://127.0.0.1/api/health" >/dev/null 2>&1; then`
3. Probability: measured confidence is low, so the mode moves one step toward caution (already Human, no further step).
   - no line to cite: this reason rests on something missing from the input or the repo

## Confidence

**low**
- no test that existed before the change covers any of the 4 changed code files (measured)
- single-author repo: familiarity dropped (W appendix)
- Failure mode (LLM second opinion): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- History: history unavailable (assumed), lowers confidence, does not raise risk (W 2)
- Confidence: diff vs task (LLM): unavailable (assumed), lowers confidence, does not raise risk (W 2)

## The one unknown

No single assumed input changes the mode. Considered: Reach (high); Time to revert (full build and deploy); Failure mode (LLM second opinion) (cannot move the mode); History (cannot move the mode); Confidence: diff vs task (LLM) (cannot move the mode). With all of them at their favourable value the mode is Human, so the call rests on what is known: Detection apparatus slow (measured), without which it would be Staged; confidence low (measured), without which it would be Staged.

## Disagreements

Disagreements: none between sources.

## Gates

| Gate | Result | Route | Checks |
|---|---|---|---|
| 1. Table stakes | pass | none | secrets: pass (measured); PII: pass (measured); hardcoded environment values: pass (measured); required CI checks: pass (measured) |
| 2. API contract | pass | none | breaking change to route, schema or public signature: pass (measured); additive API surface: pass (measured) |
| 3. Destructive schema or data change | pass | none | destructive schema change or mutation of existing data: pass (measured) |

Gate 2, additive API surface:
- `apps/api/src/infrastructure/observability/metrics-catalog.ts:156` `name: "arcade_web_header_views_total",`
- `apps/api/src/infrastructure/observability/metrics-catalog.ts:163` `name: "arcade_web_header_nav_clicks_total",`

## Provenance

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible or irreversible | reversible | measured | none. no persisted write, outbound side effect, queue publish or external API client in 204 added lines |
| Feature flag | partial | measured | `apps/web/src/App.tsx:720`, `apps/web/src/App.tsx:721`, `apps/web/src/App.tsx:722`, `apps/web/src/App.tsx:723` +17. flag `profile-avatar-menu` (default false), `header-arrangement` (default false): 0 added lines inside the flag, 7 control lines, 157 outside it (blank, comment, bracket-only, docs and editor config lines are not classed) (in apps/api/src/infrastructure/observability/metrics-catalog.ts, apps/web/src/App.tsx, apps/web/src/fireweave/fw-tracker.ts, apps/web/src/styles.css). Whether the flag exists in production and both states are tested is not checked |
| Path | live | declared | `apps/api/src/infrastructure/observability/openobserve.ts:9`, `apps/api/src/bootstrap.ts:12`, `apps/api/src/main.ts:2`, `apps/web/src/main.tsx:5` +4. apps/api/src/infrastructure/observability/metrics-catalog.ts reaches apps/api/src/main.ts in 3 import(s); apps/web/src/App.tsx reaches apps/web/src/main.tsx in 1 import(s); apps/web/src/fireweave/fw-providers.ts reaches apps/web/src/main.tsx in 2 import(s); Shell is mounted by route (layout) with child routes (index), play/:gameId, scoreboard, admin behind RequireAuth; not imported from any entry point: apps/web/src/fireweave/fw-tracker.ts. Import graph and routes measured; entry points declared by package.json scripts and index.html: apps/api/src/main.ts, apps/web/src/main.tsx. Not code paths, listed only: .fireweave/agent-instructions.md (docs), apps/web/src/styles.css (stylesheet) |
| Reach | high | assumed | `apps/web/src/App.tsx:29`, `apps/web/src/observability/openobserve.ts:34`, `apps/web/src/observability/openobserve.ts:23`, `apps/web/src/App.tsx:642` +6. measured: calls reach POST /api/client-telemetry (emitAction). Worth unknown because the metrics catalog declares no tier for any of its 23 entries, so reach is assumed wide. Not code paths, listed only: .fireweave/agent-instructions.md (docs), apps/web/src/styles.css (stylesheet) |
| Failure mode | domain, infra | measured | `.fireweave/agent-instructions.md:126`, `apps/api/src/infrastructure/observability/metrics-catalog.ts:155`, `apps/web/src/App.tsx:1`, `apps/web/src/fireweave/fw-providers.ts:275` +2. rules on touched paths: .fireweave/agent-instructions.md -> none; apps/api/src/infrastructure/observability/metrics-catalog.ts -> infra; apps/web/src/App.tsx -> domain; apps/web/src/fireweave/fw-providers.ts -> domain; apps/web/src/fireweave/fw-tracker.ts -> domain; apps/web/src/styles.css -> cosmetic. Matched on file path; each evidence line is the file's first change |
| Failure mode (LLM second opinion) | unavailable | assumed | none. no ANTHROPIC_API_KEY; rules only |
| Detection apparatus | slow | measured | `docker/compose.prod.yml:49`, `scripts/deploy-prod.sh:74`. domain: no business-level check (no value metric, no test of the changed domain files); infra: deploy health check. Every failure mode needs its detector, so detection is slow. 2 metric/log calls on changed lines (arcade_web_header_nav_clicks_total: count, arcade_web_header_views_total: count). Checked in the repo only; alert config outside the repo (OpenObserve) is not an input |
| Time to revert | full build and deploy | assumed | `.github/workflows/deploy.yml:15`. no one-click rollback in 1 workflow file(s); CI run history is not an input, so pipeline duration is not measured. Declared job timeout: 5 min (a bound, not a measurement). Unknown rounds to slow: a full build and deploy to revert (W 2) |
| History | history unavailable | assumed | none. measured: 10 earlier commits touch the changed files, 0 reverts, 0 fix commits; repo history before base spans 5h (2026-10-06 to 2026-10-06). Too thin to read as a record (thin: < 5 commits or < 7 days) |
| Provenance | agent-assisted (Cursor) | measured | `commit 71e8103`. commit trailers: Cursor <cursoragent@cursor.com>; PR description: "Made with Cursor"; author(s) in git: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>. Whether a human was in the loop is not verifiable from the input |
| Confidence: test coverage | 0 of 4 changed code files have a test | measured | none. tests that import a changed file; 0 covered by tests that existed before the change. Uncovered: apps/api/src/infrastructure/observability/metrics-catalog.ts, apps/web/src/App.tsx, apps/web/src/fireweave/fw-providers.ts, apps/web/src/fireweave/fw-tracker.ts |
| Confidence: familiarity | single-author repo, people part dropped | measured | none. repo authors before base: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>; per file: .fireweave/agent-instructions.md (1), apps/api/src/infrastructure/observability/metrics-catalog.ts (1), apps/web/src/App.tsx (1), apps/web/src/fireweave/fw-providers.ts (1), apps/web/src/fireweave/fw-tracker.ts (1), apps/web/src/styles.css (1). Reviewer familiarity needs review data: the PR export lists 0 reviews |
| Confidence: review depth | 0 reviews | declared | none. the PR export lists 0 reviews |
| Confidence: diff vs task (LLM) | unavailable | assumed | none. no ANTHROPIC_API_KEY |

## Changed files

- `.fireweave/agent-instructions.md` (modified, +2 -0)
- `apps/api/src/infrastructure/observability/metrics-catalog.ts` (modified, +14 -0)
- `apps/web/src/App.tsx` (modified, +143 -32)
- `apps/web/src/fireweave/fw-providers.ts` (modified, +1 -1)
- `apps/web/src/fireweave/fw-tracker.ts` (modified, +1 -0)
- `apps/web/src/styles.css` (modified, +43 -0)
