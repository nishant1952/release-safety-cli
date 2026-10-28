# Release brief: Add bot difficulty levels for each game

Range `c49cd08..489d92b`, 27 files changed. Title: PR title, declared.

**Mode: Human.** Grid: high damage x long window = Human.

## Plan

| Step | Proposed |
|---|---|
| Exposure | Proposed by the system: Small slice, soak, widen; slice by flag percentage on `match-replay` for the code inside it; edits outside the flag reach everyone at deploy (rollout mechanism is not extracted, so all-at-once is assumed). Approved or edited by the owner |
| Soak per step | Proposed by the system: Hours, scaled to traffic (traffic is not an input, so the hours are not scaled). Approved or edited by the owner |
| Guardrails | Same as staged, plus whatever the owner adds. domain: business checks, none found on the changed path; infra: resources and latency, watch error rate metric arcade_web_difficulty_errors_total, measured (apps/web/src/App.tsx:322); deploy health check, declared (docker/compose.prod.yml:49, scripts/deploy-prod.sh:74) |
| Abort | Owner decides |
| Undo | flip `match-replay` off (flag partial, measured) for the code inside the flag; revert and redeploy (time to revert: full build and deploy, assumed) for the edits outside it. |
| Paged | Named owner before step one: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local> (earlier author of the most touched files, measured from git; the repo has no CODEOWNERS file) |
| Sign-off | Required before step one |

## Top reasons

1. High damage: the path is live (declared) and the reach is high (assumed). measured: calls reach POST /api/client-telemetry (emitAction); POST /api/auth/register (services.auth.register, sessionCookie); POST /api/auth/login (services.auth.login, sessionCookie). Worth unknown because the metrics catalog declares no tier for any of its 39 entries, so reach is assumed wide. Not code paths, listed only: apps/web/src/styles.css (stylesheet).
   - `apps/api/src/domain/ports.ts:1` `import type { GameEngine } from "@arcade/game-core";`
   - `apps/api/src/interfaces/http/router.ts:2` `import { AppError } from "@arcade/shared";`
   - `apps/web/src/App.tsx:772` `<Route path="play/:gameId" element={<PlayPage />} />`
   - `apps/api/src/interfaces/http/router.ts:82` `if (path === "/api/client-telemetry" && req.method === "POST") {`
   - and 2 more
2. Long window: undo is slow: the flag is partial (edits outside it use the revert path) and time to revert is full build and deploy (assumed); detection is slow (measured): domain: no business-level check (no value metric, no test of the changed domain files); infra: error rate metric arcade_web_difficulty_errors_total, deploy health check.
   - `.github/workflows/deploy.yml:15` `timeout-minutes: 5`
   - `apps/web/src/App.tsx:322` `void record("arcade_web_difficulty_errors_total", 1, {`
   - `docker/compose.prod.yml:49` `healthcheck:`
   - `scripts/deploy-prod.sh:74` `if curl -fsS --max-time 1 "http://127.0.0.1/api/health" >/dev/null 2>&1; then`
3. Probability: measured confidence is low, so the mode moves one step toward caution (already Human, no further step).
   - no line to cite: this reason rests on something missing from the input or the repo

## Confidence

**low**
- no test that existed before the change covers any of the 26 changed code files (measured)
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
| 3. Destructive schema or data change | pass | none | destructive schema change or mutation of existing data: pass (measured); additive schema change: pass (measured) |

Gate 2, additive API surface:
- `apps/api/src/application/games.ts:44` `export function parseDifficulty(value: unknown): BotDifficulty | undefined {`
- `apps/api/src/infrastructure/observability/metrics-catalog.ts:240` `name: "arcade_web_difficulty_views_total",`
- `apps/api/src/infrastructure/observability/metrics-catalog.ts:247` `name: "arcade_web_difficulty_selects_total",`
- `apps/api/src/infrastructure/observability/metrics-catalog.ts:254` `name: "arcade_web_difficulty_starts_total",`
- and 5 more

Gate 3, additive schema change:
- `apps/api/src/infrastructure/db/client.ts:70` `await sql'ALTER TABLE matches ADD COLUMN IF NOT EXISTS difficulty TEXT';`

## Provenance

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible or irreversible | reversible | measured | none. no persisted write, outbound side effect, queue publish or external API client in 486 added lines |
| Feature flag | partial | measured | `apps/web/src/App.tsx:235`, `apps/web/src/App.tsx:236`, `apps/web/src/App.tsx:282`, `apps/web/src/App.tsx:289` +109. flag `match-replay` (default false), `game-difficulty` (default false), `profile-avatar-menu` (default false), `header-arrangement` (default false), `match-replay` (default false): 15 added lines inside the flag, 9 control lines, 386 outside it (blank, comment, bracket-only, docs and editor config lines are not classed) (in apps/api/src/application/games.ts, apps/api/src/domain/ports.ts, apps/api/src/infrastructure/db/client.ts, apps/api/src/infrastructure/db/match-repo.ts, apps/api/src/infrastructure/observability/metrics-catalog.ts, apps/api/src/interfaces/http/router.ts, apps/web/src/App.tsx, apps/web/src/api.ts, apps/web/src/fireweave/fw-tracker.ts, apps/web/src/styles.css, packages/engines/src/games/connectfour.ts, packages/engines/src/games/dots-boxes.ts, packages/engines/src/games/hexapawn.ts, packages/engines/src/games/mancala.ts, packages/engines/src/games/marks.ts, packages/engines/src/games/memory.ts, packages/engines/src/games/nim.ts, packages/engines/src/games/placement.ts, packages/engines/src/games/reversi.ts, packages/engines/src/games/subtract-square.ts, packages/engines/src/games/tictactoe.ts, packages/engines/src/lib/difficulty.ts, packages/engines/src/lib/drop.ts, packages/engines/src/lib/line.ts, packages/game-core/src/index.ts, packages/shared/src/index.ts). Whether the flag exists in production and both states are tested is not checked |
| Path | live | declared | `apps/api/src/bootstrap.ts:2`, `apps/api/src/main.ts:2`, `apps/api/src/interfaces/http/router.ts:8`, `apps/api/src/main.ts:3` +28. apps/api/src/application/games.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/domain/ports.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/infrastructure/db/client.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/infrastructure/db/match-repo.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/infrastructure/observability/metrics-catalog.ts reaches apps/api/src/main.ts in 3 import(s); apps/api/src/interfaces/http/router.ts reaches apps/api/src/main.ts in 1 import(s); apps/web/src/App.tsx reaches apps/web/src/main.tsx in 1 import(s); apps/web/src/api.ts reaches apps/web/src/main.tsx in 2 import(s); apps/web/src/fireweave/fw-providers.ts reaches apps/web/src/main.tsx in 2 import(s); packages/engines/src/games/connectfour.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/dots-boxes.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/hexapawn.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/mancala.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/marks.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/memory.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/nim.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/placement.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/reversi.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/subtract-square.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/tictactoe.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/lib/difficulty.ts reaches apps/api/src/main.ts in 5 import(s); packages/engines/src/lib/drop.ts reaches apps/api/src/main.ts in 5 import(s); packages/engines/src/lib/line.ts reaches apps/api/src/main.ts in 5 import(s); packages/game-core/src/index.ts reaches apps/api/src/main.ts in 3 import(s); packages/shared/src/index.ts reaches apps/api/src/main.ts in 2 import(s); PlayPage is mounted by route play/:gameId; not imported from any entry point: apps/web/src/fireweave/fw-tracker.ts. Import graph and routes measured; entry points declared by package.json scripts and index.html: apps/api/src/main.ts, apps/web/src/main.tsx. Not code paths, listed only: apps/web/src/styles.css (stylesheet) |
| Reach | high | assumed | `apps/web/src/api.ts:150`, `apps/web/src/api.ts:102`, `apps/web/src/App.tsx:284`, `apps/web/src/observability/openobserve.ts:34` +12. measured: calls reach POST /api/client-telemetry (emitAction); POST /api/auth/register (services.auth.register, sessionCookie); POST /api/auth/login (services.auth.login, sessionCookie). Worth unknown because the metrics catalog declares no tier for any of its 39 entries, so reach is assumed wide. Not code paths, listed only: apps/web/src/styles.css (stylesheet) |
| Failure mode | domain, infra | measured | `apps/api/src/application/games.ts:1`, `apps/api/src/domain/ports.ts:33`, `apps/api/src/infrastructure/db/client.ts:70`, `apps/api/src/infrastructure/db/match-repo.ts:1` +23. rules on touched paths: apps/api/src/application/games.ts -> domain; apps/api/src/domain/ports.ts -> domain; apps/api/src/infrastructure/db/client.ts -> infra; apps/api/src/infrastructure/db/match-repo.ts -> infra; apps/api/src/infrastructure/observability/metrics-catalog.ts -> infra; apps/api/src/interfaces/http/router.ts -> domain; apps/web/src/App.tsx -> domain; apps/web/src/api.ts -> domain; apps/web/src/fireweave/fw-providers.ts -> domain; apps/web/src/fireweave/fw-tracker.ts -> domain; apps/web/src/styles.css -> cosmetic; packages/engines/src/games/connectfour.ts -> domain; packages/engines/src/games/dots-boxes.ts -> domain; packages/engines/src/games/hexapawn.ts -> domain; packages/engines/src/games/mancala.ts -> domain; packages/engines/src/games/marks.ts -> domain; packages/engines/src/games/memory.ts -> domain; packages/engines/src/games/nim.ts -> domain; packages/engines/src/games/placement.ts -> domain; packages/engines/src/games/reversi.ts -> domain; packages/engines/src/games/subtract-square.ts -> domain; packages/engines/src/games/tictactoe.ts -> domain; packages/engines/src/lib/difficulty.ts -> domain; packages/engines/src/lib/drop.ts -> domain; packages/engines/src/lib/line.ts -> domain; packages/game-core/src/index.ts -> domain; packages/shared/src/index.ts -> domain. Matched on file path; each evidence line is the file's first change |
| Failure mode (LLM second opinion) | unavailable | assumed | none. no ANTHROPIC_API_KEY; rules only |
| Detection apparatus | slow | measured | `apps/web/src/App.tsx:322`, `docker/compose.prod.yml:49`, `scripts/deploy-prod.sh:74`. domain: no business-level check (no value metric, no test of the changed domain files); infra: error rate metric arcade_web_difficulty_errors_total, deploy health check. Every failure mode needs its detector, so detection is slow. 4 metric/log calls on changed lines (arcade_web_difficulty_views_total: count, arcade_web_difficulty_starts_total: count, arcade_web_difficulty_errors_total: error rate, arcade_web_difficulty_selects_total: count). Checked in the repo only; alert config outside the repo (OpenObserve) is not an input |
| Time to revert | full build and deploy | assumed | `.github/workflows/deploy.yml:15`. no one-click rollback in 1 workflow file(s); CI run history is not an input, so pipeline duration is not measured. Declared job timeout: 5 min (a bound, not a measurement). Unknown rounds to slow: a full build and deploy to revert (W 2) |
| History | history unavailable | assumed | none. measured: 13 earlier commits touch the changed files, 0 reverts, 0 fix commits; repo history before base spans 24h (2026-10-06 to 2026-10-07). Too thin to read as a record (thin: < 5 commits or < 7 days) |
| Provenance | agent-assisted (Cursor) | measured | `commit 489d92b`. commit trailers: Cursor <cursoragent@cursor.com>; PR description: "Made with Cursor"; author(s) in git: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>. Whether a human was in the loop is not verifiable from the input |
| Confidence: test coverage | 0 of 26 changed code files have a test | measured | none. tests that import a changed file; 0 covered by tests that existed before the change. Uncovered: apps/api/src/application/games.ts, apps/api/src/domain/ports.ts, apps/api/src/infrastructure/db/client.ts, apps/api/src/infrastructure/db/match-repo.ts, apps/api/src/infrastructure/observability/metrics-catalog.ts, apps/api/src/interfaces/http/router.ts, apps/web/src/App.tsx, apps/web/src/api.ts, apps/web/src/fireweave/fw-providers.ts, apps/web/src/fireweave/fw-tracker.ts, packages/engines/src/games/connectfour.ts, packages/engines/src/games/dots-boxes.ts, packages/engines/src/games/hexapawn.ts, packages/engines/src/games/mancala.ts, packages/engines/src/games/marks.ts, packages/engines/src/games/memory.ts, packages/engines/src/games/nim.ts, packages/engines/src/games/placement.ts, packages/engines/src/games/reversi.ts, packages/engines/src/games/subtract-square.ts, packages/engines/src/games/tictactoe.ts, packages/engines/src/lib/difficulty.ts, packages/engines/src/lib/drop.ts, packages/engines/src/lib/line.ts, packages/game-core/src/index.ts, packages/shared/src/index.ts |
| Confidence: familiarity | single-author repo, people part dropped | measured | none. repo authors before base: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>; per file: apps/api/src/application/games.ts (1), apps/api/src/domain/ports.ts (1), apps/api/src/infrastructure/db/client.ts (1), apps/api/src/infrastructure/db/match-repo.ts (1), apps/api/src/infrastructure/observability/metrics-catalog.ts (1), apps/api/src/interfaces/http/router.ts (1), apps/web/src/App.tsx (1), apps/web/src/api.ts (1), apps/web/src/fireweave/fw-providers.ts (1), apps/web/src/fireweave/fw-tracker.ts (1), apps/web/src/styles.css (1), packages/engines/src/games/connectfour.ts (1), packages/engines/src/games/dots-boxes.ts (1), packages/engines/src/games/hexapawn.ts (1), packages/engines/src/games/mancala.ts (1), packages/engines/src/games/marks.ts (1), packages/engines/src/games/memory.ts (1), packages/engines/src/games/nim.ts (1), packages/engines/src/games/placement.ts (1), packages/engines/src/games/reversi.ts (1), packages/engines/src/games/subtract-square.ts (1), packages/engines/src/games/tictactoe.ts (1), packages/engines/src/lib/difficulty.ts (0), packages/engines/src/lib/drop.ts (1), packages/engines/src/lib/line.ts (1), packages/game-core/src/index.ts (1), packages/shared/src/index.ts (1). Reviewer familiarity needs review data: the PR export lists 1 reviews |
| Confidence: review depth | 1 reviews | declared | none. the PR export lists 1 reviews |
| Confidence: diff vs task (LLM) | unavailable | assumed | none. no ANTHROPIC_API_KEY |

## Changed files

- `apps/api/src/application/games.ts` (modified, +24 -6)
- `apps/api/src/domain/ports.ts` (modified, +8 -1)
- `apps/api/src/infrastructure/db/client.ts` (modified, +1 -0)
- `apps/api/src/infrastructure/db/match-repo.ts` (modified, +8 -7)
- `apps/api/src/infrastructure/observability/metrics-catalog.ts` (modified, +28 -0)
- `apps/api/src/interfaces/http/router.ts` (modified, +7 -2)
- `apps/web/src/App.tsx` (modified, +150 -4)
- `apps/web/src/api.ts` (modified, +7 -2)
- `apps/web/src/fireweave/fw-providers.ts` (modified, +1 -1)
- `apps/web/src/fireweave/fw-tracker.ts` (modified, +1 -0)
- `apps/web/src/styles.css` (modified, +91 -0)
- `packages/engines/src/games/connectfour.ts` (modified, +4 -3)
- `packages/engines/src/games/dots-boxes.ts` (modified, +7 -4)
- `packages/engines/src/games/hexapawn.ts` (modified, +10 -3)
- `packages/engines/src/games/mancala.ts` (modified, +5 -3)
- `packages/engines/src/games/marks.ts` (modified, +26 -6)
- `packages/engines/src/games/memory.ts` (modified, +8 -5)
- `packages/engines/src/games/nim.ts` (modified, +20 -3)
- `packages/engines/src/games/placement.ts` (modified, +8 -6)
- `packages/engines/src/games/reversi.ts` (modified, +5 -3)
- `packages/engines/src/games/subtract-square.ts` (modified, +11 -4)
- `packages/engines/src/games/tictactoe.ts` (modified, +27 -5)
- `packages/engines/src/lib/difficulty.ts` (added, +9 -0)
- `packages/engines/src/lib/drop.ts` (modified, +7 -5)
- `packages/engines/src/lib/line.ts` (modified, +5 -3)
- `packages/game-core/src/index.ts` (modified, +4 -1)
- `packages/shared/src/index.ts` (modified, +4 -0)
