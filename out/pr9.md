# Release brief: Correlate every action across logs, metrics, and traces

Range `504f75e..48a2a83`, 13 files changed. Title: PR title, declared.

**Mode: Human.** Grid: high damage x long window = Human. Gates route to Human.

## Plan

| Step | Proposed |
|---|---|
| Exposure | Proposed by the system: Small slice, soak, widen; slice by canary or percentage deploy (rollout mechanism is not extracted, so all-at-once is assumed). Approved or edited by the owner |
| Soak per step | Proposed by the system: Hours, scaled to traffic (traffic is not an input, so the hours are not scaled). Approved or edited by the owner |
| Guardrails | Same as staged, plus whatever the owner adds. domain: business checks, none found on the changed path; infra: resources and latency, watch deploy health check, declared (docker/compose.prod.yml:45, scripts/deploy-prod.sh:70); security: auth errors, none found on the changed path |
| Abort | Owner decides |
| Undo | Without one, undo is a rollback or redeploy and a slice is a canary or percentage deploy. Undo: revert and redeploy (time to revert: full build and deploy, assumed). |
| Paged | Named owner before step one: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local> (earlier author of the most touched files, measured from git; the repo has no CODEOWNERS file) |
| Sign-off | Required before step one |

## Top reasons

1. Gate 2 (API contract) is trip, so it routes to a human: breaking change to route, schema or public signature: removed or changed API surface; whether a removed or changed export is public is read from package.json (declared).
   - `apps/api/src/infrastructure/observability/metrics-catalog.ts@504f75e:21` `source: "openobserve.startRequest / finishRequest",`
   - `apps/api/src/infrastructure/observability/metrics-catalog.ts@504f75e:33` `description: "Auth and product events (login, register, …)",`
   - `apps/api/src/infrastructure/observability/metrics-catalog.ts@504f75e:34` `defaultLabels: { event: "admin_inject" },`
2. High damage: the path is live (declared) and the reach is high (assumed). measured: calls reach POST /api/auth/register (services.auth.register, sessionCookie); POST /api/auth/login (services.auth.login, sessionCookie); GET /api/admin/metrics (services.admin.listMetrics, services.auth.me, sessionTokenFromRequest); POST /api/admin/actions/inject (join, log, services.admin.injectAction, services.auth.me, sessionTokenFromRequest). Worth unknown because the metrics catalog declares no tier for any of its 16 entries, so reach is assumed wide. Not code paths, listed only: docs/observability-strategy.md (docs).
   - `apps/web/src/App.tsx:14` `import { AdminPage } from "./Admin";`
   - `apps/web/src/main.tsx:4` `import App from "./App";`
   - `apps/web/src/App.tsx:13` `import { api, type GameInfo, type Match, type Scoreboard } from "./api";`
   - `apps/api/src/interfaces/http/router.ts:78` `if (path === "/api/auth/register" && req.method === "POST") {`
   - and 3 more
3. Long window: the change is irreversible; undo is slow: the flag is none and time to revert is full build and deploy (assumed); detection is slow (assumed): domain: no business-level check (no value metric, no test of the changed domain files); infra: deploy health check; security: no auth-error alert.
   - `.github/workflows/deploy.yml:15` `timeout-minutes: 5`
   - `docker/compose.prod.yml:45` `healthcheck:`
   - `scripts/deploy-prod.sh:70` `if curl -fsS --max-time 1 "http://127.0.0.1/api/health" >/dev/null 2>&1; then`
4. Probability: measured confidence is low, so the mode moves one step toward caution (already Human, no further step).
   - no line to cite: this reason rests on something missing from the input or the repo

## Confidence

**low**
- no test that existed before the change covers any of the 12 changed code files (measured)
- single-author repo: familiarity dropped (W appendix)
- Failure mode (LLM second opinion): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- History: history unavailable (assumed), lowers confidence, does not raise risk (W 2)
- Confidence: diff vs task (LLM): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- gate 2: 1 export(s) removed or changed in modules internal to the repo (declared by package.json), lowers confidence one notch
- disagreement lowers confidence: metrics added to the catalog but not emitted by the changed code: arcade_active_matches, arcade_admin_injects_total, arcade_auth_failures_total, arcade_bot_move_duration_ms, arcade_illegal_moves_total, arcade_lobby_views_total, arcade_match_duration_ms, arcade_openobserve_export_errors_total, arcade_scoreboard_views_total (W 2)

## The one unknown

No single assumed input changes the mode. Considered: Reach (high); Detection apparatus (slow); Time to revert (full build and deploy); Failure mode (LLM second opinion) (cannot move the mode); History (cannot move the mode); Confidence: diff vs task (LLM) (cannot move the mode). With all of them at their favourable value the mode is Human, and no single known input changes it either.

## Disagreements

- Disagreement: metrics added to the catalog but not emitted by the changed code: arcade_active_matches, arcade_admin_injects_total, arcade_auth_failures_total, arcade_bot_move_duration_ms, arcade_illegal_moves_total, arcade_lobby_views_total, arcade_match_duration_ms, arcade_openobserve_export_errors_total, arcade_scoreboard_views_total

## Gates

| Gate | Result | Route | Checks |
|---|---|---|---|
| 1. Table stakes | pass | none | secrets: pass (measured); PII: pass (measured); hardcoded environment values: pass (measured); required CI checks: pass (measured) |
| 2. API contract | trip | human | breaking change to route, schema or public signature: trip (declared); internal signature changes: pass (declared); additive API surface: pass (measured) |
| 3. Destructive schema or data change | pass | none | destructive schema change or mutation of existing data: pass (measured) |

Gate 2, breaking change to route, schema or public signature:
- `apps/api/src/infrastructure/observability/metrics-catalog.ts@504f75e:21` `source: "openobserve.startRequest / finishRequest",`
- `apps/api/src/infrastructure/observability/metrics-catalog.ts@504f75e:33` `description: "Auth and product events (login, register, …)",`
- `apps/api/src/infrastructure/observability/metrics-catalog.ts@504f75e:34` `defaultLabels: { event: "admin_inject" },`

Gate 2, internal signature changes:
- `apps/api/src/infrastructure/observability/openobserve.ts@504f75e:245` `export async function track(event: {`

Gate 2, additive API surface:
- `apps/api/src/domain/ports.ts:6` `export type EmitActionInput = {`
- `apps/api/src/domain/ports.ts:42` `export type TraceCtx = {`
- `apps/api/src/infrastructure/observability/actions-catalog.ts:5` `export type ActionDef = {`
- `apps/api/src/infrastructure/observability/actions-catalog.ts:17` `export const ACTIONS_CATALOG: ActionDef[] = [`
- and 42 more

## Provenance

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible or irreversible | irreversible | measured | `apps/api/src/infrastructure/observability/openobserve.ts:64`, `apps/api/src/infrastructure/observability/openobserve.ts:78`. HTTP call, target not resolved one hop in the diff: treated as irreversible because it may leave effects a redeploy cannot undo |
| Feature flag | none | measured | none. no flag call (getBooleanValue) or control point anchor in the changed files |
| Path | live | declared | `apps/api/src/bootstrap.ts:4`, `apps/api/src/main.ts:1`, `apps/api/src/bootstrap.ts:1`, `apps/api/src/bootstrap.ts:2` +10. apps/api/src/application/admin.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/application/auth.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/application/games.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/application/scoreboard.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/domain/ports.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/infrastructure/observability/actions-catalog.ts reaches apps/api/src/main.ts in 3 import(s); apps/api/src/infrastructure/observability/adapter.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/infrastructure/observability/metrics-catalog.ts reaches apps/api/src/main.ts in 3 import(s); apps/api/src/infrastructure/observability/openobserve.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/interfaces/http/router.ts reaches apps/api/src/main.ts in 1 import(s); apps/web/src/Admin.tsx reaches apps/web/src/main.tsx in 2 import(s); apps/web/src/api.ts reaches apps/web/src/main.tsx in 2 import(s). Import graph and routes measured; entry points declared by package.json scripts and index.html: apps/api/src/main.ts, apps/web/src/main.tsx. Not code paths, listed only: docs/observability-strategy.md (docs) |
| Reach | high | assumed | `apps/web/src/Admin.tsx:396`, `apps/web/src/api.ts:183`, `apps/web/src/Admin.tsx:499`, `apps/web/src/Admin.tsx:386` +7. measured: calls reach POST /api/auth/register (services.auth.register, sessionCookie); POST /api/auth/login (services.auth.login, sessionCookie); GET /api/admin/metrics (services.admin.listMetrics, services.auth.me, sessionTokenFromRequest); POST /api/admin/actions/inject (join, log, services.admin.injectAction, services.auth.me, sessionTokenFromRequest). Worth unknown because the metrics catalog declares no tier for any of its 16 entries, so reach is assumed wide. Not code paths, listed only: docs/observability-strategy.md (docs) |
| Failure mode | domain, infra, security | measured | `apps/api/src/application/admin.ts:2`, `apps/api/src/application/auth.ts:2`, `apps/api/src/application/games.ts:6`, `apps/api/src/application/scoreboard.ts:2` +9. rules on touched paths: apps/api/src/application/admin.ts -> domain; apps/api/src/application/auth.ts -> security; apps/api/src/application/games.ts -> domain; apps/api/src/application/scoreboard.ts -> domain; apps/api/src/domain/ports.ts -> domain; apps/api/src/infrastructure/observability/actions-catalog.ts -> infra; apps/api/src/infrastructure/observability/adapter.ts -> infra; apps/api/src/infrastructure/observability/metrics-catalog.ts -> infra; apps/api/src/infrastructure/observability/openobserve.ts -> infra; apps/api/src/interfaces/http/router.ts -> domain; apps/web/src/Admin.tsx -> domain; apps/web/src/api.ts -> domain; docs/observability-strategy.md -> none. Matched on file path; each evidence line is the file's first change |
| Failure mode (LLM second opinion) | unavailable | assumed | none. no ANTHROPIC_API_KEY; rules only |
| Detection apparatus | slow | assumed | `docker/compose.prod.yml:45`, `scripts/deploy-prod.sh:70`. domain: no business-level check (no value metric, no test of the changed domain files); infra: deploy health check; security: no auth-error alert. Every failure mode needs its detector, so detection is slow. 2 metric/log calls on changed lines (findAction: count, injectActionSamples: count). Checked in the repo only; alert config outside the repo (OpenObserve) is not an input |
| Time to revert | full build and deploy | assumed | `.github/workflows/deploy.yml:15`. no one-click rollback in 1 workflow file(s); CI run history is not an input, so pipeline duration is not measured. Declared job timeout: 5 min (a bound, not a measurement). Unknown rounds to slow: a full build and deploy to revert (W 2) |
| History | history unavailable | assumed | none. measured: 4 earlier commits touch the changed files, 0 reverts, 0 fix commits; repo history before base spans 2h (2026-10-06 to 2026-10-06). Too thin to read as a record (thin: < 5 commits or < 7 days) |
| Provenance | agent-assisted (Cursor) | measured | `commit 48a2a83`. commit trailers: Cursor <cursoragent@cursor.com>; PR description: "Made with Cursor"; author(s) in git: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>. Whether a human was in the loop is not verifiable from the input |
| Confidence: test coverage | 0 of 12 changed code files have a test | measured | none. tests that import a changed file; 0 covered by tests that existed before the change. Uncovered: apps/api/src/application/admin.ts, apps/api/src/application/auth.ts, apps/api/src/application/games.ts, apps/api/src/application/scoreboard.ts, apps/api/src/domain/ports.ts, apps/api/src/infrastructure/observability/actions-catalog.ts, apps/api/src/infrastructure/observability/adapter.ts, apps/api/src/infrastructure/observability/metrics-catalog.ts, apps/api/src/infrastructure/observability/openobserve.ts, apps/api/src/interfaces/http/router.ts, apps/web/src/Admin.tsx, apps/web/src/api.ts |
| Confidence: familiarity | single-author repo, people part dropped | measured | none. repo authors before base: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>; per file: apps/api/src/application/admin.ts (1), apps/api/src/application/auth.ts (1), apps/api/src/application/games.ts (1), apps/api/src/application/scoreboard.ts (1), apps/api/src/domain/ports.ts (1), apps/api/src/infrastructure/observability/actions-catalog.ts (0), apps/api/src/infrastructure/observability/adapter.ts (1), apps/api/src/infrastructure/observability/metrics-catalog.ts (1), apps/api/src/infrastructure/observability/openobserve.ts (1), apps/api/src/interfaces/http/router.ts (1), apps/web/src/Admin.tsx (1), apps/web/src/api.ts (1), docs/observability-strategy.md (0). Reviewer familiarity needs review data: the PR export lists 0 reviews |
| Confidence: review depth | 0 reviews | declared | none. the PR export lists 0 reviews |
| Confidence: diff vs task (LLM) | unavailable | assumed | none. no ANTHROPIC_API_KEY |

## Changed files

- `apps/api/src/application/admin.ts` (modified, +90 -12)
- `apps/api/src/application/auth.ts` (modified, +125 -15)
- `apps/api/src/application/games.ts` (modified, +138 -41)
- `apps/api/src/application/scoreboard.ts` (modified, +11 -5)
- `apps/api/src/domain/ports.ts` (modified, +30 -1)
- `apps/api/src/infrastructure/observability/actions-catalog.ts` (added, +260 -0)
- `apps/api/src/infrastructure/observability/adapter.ts` (modified, +5 -1)
- `apps/api/src/infrastructure/observability/metrics-catalog.ts` (modified, +66 -3)
- `apps/api/src/infrastructure/observability/openobserve.ts` (modified, +144 -32)
- `apps/api/src/interfaces/http/router.ts` (modified, +42 -14)
- `apps/web/src/Admin.tsx` (modified, +169 -4)
- `apps/web/src/api.ts` (modified, +25 -0)
- `docs/observability-strategy.md` (added, +194 -0)
