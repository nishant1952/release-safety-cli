# Release brief: Add lobby pins and decisive bots

Range `32683da..04c6f86`, 19 files changed. Title: PR title, declared.

**Mode: Human.** Grid: high damage x long window = Human.

## Plan

| Step | Proposed |
|---|---|
| Exposure | Proposed by the system: Small slice, soak, widen; slice by flag percentage on `match-replay` for the code inside it; edits outside the flag reach everyone at deploy (rollout mechanism is not extracted, so all-at-once is assumed). Approved or edited by the owner |
| Soak per step | Proposed by the system: Hours, scaled to traffic (traffic is not an input, so the hours are not scaled). Approved or edited by the owner |
| Guardrails | Same as staged, plus whatever the owner adds. domain: business checks, none found on the changed path; infra: resources and latency, watch error rate metric arcade_web_pin_errors_total, measured (apps/web/src/Lobby.tsx:145); deploy health check, declared (docker/compose.prod.yml:49, scripts/deploy-prod.sh:74) |
| Abort | Owner decides |
| Undo | flip `match-replay` off (flag partial, measured) for the code inside the flag; revert and redeploy (time to revert: full build and deploy, assumed) for the edits outside it. |
| Paged | Named owner before step one: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local> (earlier author of the most touched files, measured from git; the repo has no CODEOWNERS file) |
| Sign-off | Required before step one |

## Top reasons

1. Gate 1: Red advisory checks, no required checks on the repo: FireWeave — flag contract (FAILURE), FireWeave — rollout readiness (FAILURE). Not required, so it cannot block; each lowers confidence one notch.
   - no line to cite: this reason rests on the PR export's check rollup and required-checks.json (declared and measured), not on a line of code
2. High damage: the path is live (declared) and the reach is high (assumed). measured: calls reach POST /api/client-telemetry (emitAction); POST /api/auth/register (services.auth.register, sessionCookie); POST /api/auth/login (services.auth.login, sessionCookie); GET /api/pins (services.auth.me, services.games.listPins, sessionTokenFromRequest). Worth unknown because the metrics catalog declares no tier for any of its 35 entries, so reach is assumed wide. Not code paths, listed only: apps/web/src/styles.css (stylesheet).
   - `packages/engines/src/index.ts:9` `import { reversiEngine } from "./games/reversi";`
   - `packages/engines/src/games/drops.ts:1` `import { dropEngine } from "../lib/drop";`
   - `packages/engines/src/index.ts:6` `import { popOutEngine, powerFourEngine } from "./games/drops";`
   - `apps/api/src/interfaces/http/router.ts:82` `if (path === "/api/client-telemetry" && req.method === "POST") {`
   - and 3 more
3. Long window: undo is slow: the flag is partial (edits outside it use the revert path) and time to revert is full build and deploy (assumed); detection is slow (measured): domain: no business-level check (no value metric, no test of the changed domain files); infra: error rate metric arcade_web_pin_errors_total, deploy health check.
   - `.github/workflows/deploy.yml:15` `timeout-minutes: 5`
   - `apps/web/src/Lobby.tsx:145` `void metric("arcade_web_pin_errors_total", 1, { surface: "web", reason });`
   - `docker/compose.prod.yml:49` `healthcheck:`
   - `scripts/deploy-prod.sh:74` `if curl -fsS --max-time 1 "http://127.0.0.1/api/health" >/dev/null 2>&1; then`
4. Probability: measured confidence is low, so the mode moves one step toward caution (already Human, no further step).
   - no line to cite: this reason rests on something missing from the input or the repo

## Confidence

**low**
- no test that existed before the change covers any of the 18 changed code files (measured)
- single-author repo: familiarity dropped (W appendix)
- Failure mode (LLM second opinion): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- History: history unavailable (assumed), lowers confidence, does not raise risk (W 2)
- Confidence: diff vs task (LLM): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- gate 1: red advisory check FireWeave — flag contract (FAILURE), not required on the repo, lowers confidence one notch
- gate 1: red advisory check FireWeave — rollout readiness (FAILURE), not required on the repo, lowers confidence one notch

## The one unknown

No single assumed input changes the mode. Considered: Reach (high); Time to revert (full build and deploy); Failure mode (LLM second opinion) (cannot move the mode); History (cannot move the mode); Confidence: diff vs task (LLM) (cannot move the mode). With all of them at their favourable value the mode is Human, so the call rests on what is known: Detection apparatus slow (measured), without which it would be Staged; confidence low (measured), without which it would be Staged.

## Disagreements

Disagreements: none between sources.

## Gates

| Gate | Result | Route | Checks |
|---|---|---|---|
| 1. Table stakes | pass | none | secrets: pass (measured); PII: pass (measured); hardcoded environment values: pass (measured); required CI checks: pass (measured); advisory CI checks: pass (declared) |
| 2. API contract | pass | none | breaking change to route, schema or public signature: pass (measured); additive API surface: pass (measured) |
| 3. Destructive schema or data change | pass | none | destructive schema change or mutation of existing data: pass (measured); additive schema change: pass (measured) |

Gate 2, additive API surface:
- `apps/api/src/infrastructure/db/pin-repo.ts:3` `export const pinRepo = {`
- `apps/api/src/infrastructure/observability/metrics-catalog.ts:240` `name: "arcade_web_pins_total",`
- `apps/api/src/infrastructure/observability/metrics-catalog.ts:247` `name: "arcade_web_pin_errors_total",`
- `apps/api/src/interfaces/http/router.ts:174` `if (path === "/api/pins" && req.method === "GET") {`

Gate 3, additive schema change:
- `apps/api/src/infrastructure/db/client.ts:76` `CREATE TABLE IF NOT EXISTS pins (`

## Provenance

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible or irreversible | reversible | measured | none. no persisted write, outbound side effect, queue publish or external API client in 803 added lines |
| Feature flag | partial | measured | `apps/api/src/application/games.ts:41`, `apps/api/src/application/games.ts:42`, `apps/web/src/Lobby.tsx:4`, `apps/web/src/Lobby.tsx:36` +113. flag `match-replay` (default false), `pin-games` (default false): 23 added lines inside the flag, 16 control lines, 621 outside it (blank, comment, bracket-only, docs and editor config lines are not classed) (in apps/api/src/application/games.ts, apps/api/src/bootstrap.ts, apps/api/src/infrastructure/db/client.ts, apps/api/src/infrastructure/db/pin-repo.ts, apps/api/src/infrastructure/observability/metrics-catalog.ts, apps/api/src/interfaces/http/router.ts, apps/web/src/Lobby.tsx, apps/web/src/api.ts, apps/web/src/fireweave/fw-tracker.ts, apps/web/src/styles.css, packages/engines/src/games/dots-boxes.ts, packages/engines/src/games/hexapawn.ts, packages/engines/src/games/mancala.ts, packages/engines/src/games/marks.ts, packages/engines/src/games/memory.ts, packages/engines/src/games/placement.ts, packages/engines/src/games/reversi.ts, packages/engines/src/lib/drop.ts). Classed by call site: fw at apps/web/src/Lobby.tsx:4 (1 reference(s), all on flag reads, so control). Whether the flag exists in production and both states are tested is not checked |
| Path | live | declared | `apps/api/src/bootstrap.ts:2`, `apps/api/src/main.ts:2`, `apps/api/src/bootstrap.ts:6`, `apps/api/src/bootstrap.ts:10` +19. apps/api/src/application/games.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/bootstrap.ts reaches apps/api/src/main.ts in 1 import(s); apps/api/src/infrastructure/db/client.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/infrastructure/db/pin-repo.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/infrastructure/observability/metrics-catalog.ts reaches apps/api/src/main.ts in 3 import(s); apps/api/src/interfaces/http/router.ts reaches apps/api/src/main.ts in 1 import(s); apps/web/src/Lobby.tsx reaches apps/web/src/main.tsx in 2 import(s); apps/web/src/api.ts reaches apps/web/src/main.tsx in 2 import(s); apps/web/src/fireweave/fw-providers.ts reaches apps/web/src/main.tsx in 2 import(s); packages/engines/src/games/dots-boxes.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/hexapawn.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/mancala.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/marks.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/memory.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/placement.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/reversi.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/lib/drop.ts reaches apps/api/src/main.ts in 5 import(s); not imported from any entry point: apps/web/src/fireweave/fw-tracker.ts. Import graph and routes measured; entry points declared by package.json scripts and index.html: apps/api/src/main.ts, apps/web/src/main.tsx. Not code paths, listed only: apps/web/src/styles.css (stylesheet) |
| Reach | high | assumed | `apps/web/src/api.ts:141`, `apps/web/src/api.ts:100`, `apps/web/src/api.ts:143`, `apps/web/src/api.ts:145` +17. measured: calls reach POST /api/client-telemetry (emitAction); POST /api/auth/register (services.auth.register, sessionCookie); POST /api/auth/login (services.auth.login, sessionCookie); GET /api/pins (services.auth.me, services.games.listPins, sessionTokenFromRequest). Worth unknown because the metrics catalog declares no tier for any of its 35 entries, so reach is assumed wide. Not code paths, listed only: apps/web/src/styles.css (stylesheet) |
| Failure mode | domain, infra | measured | `apps/api/src/application/games.ts:40`, `apps/api/src/bootstrap.ts:10`, `apps/api/src/infrastructure/db/client.ts:74`, `apps/api/src/infrastructure/db/pin-repo.ts:1` +15. rules on touched paths: apps/api/src/application/games.ts -> domain; apps/api/src/bootstrap.ts -> domain; apps/api/src/infrastructure/db/client.ts -> infra; apps/api/src/infrastructure/db/pin-repo.ts -> infra; apps/api/src/infrastructure/observability/metrics-catalog.ts -> infra; apps/api/src/interfaces/http/router.ts -> domain; apps/web/src/Lobby.tsx -> domain; apps/web/src/api.ts -> domain; apps/web/src/fireweave/fw-providers.ts -> domain; apps/web/src/fireweave/fw-tracker.ts -> domain; apps/web/src/styles.css -> cosmetic; packages/engines/src/games/dots-boxes.ts -> domain; packages/engines/src/games/hexapawn.ts -> domain; packages/engines/src/games/mancala.ts -> domain; packages/engines/src/games/marks.ts -> domain; packages/engines/src/games/memory.ts -> domain; packages/engines/src/games/placement.ts -> domain; packages/engines/src/games/reversi.ts -> domain; packages/engines/src/lib/drop.ts -> domain. Matched on file path; each evidence line is the file's first change |
| Failure mode (LLM second opinion) | unavailable | assumed | none. no ANTHROPIC_API_KEY; rules only |
| Detection apparatus | slow | measured | `apps/web/src/Lobby.tsx:145`, `docker/compose.prod.yml:49`, `scripts/deploy-prod.sh:74`. domain: no business-level check (no value metric, no test of the changed domain files); infra: error rate metric arcade_web_pin_errors_total, deploy health check. Every failure mode needs its detector, so detection is slow. 2 metric/log calls on changed lines (arcade_web_pins_total: count, arcade_web_pin_errors_total: error rate). Checked in the repo only; alert config outside the repo (OpenObserve) is not an input |
| Time to revert | full build and deploy | assumed | `.github/workflows/deploy.yml:15`. no one-click rollback in 1 workflow file(s); CI run history is not an input, so pipeline duration is not measured. Declared job timeout: 5 min (a bound, not a measurement). Unknown rounds to slow: a full build and deploy to revert (W 2) |
| History | history unavailable | assumed | none. measured: 11 earlier commits touch the changed files, 0 reverts, 0 fix commits; repo history before base spans 8h (2026-10-06 to 2026-10-06). Too thin to read as a record (thin: < 5 commits or < 7 days) |
| Provenance | agent-assisted (Cursor) | measured | `commit 04c6f86`. commit trailers: Cursor <cursoragent@cursor.com>; PR description: "Made with Cursor"; author(s) in git: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>. Whether a human was in the loop is not verifiable from the input |
| Confidence: test coverage | 0 of 18 changed code files have a test | measured | none. tests that import a changed file; 0 covered by tests that existed before the change. Uncovered: apps/api/src/application/games.ts, apps/api/src/bootstrap.ts, apps/api/src/infrastructure/db/client.ts, apps/api/src/infrastructure/db/pin-repo.ts, apps/api/src/infrastructure/observability/metrics-catalog.ts, apps/api/src/interfaces/http/router.ts, apps/web/src/Lobby.tsx, apps/web/src/api.ts, apps/web/src/fireweave/fw-providers.ts, apps/web/src/fireweave/fw-tracker.ts, packages/engines/src/games/dots-boxes.ts, packages/engines/src/games/hexapawn.ts, packages/engines/src/games/mancala.ts, packages/engines/src/games/marks.ts, packages/engines/src/games/memory.ts, packages/engines/src/games/placement.ts, packages/engines/src/games/reversi.ts, packages/engines/src/lib/drop.ts |
| Confidence: familiarity | single-author repo, people part dropped | measured | none. repo authors before base: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>; per file: apps/api/src/application/games.ts (1), apps/api/src/bootstrap.ts (1), apps/api/src/infrastructure/db/client.ts (1), apps/api/src/infrastructure/db/pin-repo.ts (0), apps/api/src/infrastructure/observability/metrics-catalog.ts (1), apps/api/src/interfaces/http/router.ts (1), apps/web/src/Lobby.tsx (1), apps/web/src/api.ts (1), apps/web/src/fireweave/fw-providers.ts (1), apps/web/src/fireweave/fw-tracker.ts (1), apps/web/src/styles.css (1), packages/engines/src/games/dots-boxes.ts (1), packages/engines/src/games/hexapawn.ts (1), packages/engines/src/games/mancala.ts (1), packages/engines/src/games/marks.ts (1), packages/engines/src/games/memory.ts (1), packages/engines/src/games/placement.ts (1), packages/engines/src/games/reversi.ts (1), packages/engines/src/lib/drop.ts (1). Reviewer familiarity needs review data: the PR export lists 0 reviews |
| Confidence: review depth | 0 reviews | declared | none. the PR export lists 0 reviews |
| Confidence: diff vs task (LLM) | unavailable | assumed | none. no ANTHROPIC_API_KEY |

## Changed files

- `apps/api/src/application/games.ts` (modified, +44 -8)
- `apps/api/src/bootstrap.ts` (modified, +2 -1)
- `apps/api/src/infrastructure/db/client.ts` (modified, +9 -0)
- `apps/api/src/infrastructure/db/pin-repo.ts` (added, +21 -0)
- `apps/api/src/infrastructure/observability/metrics-catalog.ts` (modified, +14 -0)
- `apps/api/src/interfaces/http/router.ts` (modified, +17 -0)
- `apps/web/src/Lobby.tsx` (modified, +125 -23)
- `apps/web/src/api.ts` (modified, +12 -5)
- `apps/web/src/fireweave/fw-providers.ts` (modified, +1 -1)
- `apps/web/src/fireweave/fw-tracker.ts` (modified, +1 -0)
- `apps/web/src/styles.css` (modified, +22 -0)
- `packages/engines/src/games/dots-boxes.ts` (modified, +61 -3)
- `packages/engines/src/games/hexapawn.ts` (modified, +43 -8)
- `packages/engines/src/games/mancala.ts` (modified, +59 -13)
- `packages/engines/src/games/marks.ts` (modified, +160 -33)
- `packages/engines/src/games/memory.ts` (modified, +11 -3)
- `packages/engines/src/games/placement.ts` (modified, +77 -4)
- `packages/engines/src/games/reversi.ts` (modified, +47 -7)
- `packages/engines/src/lib/drop.ts` (modified, +77 -6)
