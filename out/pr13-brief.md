# Release brief: Add a profile avatar menu beside logout

Range `30ac194..c5da112`, 5 files changed. Title: PR title, declared.

**Mode: Human.** Grid: high damage x long window = Human. Gates route to Human.

## Plan

| Step | Proposed |
|---|---|
| Exposure | Proposed by the system: Small slice, soak, widen; slice by flag percentage on `profile-avatar-menu` for the code inside it; edits outside the flag reach everyone at deploy (rollout mechanism is not extracted, so all-at-once is assumed). Approved or edited by the owner |
| Soak per step | Proposed by the system: Hours, scaled to traffic (traffic is not an input, so the hours are not scaled). Approved or edited by the owner |
| Guardrails | Same as staged, plus whatever the owner adds. domain: business checks, none found on the changed path; infra: resources and latency, watch latency metric arcade_web_profile_menu_load_ms, measured (apps/web/src/App.tsx:456, apps/web/src/App.tsx:471); error rate metric arcade_web_profile_menu_load_errors_total, measured (apps/web/src/App.tsx:466); deploy health check, declared (docker/compose.prod.yml:49, scripts/deploy-prod.sh:74) |
| Abort | Owner decides |
| Undo | flip `profile-avatar-menu` off (flag partial, measured) for the code inside the flag; revert and redeploy (time to revert: full build and deploy, assumed) for the edits outside it. |
| Paged | Named owner before step one: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local> (earlier author of the most touched files, measured from git; the repo has no CODEOWNERS file) |
| Sign-off | Required before step one |

## Top reasons

1. Gate 1 (Table stakes) is unverifiable, so it routes to a human: required CI checks: the PR export has no statusCheckRollup, so CI status is unknown.
   - no line to cite: this reason rests on something missing from the input or the repo
2. High damage: the path is live (declared) and the reach is high (assumed). measured: calls reach POST /api/client-telemetry (emitAction); GET /api/scoreboard (services.auth.me, services.scoreboard.forUser, services.scoreboard.leaderboard, sessionTokenFromRequest). Worth unknown because the metrics catalog declares no tier for any of its 21 entries, so reach is assumed wide.
   - `apps/web/src/App.tsx:554` `<ProfileMenu enabled={profileMenu} />`
   - `apps/web/src/App.tsx:596` `<Shell />`
   - `apps/web/src/App.tsx:593` `<Route`
   - `apps/api/src/interfaces/http/router.ts:80` `if (path === "/api/client-telemetry" && req.method === "POST") {`
   - and 1 more
3. Long window: undo is slow: the flag is partial (edits outside it use the revert path) and time to revert is full build and deploy (assumed); detection is slow (measured): domain: no business-level check (no value metric, no test of the changed domain files); infra: latency metric arcade_web_profile_menu_load_ms, error rate metric arcade_web_profile_menu_load_errors_total, deploy health check.
   - `.github/workflows/deploy.yml:15` `timeout-minutes: 5`
   - `apps/web/src/App.tsx:456` `void record(`
   - `apps/web/src/App.tsx:466` `void record("arcade_web_profile_menu_load_errors_total", 1, {`
   - `apps/web/src/App.tsx:471` `void record(`
4. Probability: measured confidence is low, so the mode moves one step toward caution (already Human, no further step).
   - no line to cite: this reason rests on something missing from the input or the repo

## Confidence

**low**
- no test that existed before the change covers any of the 4 changed code files (measured)
- single-author repo: familiarity dropped (W appendix)
- Failure mode (LLM second opinion): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- History: history unavailable (assumed), lowers confidence, does not raise risk (W 2)
- Confidence: review depth: unavailable (assumed), lowers confidence, does not raise risk (W 2)
- Confidence: diff vs task (LLM): unavailable (assumed), lowers confidence, does not raise risk (W 2)

## The one unknown

No single assumed input changes the mode. Considered: gate 1 required CI checks (unverifiable); Reach (high); Time to revert (full build and deploy); Failure mode (LLM second opinion) (cannot move the mode); History (cannot move the mode); Confidence: review depth (cannot move the mode); Confidence: diff vs task (LLM) (cannot move the mode). With all of them at their favourable value the mode is Human, so the call rests on what is known: Detection apparatus slow (measured), without which it would be Staged; confidence low (measured), without which it would be Staged.

## Disagreements

Disagreements: none between sources.

## Gates

| Gate | Result | Route | Checks |
|---|---|---|---|
| 1. Table stakes | unverifiable | human | secrets: pass (measured); PII: pass (measured); hardcoded environment values: pass (measured); required CI checks: unverifiable (assumed) |
| 2. API contract | pass | none | breaking change to route, schema or public signature: pass (measured); additive API surface: pass (measured) |
| 3. Destructive schema or data change | pass | none | destructive schema change or mutation of existing data: pass (measured) |

Gate 2, additive API surface:
- `apps/api/src/infrastructure/observability/metrics-catalog.ts:128` `name: "arcade_web_profile_menu_opens_total",`
- `apps/api/src/infrastructure/observability/metrics-catalog.ts:135` `name: "arcade_web_profile_menu_load_success_total",`
- `apps/api/src/infrastructure/observability/metrics-catalog.ts:142` `name: "arcade_web_profile_menu_load_errors_total",`
- `apps/api/src/infrastructure/observability/metrics-catalog.ts:149` `name: "arcade_web_profile_menu_load_ms",`

## Provenance

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible or irreversible | reversible | measured | none. no persisted write, outbound side effect, queue publish or external API client in 243 added lines |
| Feature flag | partial | measured | `apps/web/src/App.tsx:428`, `apps/web/src/App.tsx:532`, `apps/web/src/App.tsx:533`, `apps/web/src/App.tsx:539` +19. flag `profile-avatar-menu` (default false): 85 added lines inside the flag, 6 control lines, 98 outside it (blank, comment and bracket-only lines are not classed) (in apps/api/src/infrastructure/observability/metrics-catalog.ts, apps/web/src/App.tsx, apps/web/src/fireweave/fw-tracker.ts, apps/web/src/styles.css). Whether the flag exists in production and both states are tested is not checked |
| Path | live | declared | `apps/api/src/infrastructure/observability/openobserve.ts:9`, `apps/api/src/bootstrap.ts:12`, `apps/api/src/main.ts:2`, `apps/web/src/main.tsx:5` +6. apps/api/src/infrastructure/observability/metrics-catalog.ts reaches apps/api/src/main.ts in 3 import(s); apps/web/src/App.tsx reaches apps/web/src/main.tsx in 1 import(s); apps/web/src/fireweave/fw-providers.ts reaches apps/web/src/main.tsx in 2 import(s); apps/web/src/styles.css reaches apps/web/src/main.tsx in 1 import(s); ProfileMenu < Shell is mounted by route (layout) with child routes (index), play/:gameId, scoreboard, admin behind RequireAuth; not imported from any entry point: apps/web/src/fireweave/fw-tracker.ts. Import graph and routes measured; entry points declared by package.json scripts and index.html: apps/api/src/main.ts, apps/web/src/main.tsx |
| Reach | high | assumed | `apps/web/src/App.tsx:442`, `apps/web/src/observability/openobserve.ts:34`, `apps/web/src/observability/openobserve.ts:23`, `apps/web/src/App.tsx:451` +7. measured: calls reach POST /api/client-telemetry (emitAction); GET /api/scoreboard (services.auth.me, services.scoreboard.forUser, services.scoreboard.leaderboard, sessionTokenFromRequest). Worth unknown because the metrics catalog declares no tier for any of its 21 entries, so reach is assumed wide |
| Failure mode | domain, infra | measured | `apps/api/src/infrastructure/observability/metrics-catalog.ts:127`, `apps/web/src/App.tsx:1`, `apps/web/src/fireweave/fw-providers.ts:275`, `apps/web/src/fireweave/fw-tracker.ts:19` +1. rules on touched paths: apps/api/src/infrastructure/observability/metrics-catalog.ts -> infra; apps/web/src/App.tsx -> domain; apps/web/src/fireweave/fw-providers.ts -> infra; apps/web/src/fireweave/fw-tracker.ts -> infra; apps/web/src/styles.css -> domain. Matched on file path; each evidence line is the file's first change |
| Failure mode (LLM second opinion) | unavailable | assumed | none. no ANTHROPIC_API_KEY; rules only |
| Detection apparatus | slow | measured | `apps/web/src/App.tsx:456`, `apps/web/src/App.tsx:466`, `apps/web/src/App.tsx:471`, `docker/compose.prod.yml:49` +1. domain: no business-level check (no value metric, no test of the changed domain files); infra: latency metric arcade_web_profile_menu_load_ms, error rate metric arcade_web_profile_menu_load_errors_total, deploy health check. Every failure mode needs its detector, so detection is slow. 5 metric/log calls on changed lines (arcade_web_profile_menu_opens_total: count, arcade_web_profile_menu_load_success_total: count, arcade_web_profile_menu_load_ms: latency, arcade_web_profile_menu_load_errors_total: error rate). Checked in the repo only; alert config outside the repo (OpenObserve) is not an input |
| Time to revert | full build and deploy | assumed | `.github/workflows/deploy.yml:15`. no one-click rollback in 1 workflow file(s); CI run history is not an input, so pipeline duration is not measured. Declared job timeout: 5 min (a bound, not a measurement). Unknown rounds to slow: a full build and deploy to revert (W 2) |
| History | history unavailable | assumed | none. measured: 8 earlier commits touch the changed files, 0 reverts, 0 fix commits; repo history before base spans 4h (2026-10-06 to 2026-10-06). Too thin to read as a record (thin: < 5 commits or < 7 days) |
| Provenance | agent-assisted (Cursor) | measured | `commit c5da112`. commit trailers: Cursor <cursoragent@cursor.com>; PR description: "Made with Cursor"; author(s) in git: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>. Whether a human was in the loop is not verifiable from the input |
| Confidence: test coverage | 0 of 4 changed code files have a test | measured | none. tests that import a changed file; 0 covered by tests that existed before the change. Uncovered: apps/api/src/infrastructure/observability/metrics-catalog.ts, apps/web/src/App.tsx, apps/web/src/fireweave/fw-providers.ts, apps/web/src/fireweave/fw-tracker.ts |
| Confidence: familiarity | single-author repo, people part dropped | measured | none. repo authors before base: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>; per file: apps/api/src/infrastructure/observability/metrics-catalog.ts (1), apps/web/src/App.tsx (1), apps/web/src/fireweave/fw-providers.ts (1), apps/web/src/fireweave/fw-tracker.ts (1), apps/web/src/styles.css (1). Reviewer familiarity needs review data: the PR export has no reviews field |
| Confidence: review depth | unavailable | assumed | none. the PR export has no reviews field |
| Confidence: diff vs task (LLM) | unavailable | assumed | none. no ANTHROPIC_API_KEY |

## Changed files

- `apps/api/src/infrastructure/observability/metrics-catalog.ts` (modified, +28 -0)
- `apps/web/src/App.tsx` (modified, +145 -16)
- `apps/web/src/fireweave/fw-providers.ts` (modified, +1 -1)
- `apps/web/src/fireweave/fw-tracker.ts` (modified, +3 -1)
- `apps/web/src/styles.css` (modified, +66 -0)
