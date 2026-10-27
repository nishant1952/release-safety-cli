# Release brief: Add signed-in password change

Range `32683da..0e61b2d`, 14 files changed. Title: PR title, declared.

**Mode: Human.** Grid: high damage x long window = Human.

## Plan

| Step | Proposed |
|---|---|
| Exposure | Proposed by the system: Small slice, soak, widen; slice by flag percentage on `change-password` for the code inside it; edits outside the flag reach everyone at deploy (rollout mechanism is not extracted, so all-at-once is assumed). Approved or edited by the owner |
| Soak per step | Proposed by the system: Hours, scaled to traffic (traffic is not an input, so the hours are not scaled). Approved or edited by the owner |
| Guardrails | Same as staged, plus whatever the owner adds. domain: business checks, none found on the changed path; infra: resources and latency, watch error rate metric arcade_web_password_change_errors_total, measured (apps/web/src/Account.tsx:40, apps/web/src/Account.tsx:74); latency metric arcade_web_password_change_ms, measured (apps/web/src/Account.tsx:60, apps/web/src/Account.tsx:78); deploy health check, declared (docker/compose.prod.yml:49, scripts/deploy-prod.sh:74); security: auth errors, none found on the changed path |
| Abort | Owner decides |
| Undo | flip `change-password` off (flag partial, measured) for the code inside the flag; revert and redeploy (time to revert: full build and deploy, assumed) for the edits outside it. |
| Paged | Named owner before step one: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local> (earlier author of the most touched files, measured from git; the repo has no CODEOWNERS file) |
| Sign-off | Required before step one |

## Top reasons

1. Gate 1: Red advisory checks, no required checks on the repo: FireWeave — flag contract (FAILURE), FireWeave — rollout readiness (FAILURE). Not required, so it cannot block; each lowers confidence one notch.
   - no line to cite: this reason rests on the PR export's check rollup and required-checks.json (declared and measured), not on a line of code
2. High damage: the path is live (declared) and the reach is high (assumed). measured: calls reach POST /api/client-telemetry (emitAction); POST /api/auth/register (services.auth.register, sessionCookie); POST /api/auth/login (services.auth.login, sessionCookie); POST /api/auth/password (services.auth.changePassword, services.auth.me, sessionTokenFromRequest). Worth unknown because the metrics catalog declares no tier for any of its 39 entries, so reach is assumed wide.
   - `apps/web/src/App.tsx:579` `<ProfileMenu enabled={profileMenu} />`
   - `apps/web/src/App.tsx:629` `<Shell />`
   - `apps/web/src/App.tsx:626` `<Route`
   - `apps/api/src/interfaces/http/router.ts:82` `if (path === "/api/client-telemetry" && req.method === "POST") {`
   - and 3 more
3. Long window: undo is slow: the flag is partial (edits outside it use the revert path) and time to revert is full build and deploy (assumed); detection is slow (assumed): domain: no business-level check (no value metric, no test of the changed domain files); infra: error rate metric arcade_web_password_change_errors_total, latency metric arcade_web_password_change_ms, deploy health check; security: no auth-error alert.
   - `.github/workflows/deploy.yml:15` `timeout-minutes: 5`
   - `apps/web/src/Account.tsx:40` `void record("arcade_web_password_change_errors_total", 1, {`
   - `apps/web/src/Account.tsx:60` `void record(`
   - `apps/web/src/Account.tsx:74` `void record("arcade_web_password_change_errors_total", 1, {`
4. Probability: measured confidence is low, so the mode moves one step toward caution (already Human, no further step).
   - no line to cite: this reason rests on something missing from the input or the repo

## Confidence

**low**
- no test that existed before the change covers any of the 14 changed code files (measured)
- single-author repo: familiarity dropped (W appendix)
- Failure mode (LLM second opinion): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- History: history unavailable (assumed), lowers confidence, does not raise risk (W 2)
- Confidence: diff vs task (LLM): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- gate 1: red advisory check FireWeave — flag contract (FAILURE), not required on the repo, lowers confidence one notch
- gate 1: red advisory check FireWeave — rollout readiness (FAILURE), not required on the repo, lowers confidence one notch
- disagreement lowers confidence: metrics added to the catalog but not emitted by the changed code: arcade_password_change_errors_total, arcade_password_change_ms, arcade_password_changes_total (W 2)

## The one unknown

No single assumed input changes the mode. Considered: Reach (high); Detection apparatus (slow); Time to revert (full build and deploy); Failure mode (LLM second opinion) (cannot move the mode); History (cannot move the mode); Confidence: diff vs task (LLM) (cannot move the mode). With all of them at their favourable value the mode is Staged.

## Disagreements

- Disagreement: metrics added to the catalog but not emitted by the changed code: arcade_password_change_errors_total, arcade_password_change_ms, arcade_password_changes_total

## Gates

| Gate | Result | Route | Checks |
|---|---|---|---|
| 1. Table stakes | pass | none | secrets: pass (measured); PII: pass (measured); hardcoded environment values: pass (measured); required CI checks: pass (measured); advisory CI checks: pass (declared) |
| 2. API contract | pass | none | breaking change to route, schema or public signature: pass (measured); additive API surface: pass (measured) |
| 3. Destructive schema or data change | pass | none | destructive schema change or mutation of existing data: pass (measured) |

Gate 2, additive API surface:
- `apps/api/src/infrastructure/observability/actions-catalog.ts:88` `name: "arcade_password_changes_total",`
- `apps/api/src/infrastructure/observability/actions-catalog.ts:93` `name: "arcade_password_change_ms",`
- `apps/api/src/infrastructure/observability/metrics-catalog.ts:240` `name: "arcade_password_changes_total",`
- `apps/api/src/infrastructure/observability/metrics-catalog.ts:247` `name: "arcade_password_change_errors_total",`
- and 7 more

## Provenance

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible or irreversible | reversible | measured | none. no persisted write, outbound side effect, queue publish or external API client in 356 added lines |
| Feature flag | partial | measured | `apps/api/src/application/auth.ts:4`, `apps/api/src/application/auth.ts:162`, `apps/api/src/application/auth.ts:163`, `apps/api/src/fireweave/fw-providers.ts:204` +51. flag `change-password` (default false), `change-password` (default false), `profile-avatar-menu` (default false), `header-arrangement` (default false), `match-replay` (default false), `change-password` (default false): 97 added lines inside the flag, 12 control lines, 169 outside it (blank, comment, bracket-only, docs and editor config lines are not classed) (in apps/api/src/application/auth.ts, apps/api/src/domain/ports.ts, apps/api/src/fireweave/fw-tracker.ts, apps/api/src/infrastructure/db/session-repo.ts, apps/api/src/infrastructure/db/user-repo.ts, apps/api/src/infrastructure/observability/actions-catalog.ts, apps/api/src/infrastructure/observability/metrics-catalog.ts, apps/api/src/interfaces/http/router.ts, apps/web/src/Account.tsx, apps/web/src/App.tsx, apps/web/src/api.ts, apps/web/src/fireweave/fw-tracker.ts). Classed by call site: fw at apps/api/src/application/auth.ts:4 (1 reference(s), all on flag reads, so control); Navigate at apps/web/src/Account.tsx:2 (1 reference(s), all inside the flag, so inside); ApiError, api at apps/web/src/Account.tsx:3 (2 reference(s), all inside the flag, so inside); fw at apps/web/src/Account.tsx:4 (1 reference(s), all on flag reads, so control); record at apps/web/src/Account.tsx:5 (7 reference(s), all inside the flag, so inside); reasonFor at apps/web/src/Account.tsx:9 (1 reference(s), all inside the flag, so inside). Whether the flag exists in production and both states are tested is not checked |
| Path | live | declared | `apps/api/src/bootstrap.ts:1`, `apps/api/src/main.ts:2`, `apps/api/src/interfaces/http/router.ts:8`, `apps/api/src/main.ts:3` +14. apps/api/src/application/auth.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/domain/ports.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/fireweave/fw-providers.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/infrastructure/db/session-repo.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/infrastructure/db/user-repo.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/infrastructure/observability/metrics-catalog.ts reaches apps/api/src/main.ts in 3 import(s); apps/api/src/interfaces/http/router.ts reaches apps/api/src/main.ts in 1 import(s); apps/web/src/Account.tsx reaches apps/web/src/main.tsx in 2 import(s); apps/web/src/App.tsx reaches apps/web/src/main.tsx in 1 import(s); apps/web/src/api.ts reaches apps/web/src/main.tsx in 2 import(s); apps/web/src/fireweave/fw-providers.ts reaches apps/web/src/main.tsx in 2 import(s); ProfileMenu < Shell is mounted by route (layout) with child routes (index), play/:gameId, scoreboard, history, history/:matchId, account/password, admin behind RequireAuth; not imported from any entry point: apps/api/src/fireweave/fw-tracker.ts, apps/api/src/infrastructure/observability/actions-catalog.ts, apps/web/src/fireweave/fw-tracker.ts. Import graph and routes measured; entry points declared by package.json scripts and index.html: apps/api/src/main.ts, apps/web/src/main.tsx |
| Reach | high | assumed | `apps/web/src/api.ts:146`, `apps/web/src/api.ts:102`, `apps/web/src/Account.tsx:50`, `apps/web/src/Account.tsx:95` +16. measured: calls reach POST /api/client-telemetry (emitAction); POST /api/auth/register (services.auth.register, sessionCookie); POST /api/auth/login (services.auth.login, sessionCookie); POST /api/auth/password (services.auth.changePassword, services.auth.me, sessionTokenFromRequest). Worth unknown because the metrics catalog declares no tier for any of its 39 entries, so reach is assumed wide |
| Failure mode | domain, infra, security | measured | `apps/api/src/application/auth.ts:4`, `apps/api/src/domain/ports.ts:67`, `apps/api/src/fireweave/fw-providers.ts:204`, `apps/api/src/fireweave/fw-tracker.ts:21` +10. rules on touched paths: apps/api/src/application/auth.ts -> security; apps/api/src/domain/ports.ts -> domain; apps/api/src/fireweave/fw-providers.ts -> domain; apps/api/src/fireweave/fw-tracker.ts -> domain; apps/api/src/infrastructure/db/session-repo.ts -> security; apps/api/src/infrastructure/db/user-repo.ts -> infra; apps/api/src/infrastructure/observability/actions-catalog.ts -> infra; apps/api/src/infrastructure/observability/metrics-catalog.ts -> infra; apps/api/src/interfaces/http/router.ts -> domain; apps/web/src/Account.tsx -> domain; apps/web/src/App.tsx -> domain; apps/web/src/api.ts -> domain; apps/web/src/fireweave/fw-providers.ts -> domain; apps/web/src/fireweave/fw-tracker.ts -> domain. Matched on file path; each evidence line is the file's first change |
| Failure mode (LLM second opinion) | unavailable | assumed | none. no ANTHROPIC_API_KEY; rules only |
| Detection apparatus | slow | assumed | `apps/web/src/Account.tsx:40`, `apps/web/src/Account.tsx:60`, `apps/web/src/Account.tsx:74`, `apps/web/src/Account.tsx:78` +2. domain: no business-level check (no value metric, no test of the changed domain files); infra: error rate metric arcade_web_password_change_errors_total, latency metric arcade_web_password_change_ms, deploy health check; security: no auth-error alert. Every failure mode needs its detector, so detection is slow. 7 metric/log calls on changed lines (arcade_web_password_change_total: count, arcade_web_password_change_errors_total: error rate, arcade_web_password_change_ms: latency). Checked in the repo only; alert config outside the repo (OpenObserve) is not an input |
| Time to revert | full build and deploy | assumed | `.github/workflows/deploy.yml:15`. no one-click rollback in 1 workflow file(s); CI run history is not an input, so pipeline duration is not measured. Declared job timeout: 5 min (a bound, not a measurement). Unknown rounds to slow: a full build and deploy to revert (W 2) |
| History | history unavailable | assumed | none. measured: 12 earlier commits touch the changed files, 0 reverts, 0 fix commits; repo history before base spans 8h (2026-10-06 to 2026-10-06). Too thin to read as a record (thin: < 5 commits or < 7 days) |
| Provenance | agent-assisted (Cursor) | measured | `commit 0e61b2d`. commit trailers: Cursor <cursoragent@cursor.com>; PR description: "Made with Cursor"; author(s) in git: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>. Whether a human was in the loop is not verifiable from the input |
| Confidence: test coverage | 0 of 14 changed code files have a test | measured | none. tests that import a changed file; 0 covered by tests that existed before the change. Uncovered: apps/api/src/application/auth.ts, apps/api/src/domain/ports.ts, apps/api/src/fireweave/fw-providers.ts, apps/api/src/fireweave/fw-tracker.ts, apps/api/src/infrastructure/db/session-repo.ts, apps/api/src/infrastructure/db/user-repo.ts, apps/api/src/infrastructure/observability/actions-catalog.ts, apps/api/src/infrastructure/observability/metrics-catalog.ts, apps/api/src/interfaces/http/router.ts, apps/web/src/Account.tsx, apps/web/src/App.tsx, apps/web/src/api.ts, apps/web/src/fireweave/fw-providers.ts, apps/web/src/fireweave/fw-tracker.ts |
| Confidence: familiarity | single-author repo, people part dropped | measured | none. repo authors before base: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>; per file: apps/api/src/application/auth.ts (1), apps/api/src/domain/ports.ts (1), apps/api/src/fireweave/fw-providers.ts (1), apps/api/src/fireweave/fw-tracker.ts (1), apps/api/src/infrastructure/db/session-repo.ts (1), apps/api/src/infrastructure/db/user-repo.ts (1), apps/api/src/infrastructure/observability/actions-catalog.ts (1), apps/api/src/infrastructure/observability/metrics-catalog.ts (1), apps/api/src/interfaces/http/router.ts (1), apps/web/src/Account.tsx (0), apps/web/src/App.tsx (1), apps/web/src/api.ts (1), apps/web/src/fireweave/fw-providers.ts (1), apps/web/src/fireweave/fw-tracker.ts (1). Reviewer familiarity needs review data: the PR export lists 0 reviews |
| Confidence: review depth | 0 reviews | declared | none. the PR export lists 0 reviews |
| Confidence: diff vs task (LLM) | unavailable | assumed | none. no ANTHROPIC_API_KEY |

## Changed files

- `apps/api/src/application/auth.ts` (modified, +92 -0)
- `apps/api/src/domain/ports.ts` (modified, +2 -0)
- `apps/api/src/fireweave/fw-providers.ts` (modified, +1 -1)
- `apps/api/src/fireweave/fw-tracker.ts` (modified, +1 -0)
- `apps/api/src/infrastructure/db/session-repo.ts` (modified, +7 -0)
- `apps/api/src/infrastructure/db/user-repo.ts` (modified, +7 -4)
- `apps/api/src/infrastructure/observability/actions-catalog.ts` (modified, +17 -0)
- `apps/api/src/infrastructure/observability/metrics-catalog.ts` (modified, +42 -0)
- `apps/api/src/interfaces/http/router.ts` (modified, +19 -0)
- `apps/web/src/Account.tsx` (added, +134 -0)
- `apps/web/src/App.tsx` (modified, +13 -0)
- `apps/web/src/api.ts` (modified, +19 -7)
- `apps/web/src/fireweave/fw-providers.ts` (modified, +1 -1)
- `apps/web/src/fireweave/fw-tracker.ts` (modified, +1 -0)
