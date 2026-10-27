# Release brief: Add a profile avatar menu beside logout

Range `30ac194..c5da112`, 5 files changed. Title: PR title, declared.

**Mode: Human.** Grid: high damage x long window = Human.

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

1. High damage: the path is live (declared) and the reach is high (assumed). measured: calls reach POST /api/client-telemetry (emitAction); GET /api/scoreboard (services.auth.me, services.scoreboard.forUser, services.scoreboard.leaderboard, sessionTokenFromRequest). Worth unknown because the metrics catalog declares no tier for any of its 21 entries, so reach is assumed wide. Not code paths, listed only: apps/web/src/styles.css (stylesheet).
   *The damage is rated high because the path is declared live and its reach is assumed to be high, with measured calls reaching POST /api/client-telemetry (emitAction) and GET /api/scoreboard (services.auth.me, services.scoreboard.forUser, services.scoreboard.leaderboard, sessionTokenFromRequest), as seen at router.ts lines 80 and 197. Reach is assumed wide because the metrics catalog declares no tier for any of its 21 entries, and apps/web/src/styles.css is listed only as a stylesheet, not as a code path.* (LLM wording)
   - `apps/web/src/App.tsx:554` `<ProfileMenu enabled={profileMenu} />`
   - `apps/web/src/App.tsx:596` `<Shell />`
   - `apps/web/src/App.tsx:593` `<Route`
   - `apps/api/src/interfaces/http/router.ts:80` `if (path === "/api/client-telemetry" && req.method === "POST") {`
   - and 1 more
2. Long window: undo is slow: the flag is partial (edits outside it use the revert path) and time to revert is full build and deploy (assumed); detection is slow (measured): domain: no business-level check (no value metric, no test of the changed domain files); infra: latency metric arcade_web_profile_menu_load_ms, error rate metric arcade_web_profile_menu_load_errors_total, deploy health check.
   *Undoing this release is slow, because the flag covers only part of the change, so edits outside it must go through the revert path, which takes a full build and deploy (an assumption), and the deploy workflow at .github/workflows/deploy.yml:15 sets a 5-minute timeout. Detection is also slow (measured), because there is no business-level check, meaning no value metric and no test of the changed domain files, so only the infra signals apply: the latency metric arcade_web_profile_menu_load_ms, the error metric arcade_web_profile_menu_load_errors_total (both recorded in apps/web/src/App.tsx around lines 456-471), and the deploy health check.* (LLM wording)
   - `.github/workflows/deploy.yml:15` `timeout-minutes: 5`
   - `apps/web/src/App.tsx:456` `void record(`
   - `apps/web/src/App.tsx:466` `void record("arcade_web_profile_menu_load_errors_total", 1, {`
   - `apps/web/src/App.tsx:471` `void record(`
3. Probability: measured confidence is low, so the mode moves one step toward caution (already Human, no further step).
   - no line to cite: this reason rests on something missing from the input or the repo

## Confidence

**low**
- no test that existed before the change covers any of the 4 changed code files (measured)
- single-author repo: familiarity dropped (W appendix)
- LLM found mismatches between the diff and the task (can only lower confidence)
- History: history unavailable (assumed), lowers confidence, does not raise risk (W 2)

## The one unknown

No single assumed input changes the mode. Considered: Reach (high); Time to revert (full build and deploy); History (cannot move the mode). With all of them at their favourable value the mode is Human, and no single known input changes it either.

## Disagreements

- Disagreement: model proposed Reach = "low" (cites apps/web/src/App.tsx:533); refused by the measured evidence rule: apps/web/src/App.tsx:533 is evidence for Feature flag = partial (measured), and the flag does not cover the whole change, so its lines cannot show the change reaches fewer systems, is unreached, or is undone in one click
- Disagreement: model proposed Time to revert = "one-click rollback" (cites apps/web/src/App.tsx:533); refused by the measured evidence rule: apps/web/src/App.tsx:533 is evidence for Feature flag = partial (measured), and the flag does not cover the whole change, so its lines cannot show the change reaches fewer systems, is unreached, or is undone in one click; and by the citation domain rule: Time to revert needs a line in a workflow, deploy script, compose file or rollback config; apps/web/src/App.tsx:533 is not one

## Gates

| Gate | Result | Route | Checks |
|---|---|---|---|
| 1. Table stakes | pass | none | secrets: pass (measured); PII: pass (measured); hardcoded environment values: pass (measured); required CI checks: pass (measured) |
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
| Feature flag | partial | measured | `apps/web/src/App.tsx:16`, `apps/web/src/App.tsx:428`, `apps/web/src/App.tsx:532`, `apps/web/src/App.tsx:533` +19. flag `profile-avatar-menu` (default false): 86 added lines inside the flag, 7 control lines, 96 outside it (blank, comment, bracket-only, docs and editor config lines are not classed) (in apps/api/src/infrastructure/observability/metrics-catalog.ts, apps/web/src/App.tsx, apps/web/src/fireweave/fw-tracker.ts, apps/web/src/styles.css). Classed by call site: fw at apps/web/src/App.tsx:16 (1 reference(s), all on flag reads, so control); record at apps/web/src/App.tsx:17 (5 reference(s), all inside the flag, so inside). Whether the flag exists in production and both states are tested is not checked |
| Path | live | declared | `apps/api/src/infrastructure/observability/openobserve.ts:9`, `apps/api/src/bootstrap.ts:12`, `apps/api/src/main.ts:2`, `apps/web/src/main.tsx:5` +5. apps/api/src/infrastructure/observability/metrics-catalog.ts reaches apps/api/src/main.ts in 3 import(s); apps/web/src/App.tsx reaches apps/web/src/main.tsx in 1 import(s); apps/web/src/fireweave/fw-providers.ts reaches apps/web/src/main.tsx in 2 import(s); ProfileMenu < Shell is mounted by route (layout) with child routes (index), play/:gameId, scoreboard, admin behind RequireAuth; not imported from any entry point: apps/web/src/fireweave/fw-tracker.ts. Import graph and routes measured; entry points declared by package.json scripts and index.html: apps/api/src/main.ts, apps/web/src/main.tsx. Not code paths, listed only: apps/web/src/styles.css (stylesheet) |
| Reach | high | assumed | `apps/web/src/App.tsx:442`, `apps/web/src/observability/openobserve.ts:34`, `apps/web/src/observability/openobserve.ts:23`, `apps/web/src/App.tsx:451` +7. measured: calls reach POST /api/client-telemetry (emitAction); GET /api/scoreboard (services.auth.me, services.scoreboard.forUser, services.scoreboard.leaderboard, sessionTokenFromRequest). Worth unknown because the metrics catalog declares no tier for any of its 21 entries, so reach is assumed wide. Not code paths, listed only: apps/web/src/styles.css (stylesheet) |
| Failure mode | domain, infra | measured | `apps/api/src/infrastructure/observability/metrics-catalog.ts:127`, `apps/web/src/App.tsx:1`, `apps/web/src/fireweave/fw-providers.ts:275`, `apps/web/src/fireweave/fw-tracker.ts:19` +1. rules on touched paths: apps/api/src/infrastructure/observability/metrics-catalog.ts -> infra; apps/web/src/App.tsx -> domain; apps/web/src/fireweave/fw-providers.ts -> domain; apps/web/src/fireweave/fw-tracker.ts -> domain; apps/web/src/styles.css -> cosmetic. Matched on file path; each evidence line is the file's first change |
| Failure mode (LLM second opinion) | domain, infra | assumed | none. agrees with the rules (domain, infra). Each menu open triggers an extra scoreboard fetch and telemetry calls, adding load. Metrics or the record display could be wrong or misleading, such as stale loads or error and success metrics recorded even when the response is ignored, and error rates would not show this. |
| Detection apparatus | slow | measured | `apps/web/src/App.tsx:456`, `apps/web/src/App.tsx:466`, `apps/web/src/App.tsx:471`, `docker/compose.prod.yml:49` +1. domain: no business-level check (no value metric, no test of the changed domain files); infra: latency metric arcade_web_profile_menu_load_ms, error rate metric arcade_web_profile_menu_load_errors_total, deploy health check. Every failure mode needs its detector, so detection is slow. 5 metric/log calls on changed lines (arcade_web_profile_menu_opens_total: count, arcade_web_profile_menu_load_success_total: count, arcade_web_profile_menu_load_ms: latency, arcade_web_profile_menu_load_errors_total: error rate). Checked in the repo only; alert config outside the repo (OpenObserve) is not an input |
| Time to revert | full build and deploy | assumed | `.github/workflows/deploy.yml:15`. no one-click rollback in 1 workflow file(s); CI run history is not an input, so pipeline duration is not measured. Declared job timeout: 5 min (a bound, not a measurement). Unknown rounds to slow: a full build and deploy to revert (W 2) |
| History | history unavailable | assumed | none. measured: 8 earlier commits touch the changed files, 0 reverts, 0 fix commits; repo history before base spans 4h (2026-10-06 to 2026-10-06). Too thin to read as a record (thin: < 5 commits or < 7 days) |
| Provenance | agent-assisted (Cursor) | measured | `commit c5da112`. commit trailers: Cursor <cursoragent@cursor.com>; PR description: "Made with Cursor"; author(s) in git: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>. Whether a human was in the loop is not verifiable from the input |
| Confidence: test coverage | 0 of 4 changed code files have a test | measured | none. tests that import a changed file; 0 covered by tests that existed before the change. Uncovered: apps/api/src/infrastructure/observability/metrics-catalog.ts, apps/web/src/App.tsx, apps/web/src/fireweave/fw-providers.ts, apps/web/src/fireweave/fw-tracker.ts |
| Confidence: familiarity | single-author repo, people part dropped | measured | none. repo authors before base: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>; per file: apps/api/src/infrastructure/observability/metrics-catalog.ts (1), apps/web/src/App.tsx (1), apps/web/src/fireweave/fw-providers.ts (1), apps/web/src/fireweave/fw-tracker.ts (1), apps/web/src/styles.css (1). Reviewer familiarity needs review data: the PR export lists 0 reviews |
| Confidence: review depth | 0 reviews | declared | none. the PR export lists 0 reviews |
| Confidence: diff vs task (LLM) | mismatch | assumed | none. load_ms histogram is emitted on both success and error with result label, while the metrics catalog defaults it to result ok; minor, but the description says only 'load time'; The dev provider now enables profile-avatar-menu locally, which the description mentions; the FW_STAMPS entry is an unmentioned tracking change |

## Changed files

- `apps/api/src/infrastructure/observability/metrics-catalog.ts` (modified, +28 -0)
- `apps/web/src/App.tsx` (modified, +145 -16)
- `apps/web/src/fireweave/fw-providers.ts` (modified, +1 -1)
- `apps/web/src/fireweave/fw-tracker.ts` (modified, +3 -1)
- `apps/web/src/styles.css` (modified, +66 -0)
