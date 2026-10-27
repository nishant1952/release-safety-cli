# Release brief: Add match history and step-through replay

Range `09422bc..33a285e`, 19 files changed. Title: PR title, declared.

**Mode: Human.** Grid: high damage x long window = Human.

## Plan

| Step | Proposed |
|---|---|
| Exposure | Proposed by the system: Small slice, soak, widen; slice by flag percentage on `match-replay` for the code inside it; edits outside the flag reach everyone at deploy (rollout mechanism is not extracted, so all-at-once is assumed). Approved or edited by the owner |
| Soak per step | Proposed by the system: Hours, scaled to traffic (traffic is not an input, so the hours are not scaled). Approved or edited by the owner |
| Guardrails | Same as staged, plus whatever the owner adds. domain: business checks, none found on the changed path; infra: resources and latency, watch error rate metric arcade_web_history_load_errors_total, measured (apps/web/src/History.tsx:42); latency metric arcade_web_replay_load_ms, measured (apps/web/src/History.tsx:104, apps/web/src/History.tsx:124); error rate metric arcade_web_replay_load_errors_total, measured (apps/web/src/History.tsx:119); deploy health check, declared (docker/compose.prod.yml:49, scripts/deploy-prod.sh:74) |
| Abort | Owner decides |
| Undo | flip `match-replay` off (flag partial, measured) for the code inside the flag; revert and redeploy (time to revert: full build and deploy, assumed) for the edits outside it. |
| Paged | Named owner before step one: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local> (earlier author of the most touched files, measured from git; the repo has no CODEOWNERS file) |
| Sign-off | Required before step one |

## Top reasons

1. Gate 1: Red advisory check, no required checks on the repo: FireWeave — flag contract (FAILURE). Not required, so it cannot block; each lowers confidence one notch.
   - no line to cite: this reason rests on the PR export's check rollup and required-checks.json (declared and measured), not on a line of code
2. High damage: the path is live (declared) and the reach is high (assumed). measured: calls reach POST /api/client-telemetry (emitAction); POST /api/auth/register (services.auth.register, sessionCookie); POST /api/auth/login (services.auth.login, sessionCookie); GET /api/matches (services.auth.me, services.history.listHistory, sessionTokenFromRequest). Worth unknown because the metrics catalog declares no tier for any of its 33 entries, so reach is assumed wide. Not code paths, listed only: apps/web/src/styles.css (stylesheet), docker/compose.dev.yml (compose), scripts/dev.sh (script).
   - `apps/web/src/main.tsx:4` `import { initFwHarness } from "./fireweave/fw-harness";`
   - `apps/web/src/App.tsx:621` `<Shell />`
   - `apps/web/src/App.tsx:618` `<Route`
   - `apps/api/src/interfaces/http/router.ts:82` `if (path === "/api/client-telemetry" && req.method === "POST") {`
   - and 3 more
3. Long window: undo is slow: the flag is partial (edits outside it use the revert path) and time to revert is full build and deploy (assumed); detection is slow (measured): domain: no business-level check (no value metric, no test of the changed domain files); infra: error rate metric arcade_web_history_load_errors_total, latency metric arcade_web_replay_load_ms, error rate metric arcade_web_replay_load_errors_total, deploy health check.
   - `.github/workflows/deploy.yml:15` `timeout-minutes: 5`
   - `apps/web/src/History.tsx:42` `void record("arcade_web_history_load_errors_total", 1, {`
   - `apps/web/src/History.tsx:104` `void record(`
   - `apps/web/src/History.tsx:119` `void record("arcade_web_replay_load_errors_total", 1, {`
4. Probability: measured confidence is low, so the mode moves one step toward caution (already Human, no further step).
   - no line to cite: this reason rests on something missing from the input or the repo

## Confidence

**low**
- no test that existed before the change covers any of the 16 changed code files (measured)
- single-author repo: familiarity dropped (W appendix)
- Secrets present at base: observed (measured), scripts/dev.sh:23 (URL credentials): present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence
- Failure mode (LLM second opinion): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- History: history unavailable (assumed), lowers confidence, does not raise risk (W 2)
- Confidence: diff vs task (LLM): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- gate 1: red advisory check FireWeave — flag contract (FAILURE), not required on the repo, lowers confidence one notch
- disagreement lowers confidence: metrics added to the catalog but not emitted by the changed code: arcade_match_history_errors_total, arcade_match_history_views_total, arcade_replay_errors_total, arcade_replay_load_ms, arcade_replay_loads_total (W 2)

## The one unknown

No single assumed input changes the mode. Considered: Reach (high); Time to revert (full build and deploy); Failure mode (LLM second opinion) (cannot move the mode); History (cannot move the mode); Confidence: diff vs task (LLM) (cannot move the mode). With all of them at their favourable value the mode is Human, so the call rests on what is known: Detection apparatus slow (measured), without which it would be Staged; confidence low (measured), without which it would be Staged.

## Disagreements

- Disagreement: metrics added to the catalog but not emitted by the changed code: arcade_match_history_errors_total, arcade_match_history_views_total, arcade_replay_errors_total, arcade_replay_load_ms, arcade_replay_loads_total

## Gates

| Gate | Result | Route | Checks |
|---|---|---|---|
| 1. Table stakes | pass | none | secrets: pass (measured); PII: pass (measured); hardcoded environment values: pass (measured); required CI checks: pass (measured); advisory CI checks: pass (declared) |
| 2. API contract | pass | none | breaking change to route, schema or public signature: pass (measured); additive API surface: pass (measured) |
| 3. Destructive schema or data change | pass | none | destructive schema change or mutation of existing data: pass (measured); additive schema change: pass (measured) |

Gate 2, additive API surface:
- `apps/api/src/application/history.ts:14` `export type HistoryMatch = {`
- `apps/api/src/application/history.ts:22` `export type ReplayFrame = {`
- `apps/api/src/application/history.ts:28` `export type Replay = {`
- `apps/api/src/application/history.ts:37` `export function createHistoryUseCases(deps: {`
- and 23 more

Gate 3, additive schema change:
- `apps/api/src/infrastructure/db/client.ts:69` `await sql'ALTER TABLE match_events ADD COLUMN IF NOT EXISTS state JSONB';`
- `apps/api/src/infrastructure/db/client.ts:73` `await sql'CREATE INDEX IF NOT EXISTS idx_matches_user_finished ON matches(user_id, status, id DESC)';`

## Provenance

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible or irreversible | reversible | measured | none. no persisted write, outbound side effect, queue publish or external API client in 666 added lines |
| Feature flag | partial | measured | `apps/api/src/application/games.ts:8`, `apps/api/src/application/games.ts:63`, `apps/api/src/application/games.ts:64`, `apps/api/src/application/games.ts:126` +93. flag `match-replay` (default false), `match-replay` (default false), `match-replay` (default false), `match-replay` (default false), `profile-avatar-menu` (default false), `header-arrangement` (default false), `match-replay` (default false), `match-replay` (default false), `match-replay` (default false): 144 added lines inside the flag, 26 control lines, 362 outside it (blank, comment, bracket-only, docs and editor config lines are not classed) (in apps/api/src/application/games.ts, apps/api/src/application/history.ts, apps/api/src/bootstrap.ts, apps/api/src/domain/ports.ts, apps/api/src/fireweave/fw-tracker.ts, apps/api/src/infrastructure/db/client.ts, apps/api/src/infrastructure/db/match-repo.ts, apps/api/src/infrastructure/observability/actions-catalog.ts, apps/api/src/infrastructure/observability/metrics-catalog.ts, apps/api/src/interfaces/http/router.ts, apps/web/src/App.tsx, apps/web/src/History.tsx, apps/web/src/api.ts, apps/web/src/fireweave/fw-tracker.ts, apps/web/src/styles.css, docker/compose.dev.yml, scripts/dev.sh). Classed by call site: fw at apps/api/src/application/games.ts:8 (2 reference(s), all on flag reads, so control); fw at apps/api/src/application/history.ts:8 (2 reference(s), all on flag reads, so control); fw at apps/web/src/History.tsx:4 (2 reference(s), all on flag reads, so control); GameBoard at apps/web/src/History.tsx:5 (1 reference(s), all inside the flag, so inside); GameMark at apps/web/src/History.tsx:6 (2 reference(s), all inside the flag, so inside); OutcomeFX at apps/web/src/History.tsx:7 (1 reference(s), all inside the flag, so inside); record at apps/web/src/History.tsx:8 (6 reference(s), all inside the flag, so inside); resultLabel at apps/web/src/History.tsx:10 (2 reference(s), all inside the flag, so inside); actorLabel at apps/web/src/History.tsx:17 (1 reference(s), all inside the flag, so inside). Whether the flag exists in production and both states are tested is not checked |
| Path | live | declared | `apps/api/src/bootstrap.ts:2`, `apps/api/src/main.ts:2`, `apps/api/src/bootstrap.ts:5`, `apps/api/src/interfaces/http/router.ts:8` +14. apps/api/src/application/games.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/application/history.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/bootstrap.ts reaches apps/api/src/main.ts in 1 import(s); apps/api/src/domain/ports.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/fireweave/fw-providers.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/infrastructure/db/client.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/infrastructure/db/match-repo.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/infrastructure/observability/metrics-catalog.ts reaches apps/api/src/main.ts in 3 import(s); apps/api/src/interfaces/http/router.ts reaches apps/api/src/main.ts in 1 import(s); apps/web/src/App.tsx reaches apps/web/src/main.tsx in 1 import(s); apps/web/src/History.tsx reaches apps/web/src/main.tsx in 2 import(s); apps/web/src/api.ts reaches apps/web/src/main.tsx in 2 import(s); apps/web/src/fireweave/fw-providers.ts reaches apps/web/src/main.tsx in 2 import(s); Shell is mounted by route (layout) with child routes (index), play/:gameId, scoreboard, history, history/:matchId, admin behind RequireAuth; not imported from any entry point: apps/api/src/fireweave/fw-tracker.ts, apps/api/src/infrastructure/observability/actions-catalog.ts, apps/web/src/fireweave/fw-tracker.ts. Import graph and routes measured; entry points declared by package.json scripts and index.html: apps/api/src/main.ts, apps/web/src/main.tsx. Not code paths, listed only: apps/web/src/styles.css (stylesheet), docker/compose.dev.yml (compose), scripts/dev.sh (script) |
| Reach | high | assumed | `apps/web/src/api.ts:148`, `apps/web/src/api.ts:98`, `apps/web/src/api.ts:149`, `apps/web/src/App.tsx:707` +15. measured: calls reach POST /api/client-telemetry (emitAction); POST /api/auth/register (services.auth.register, sessionCookie); POST /api/auth/login (services.auth.login, sessionCookie); GET /api/matches (services.auth.me, services.history.listHistory, sessionTokenFromRequest). Worth unknown because the metrics catalog declares no tier for any of its 33 entries, so reach is assumed wide. Not code paths, listed only: apps/web/src/styles.css (stylesheet), docker/compose.dev.yml (compose), scripts/dev.sh (script) |
| Failure mode | domain, infra | measured | `apps/api/src/application/games.ts:8`, `apps/api/src/application/history.ts:1`, `apps/api/src/bootstrap.ts:5`, `apps/api/src/domain/ports.ts:40` +15. rules on touched paths: apps/api/src/application/games.ts -> domain; apps/api/src/application/history.ts -> domain; apps/api/src/bootstrap.ts -> domain; apps/api/src/domain/ports.ts -> domain; apps/api/src/fireweave/fw-providers.ts -> domain; apps/api/src/fireweave/fw-tracker.ts -> domain; apps/api/src/infrastructure/db/client.ts -> infra; apps/api/src/infrastructure/db/match-repo.ts -> infra; apps/api/src/infrastructure/observability/actions-catalog.ts -> infra; apps/api/src/infrastructure/observability/metrics-catalog.ts -> infra; apps/api/src/interfaces/http/router.ts -> domain; apps/web/src/App.tsx -> domain; apps/web/src/History.tsx -> domain; apps/web/src/api.ts -> domain; apps/web/src/fireweave/fw-providers.ts -> domain; apps/web/src/fireweave/fw-tracker.ts -> domain; apps/web/src/styles.css -> cosmetic; docker/compose.dev.yml -> infra; scripts/dev.sh -> infra. Matched on file path; each evidence line is the file's first change |
| Failure mode (LLM second opinion) | unavailable | assumed | none. no ANTHROPIC_API_KEY; rules only |
| Detection apparatus | slow | measured | `apps/web/src/History.tsx:42`, `apps/web/src/History.tsx:104`, `apps/web/src/History.tsx:119`, `apps/web/src/History.tsx:124` +2. domain: no business-level check (no value metric, no test of the changed domain files); infra: error rate metric arcade_web_history_load_errors_total, latency metric arcade_web_replay_load_ms, error rate metric arcade_web_replay_load_errors_total, deploy health check. Every failure mode needs its detector, so detection is slow. 6 metric/log calls on changed lines (arcade_web_history_views_total: count, arcade_web_history_load_errors_total: error rate, arcade_web_replay_loads_total: count, arcade_web_replay_load_ms: latency, arcade_web_replay_load_errors_total: error rate). Checked in the repo only; alert config outside the repo (OpenObserve) is not an input |
| Time to revert | full build and deploy | assumed | `.github/workflows/deploy.yml:15`. no one-click rollback in 1 workflow file(s); CI run history is not an input, so pipeline duration is not measured. Declared job timeout: 5 min (a bound, not a measurement). Unknown rounds to slow: a full build and deploy to revert (W 2) |
| History | history unavailable | assumed | none. measured: 12 earlier commits touch the changed files, 0 reverts, 0 fix commits; repo history before base spans 6h (2026-10-06 to 2026-10-06). Too thin to read as a record (thin: < 5 commits or < 7 days) |
| Provenance | agent-assisted (Cursor) | measured | `commit 33a285e`. commit trailers: Cursor <cursoragent@cursor.com>; PR description: "Made with Cursor"; author(s) in git: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>. Whether a human was in the loop is not verifiable from the input |
| Confidence: test coverage | 0 of 16 changed code files have a test | measured | none. tests that import a changed file; 0 covered by tests that existed before the change. Uncovered: apps/api/src/application/games.ts, apps/api/src/application/history.ts, apps/api/src/bootstrap.ts, apps/api/src/domain/ports.ts, apps/api/src/fireweave/fw-providers.ts, apps/api/src/fireweave/fw-tracker.ts, apps/api/src/infrastructure/db/client.ts, apps/api/src/infrastructure/db/match-repo.ts, apps/api/src/infrastructure/observability/actions-catalog.ts, apps/api/src/infrastructure/observability/metrics-catalog.ts, apps/api/src/interfaces/http/router.ts, apps/web/src/App.tsx, apps/web/src/History.tsx, apps/web/src/api.ts, apps/web/src/fireweave/fw-providers.ts, apps/web/src/fireweave/fw-tracker.ts |
| Confidence: familiarity | single-author repo, people part dropped | measured | none. repo authors before base: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>; per file: apps/api/src/application/games.ts (1), apps/api/src/application/history.ts (0), apps/api/src/bootstrap.ts (1), apps/api/src/domain/ports.ts (1), apps/api/src/fireweave/fw-providers.ts (1), apps/api/src/fireweave/fw-tracker.ts (1), apps/api/src/infrastructure/db/client.ts (1), apps/api/src/infrastructure/db/match-repo.ts (1), apps/api/src/infrastructure/observability/actions-catalog.ts (1), apps/api/src/infrastructure/observability/metrics-catalog.ts (1), apps/api/src/interfaces/http/router.ts (1), apps/web/src/App.tsx (1), apps/web/src/History.tsx (0), apps/web/src/api.ts (1), apps/web/src/fireweave/fw-providers.ts (1), apps/web/src/fireweave/fw-tracker.ts (1), apps/web/src/styles.css (1), docker/compose.dev.yml (1), scripts/dev.sh (1). Reviewer familiarity needs review data: the PR export lists 0 reviews |
| Confidence: review depth | 0 reviews | declared | none. the PR export lists 0 reviews |
| Confidence: diff vs task (LLM) | unavailable | assumed | none. no ANTHROPIC_API_KEY |
| Secrets present at base | observed | measured | `scripts/dev.sh:23`. scripts/dev.sh:23 (URL credentials): present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence |

## Changed files

- `apps/api/src/application/games.ts` (modified, +12 -0)
- `apps/api/src/application/history.ts` (added, +170 -0)
- `apps/api/src/bootstrap.ts` (modified, +2 -0)
- `apps/api/src/domain/ports.ts` (modified, +19 -0)
- `apps/api/src/fireweave/fw-providers.ts` (modified, +1 -1)
- `apps/api/src/fireweave/fw-tracker.ts` (modified, +3 -1)
- `apps/api/src/infrastructure/db/client.ts` (modified, +3 -0)
- `apps/api/src/infrastructure/db/match-repo.ts` (modified, +60 -3)
- `apps/api/src/infrastructure/observability/actions-catalog.ts` (modified, +29 -0)
- `apps/api/src/infrastructure/observability/metrics-catalog.ts` (modified, +70 -0)
- `apps/api/src/interfaces/http/router.ts` (modified, +17 -0)
- `apps/web/src/App.tsx` (modified, +27 -0)
- `apps/web/src/History.tsx` (added, +203 -0)
- `apps/web/src/api.ts` (modified, +18 -0)
- `apps/web/src/fireweave/fw-providers.ts` (modified, +1 -1)
- `apps/web/src/fireweave/fw-tracker.ts` (modified, +1 -0)
- `apps/web/src/styles.css` (modified, +26 -0)
- `docker/compose.dev.yml` (modified, +3 -0)
- `scripts/dev.sh` (modified, +1 -0)
