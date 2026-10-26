# Release brief: Add a profile avatar menu beside logout

Range `30ac194..c5da112`, 5 files changed.

**Mode: not computed**

## Plan

Not computed.

## Top reasons

1. Gate 1 (Table stakes) is unverifiable, routes to human: required CI checks: no CI status was declared for this range.

## Confidence

**low**
- no test that existed before the change covers any of the 4 changed code files (measured)
- single-author repo: familiarity dropped (W appendix)
- Failure mode (LLM second opinion): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- History: history unavailable (assumed), lowers confidence, does not raise risk (W 2)
- Confidence: review depth: unavailable (assumed), lowers confidence, does not raise risk (W 2)
- Confidence: diff vs task (LLM): unavailable (assumed), lowers confidence, does not raise risk (W 2)

## The one unknown

Not computed.

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
| Feature flag | partial | measured | `apps/web/src/App.tsx:428`, `apps/web/src/App.tsx:532`, `apps/web/src/App.tsx:533`, `apps/web/src/App.tsx:539` +19. flag `profile-avatar-menu` (default false): 85 added lines inside the flag, 6 control lines, 98 outside it (in apps/api/src/infrastructure/observability/metrics-catalog.ts, apps/web/src/App.tsx, apps/web/src/fireweave/fw-tracker.ts, apps/web/src/styles.css). Whether the flag exists in production and both states are tested is not checked |
| Path | live | declared | `apps/api/src/infrastructure/observability/openobserve.ts:9`, `apps/api/src/bootstrap.ts:12`, `apps/api/src/main.ts:2`, `apps/web/src/main.tsx:5` +6. apps/api/src/infrastructure/observability/metrics-catalog.ts reaches apps/api/src/main.ts in 3 import(s); apps/web/src/App.tsx reaches apps/web/src/main.tsx in 1 import(s); apps/web/src/fireweave/fw-providers.ts reaches apps/web/src/main.tsx in 2 import(s); apps/web/src/styles.css reaches apps/web/src/main.tsx in 1 import(s); ProfileMenu < Shell is mounted by route (layout) with child routes (index), play/:gameId, scoreboard, admin behind RequireAuth; not imported from any entry point: apps/web/src/fireweave/fw-tracker.ts. Import graph and routes measured; entry points declared by package.json scripts and index.html: apps/api/src/main.ts, apps/web/src/main.tsx |
| Reach | high | assumed | `apps/web/src/App.tsx:442`, `apps/web/src/observability/openobserve.ts:34`, `apps/web/src/observability/openobserve.ts:23`, `apps/web/src/App.tsx:451` +7. measured: calls reach POST /api/client-telemetry (emitAction); GET /api/scoreboard (services.auth.me, services.scoreboard.forUser, services.scoreboard.leaderboard, sessionTokenFromRequest). Worth unknown because the metrics catalog declares no tier for any of its 21 entries, so reach is assumed wide |
| Failure mode | domain, infra | measured | `apps/api/src/infrastructure/observability/metrics-catalog.ts:127`, `apps/web/src/App.tsx:1`, `apps/web/src/fireweave/fw-providers.ts:275`, `apps/web/src/fireweave/fw-tracker.ts:19` +1. rules on touched paths: apps/api/src/infrastructure/observability/metrics-catalog.ts -> infra; apps/web/src/App.tsx -> domain; apps/web/src/fireweave/fw-providers.ts -> infra; apps/web/src/fireweave/fw-tracker.ts -> infra; apps/web/src/styles.css -> domain |
| Failure mode (LLM second opinion) | unavailable | assumed | none. no ANTHROPIC_API_KEY; rules only |
| Detection apparatus | not alerted | assumed | `apps/web/src/App.tsx:442`, `apps/web/src/App.tsx:451`, `apps/web/src/App.tsx:456`, `apps/web/src/App.tsx:466` +1. measured: 5 metric/log calls on changed lines (arcade_web_profile_menu_opens_total, arcade_web_profile_menu_load_success_total, arcade_web_profile_menu_load_ms, arcade_web_profile_menu_load_errors_total); no alert, SLO or dashboard config in the repo, so no alert on the changed path is assumed |
| Time to revert | full build and deploy | assumed | `.github/workflows/deploy.yml:15`. no one-click rollback in 1 workflow file(s); no CI run history in the input, so pipeline duration is not measured. Declared job timeout: 5 min (a bound, not a measurement). Unknown rounds to slow: a full build and deploy to revert (W 2) |
| History | history unavailable | assumed | none. measured: 8 earlier commits touch the changed files, 0 reverts, 0 fix commits; repo history before base spans 4h (2026-10-06 to 2026-10-06). Too thin to read as a record (thin: < 5 commits or < 7 days) |
| Provenance | agent-assisted (Cursor) | measured | `commit c5da112`. commit trailers: Cursor <cursoragent@cursor.com>; PR description: "Made with Cursor"; author(s) in git: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>. Whether a human was in the loop is not verifiable from the input |
| Confidence: test coverage | 0 of 4 changed code files have a test | measured | none. tests that import a changed file; 0 covered by tests that existed before the change. Uncovered: apps/api/src/infrastructure/observability/metrics-catalog.ts, apps/web/src/App.tsx, apps/web/src/fireweave/fw-providers.ts, apps/web/src/fireweave/fw-tracker.ts |
| Confidence: familiarity | single-author repo, people part dropped | measured | none. repo authors before base: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>; per file: apps/api/src/infrastructure/observability/metrics-catalog.ts (1), apps/web/src/App.tsx (1), apps/web/src/fireweave/fw-providers.ts (1), apps/web/src/fireweave/fw-tracker.ts (1), apps/web/src/styles.css (1). Reviewer familiarity needs review data, which the input lacks |
| Confidence: review depth | unavailable | assumed | none. the PR export has no reviews or comments |
| Confidence: diff vs task (LLM) | unavailable | assumed | none. no ANTHROPIC_API_KEY |

## Changed files

- `apps/api/src/infrastructure/observability/metrics-catalog.ts` (modified, +28 -0)
- `apps/web/src/App.tsx` (modified, +145 -16)
- `apps/web/src/fireweave/fw-providers.ts` (modified, +1 -1)
- `apps/web/src/fireweave/fw-tracker.ts` (modified, +3 -1)
- `apps/web/src/styles.css` (modified, +66 -0)
