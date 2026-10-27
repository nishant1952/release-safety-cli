# Release brief: Arcade multi-game centre + rebrand

Range `549a1bc..3b9c7ed`, 54 files changed. Title: PR title, declared.

**Mode: Human.** Grid: high damage x long window = Human. Gates route to Human.

## Plan

| Step | Proposed |
|---|---|
| Exposure | Proposed by the system: Small slice, soak, widen; slice by canary or percentage deploy (rollout mechanism is not extracted, so all-at-once is assumed). Approved or edited by the owner |
| Soak per step | Proposed by the system: Hours, scaled to traffic (traffic is not an input, so the hours are not scaled). Approved or edited by the owner |
| Guardrails | Same as staged, plus whatever the owner adds. domain: business checks, watch value metric info, measured (apps/api/src/main.ts:20); infra: resources and latency, watch error rate metric error, measured (apps/api/src/interfaces/http/router.ts:173); deploy health check, declared (docker-compose.prod.yml:44, scripts/deploy-prod.sh:66); security: auth errors, none found on the changed path |
| Abort | Owner decides |
| Undo | Without one, undo is a rollback or redeploy and a slice is a canary or percentage deploy. Undo: revert and redeploy (time to revert: full build and deploy, assumed). |
| Paged | Named owner before step one: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local> (earlier author of the most touched files, measured from git; the repo has no CODEOWNERS file) |
| Sign-off | Required before step one |

## Top reasons

1. Gate 1 (Table stakes) is trip, so it routes to a human: hardcoded environment values: 2 added line(s) match.
   - `apps/api/src/main.ts:35` `console.log('arcade centre on http://localhost:${server.port}');`
   - `apps/web/vite.config.ts:8` `proxy: { "/api": "http://localhost:3000" },`
2. Gate 2 (API contract) is trip, so it routes to a human: breaking change to route, schema or public signature: removed or changed API surface; whether a removed or changed export is public is read from package.json (declared).
   - `server/src/index.ts@549a1bc:105` `if (path === "/api/metrics/streams" && req.method === "GET") {`
   - `server/src/index.ts@549a1bc:152` `if (path === "/api/game" && req.method === "GET") {`
   - `server/src/index.ts@549a1bc:184` `if (path === "/api/game/new" && req.method === "POST") {`
   - `server/src/index.ts@549a1bc:211` `if (path === "/api/game/move" && req.method === "POST") {`
   - and 1 more
3. Gate 3 (Destructive schema or data change) is trip, so it routes to a human: destructive schema change or mutation of existing data: schema drop/alter, or UPDATE/DELETE/ORM bulk write without a WHERE clause or in a migration/SQL file.
   - `server/src/db.ts@549a1bc:32` `CREATE TABLE IF NOT EXISTS games (`
4. High damage: the path is live (declared) and the reach is high (assumed). measured: calls reach POST /api/auth/register (services.auth.register, sessionCookie); POST /api/auth/login (services.auth.login, sessionCookie); POST /api/auth/logout (clearSessionCookie, services.auth.logout, sessionTokenFromRequest); GET /api/auth/me (services.auth.me, sessionTokenFromRequest); GET /api/games (services.games.listGames); GET /api/scoreboard (services.auth.me, services.scoreboard.forUser, services.scoreboard.leaderboard, sessionTokenFromRequest); GET /api/admin/insights (join, log, services.admin.insights, services.auth.me, sessionTokenFromRequest). Worth unknown because the metrics catalog (apps/api/src/infrastructure/observability/metrics-catalog.ts) is not in the repo, so reach is assumed wide. Not code paths, listed only: README.md (docs), apps/web/src/styles.css (stylesheet), bun.lock (lockfile), client/src/styles.css (stylesheet), docker-compose.prod.yml (compose), docker-compose.yml (compose), scripts/deploy-prod.sh (script).
   - `apps/api/src/infrastructure/engines/registry.ts:2` `import { ticTacToeEngine } from "@arcade/engine-tictactoe";`
   - `apps/api/src/infrastructure/engines/registry.ts:1` `import { EngineRegistry } from "@arcade/game-core";`
   - `apps/api/src/application/admin.ts:1` `import { AppError, type PublicUser } from "@arcade/shared";`
   - `apps/api/src/interfaces/http/router.ts:71` `if (path === "/api/auth/register" && req.method === "POST") {`
   - and 6 more
5. Long window: the change is irreversible; undo is slow: the flag is none and time to revert is full build and deploy (assumed); detection is slow (assumed): domain: value metric info; infra: error rate metric error, deploy health check; security: no auth-error alert.
   - `.github/workflows/deploy.yml:15` `timeout-minutes: 5`
   - `apps/api/src/main.ts:20` `await log("info", "server.start", { port: PORT, centre: true });`
   - `apps/api/src/interfaces/http/router.ts:173` `if (ctx) void log("error", "request.error", { message, route: ctx.route }, ctx);`
   - `docker-compose.prod.yml:44` `healthcheck:`
6. Probability: measured confidence is low, so the mode moves one step toward caution (already Human, no further step).
   - no line to cite: this reason rests on something missing from the input or the repo

## Confidence

**low**
- no test that existed before the change covers any of the 25 changed code files (measured)
- single-author repo: familiarity dropped (W appendix)
- Secrets present at base: observed (measured), .env.example:9 (email), .env.example:10 (credential), apps/api/src/infrastructure/db/client.ts:4 (URL credentials), docker-compose.yml:28 (URL credentials): present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence
- Failure mode (LLM second opinion): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- History: history unavailable (assumed), lowers confidence, does not raise risk (W 2)
- Confidence: diff vs task (LLM): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- gate 2: 14 export(s) removed or changed in modules internal to the repo (declared by package.json), lowers confidence one notch

## The one unknown

No single assumed input changes the mode. Considered: Reach (high); Detection apparatus (slow); Time to revert (full build and deploy); Failure mode (LLM second opinion) (cannot move the mode); History (cannot move the mode); Confidence: diff vs task (LLM) (cannot move the mode). With all of them at their favourable value the mode is Human, and no single known input changes it either.

## Disagreements

Disagreements: none between sources.

## Gates

| Gate | Result | Route | Checks |
|---|---|---|---|
| 1. Table stakes | trip | human | secrets: pass (measured); PII: pass (measured); hardcoded environment values: trip (measured); required CI checks: pass (measured) |
| 2. API contract | trip | human | breaking change to route, schema or public signature: trip (declared); moved routes and exports: pass (measured); internal signature changes: pass (declared); additive API surface: pass (measured) |
| 3. Destructive schema or data change | trip | human | destructive schema change or mutation of existing data: trip (measured); additive schema change: pass (measured) |

Gate 1, hardcoded environment values:
- `apps/api/src/main.ts:35` `console.log('arcade centre on http://localhost:${server.port}');`
- `apps/web/vite.config.ts:8` `proxy: { "/api": "http://localhost:3000" },`

Gate 2, breaking change to route, schema or public signature:
- `server/src/index.ts@549a1bc:105` `if (path === "/api/metrics/streams" && req.method === "GET") {`
- `server/src/index.ts@549a1bc:152` `if (path === "/api/game" && req.method === "GET") {`
- `server/src/index.ts@549a1bc:184` `if (path === "/api/game/new" && req.method === "POST") {`
- `server/src/index.ts@549a1bc:211` `if (path === "/api/game/move" && req.method === "POST") {`
- and 1 more

Gate 2, moved routes and exports:
- `client/src/App.tsx@549a1bc:208` `export default function App() {`
- `apps/web/src/App.tsx:436` `export default function App() {`
- `client/src/api.ts@549a1bc:1` `export type User = { id: number; username: string };`
- `apps/web/src/api.ts:1` `export type User = { id: number; username: string; role: "user" | "admin" };`
- and 26 more

Gate 2, internal signature changes:
- `client/src/api.ts@549a1bc:2` `export type Board = Array<"X" | "O" | "">;`
- `client/src/api.ts@549a1bc:3` `export type Game = {`
- `client/src/api.ts@549a1bc:9` `export type Stats = {`
- `server/src/auth.ts@549a1bc:34` `export async function register(username: string, password: string) {`
- and 10 more

Gate 2, additive API surface:
- `apps/api/src/application/admin.ts:4` `export function createAdminUseCases(deps: {`
- `apps/api/src/application/admin.ts:56` `export type AdminUseCases = ReturnType<typeof createAdminUseCases>;`
- `apps/api/src/application/auth.ts:7` `export function createAuthUseCases(deps: {`
- `apps/api/src/application/auth.ts:69` `export type AuthUseCases = ReturnType<typeof createAuthUseCases>;`
- and 57 more

Gate 3, destructive schema change or mutation of existing data:
- `server/src/db.ts@549a1bc:32` `CREATE TABLE IF NOT EXISTS games (`

Gate 3, additive schema change:
- `apps/api/src/infrastructure/db/client.ts:34` `await sql'ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'';`
- `apps/api/src/infrastructure/db/client.ts:46` `CREATE TABLE IF NOT EXISTS matches (`
- `apps/api/src/infrastructure/db/client.ts:59` `CREATE TABLE IF NOT EXISTS match_events (`
- `apps/api/src/infrastructure/db/client.ts:69` `await sql'CREATE INDEX IF NOT EXISTS idx_matches_user_game ON matches(user_id, game_id, status)';`
- and 1 more

## Provenance

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible or irreversible | irreversible | measured | `apps/web/src/api.ts:52`, `server/src/db.ts@549a1bc:32`. persisted write in the diff: a redeploy cannot undo these. HTTP call, target not resolved one hop in the diff: treated as irreversible because it may leave effects a redeploy cannot undo |
| Feature flag | none | measured | none. no flag call (getBooleanValue) or control point anchor in the changed files |
| Path | live | declared | `apps/api/src/main.ts:4`, `apps/api/src/main.ts:1`, `apps/api/src/main.ts:2`, `apps/api/src/main.ts:3` +18. apps/api/src/application/admin.ts reaches apps/api/src/main.ts in 1 import(s); apps/api/src/application/auth.ts reaches apps/api/src/main.ts in 1 import(s); apps/api/src/application/games.ts reaches apps/api/src/main.ts in 1 import(s); apps/api/src/application/scoreboard.ts reaches apps/api/src/main.ts in 1 import(s); apps/api/src/domain/ports.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/infrastructure/auth/password.ts reaches apps/api/src/main.ts in 1 import(s); apps/api/src/infrastructure/db/client.ts reaches apps/api/src/main.ts in 1 import(s); apps/api/src/infrastructure/db/match-repo.ts reaches apps/api/src/main.ts in 1 import(s); apps/api/src/infrastructure/db/session-repo.ts reaches apps/api/src/main.ts in 1 import(s); apps/api/src/infrastructure/db/user-repo.ts reaches apps/api/src/main.ts in 1 import(s); apps/api/src/infrastructure/engines/registry.ts reaches apps/api/src/main.ts in 1 import(s); apps/api/src/infrastructure/observability/adapter.ts reaches apps/api/src/main.ts in 1 import(s); apps/api/src/infrastructure/observability/openobserve.ts reaches apps/api/src/main.ts in 1 import(s); apps/api/src/interfaces/http/cookies.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/interfaces/http/router.ts reaches apps/api/src/main.ts in 1 import(s); apps/api/src/main.ts reaches apps/api/src/main.ts; apps/web/src/App.tsx reaches apps/web/src/main.tsx in 1 import(s); apps/web/src/api.ts reaches apps/web/src/main.tsx in 2 import(s); apps/web/src/main.tsx reaches apps/web/src/main.tsx; packages/engine-connectfour/src/index.ts reaches apps/api/src/main.ts in 2 import(s); packages/engine-rps/src/index.ts reaches apps/api/src/main.ts in 2 import(s); packages/engine-tictactoe/src/index.ts reaches apps/api/src/main.ts in 2 import(s); packages/game-core/src/index.ts reaches apps/api/src/main.ts in 2 import(s); packages/shared/src/index.ts reaches apps/api/src/main.ts in 2 import(s); not imported from any entry point: .env.example, Dockerfile, apps/api/package.json, apps/web/index.html, apps/web/package.json, apps/web/tsconfig.json, apps/web/vite.config.ts, package.json, packages/engine-connectfour/package.json, packages/engine-rps/package.json, packages/engine-tictactoe/package.json, packages/game-core/package.json, packages/shared/package.json, start, start.prod, stop, stop.prod. Import graph and routes measured; entry points declared by package.json scripts and index.html: apps/api/src/main.ts, apps/web/src/main.tsx. Not code paths, listed only: README.md (docs), apps/web/src/styles.css (stylesheet), bun.lock (lockfile), client/src/styles.css (stylesheet), docker-compose.prod.yml (compose), docker-compose.yml (compose), scripts/deploy-prod.sh (script) |
| Reach | high | assumed | `apps/web/src/App.tsx:367`, `apps/web/src/api.ts:85`, `apps/web/src/App.tsx:25`, `apps/web/src/api.ts:65` +31. measured: calls reach POST /api/auth/register (services.auth.register, sessionCookie); POST /api/auth/login (services.auth.login, sessionCookie); POST /api/auth/logout (clearSessionCookie, services.auth.logout, sessionTokenFromRequest); GET /api/auth/me (services.auth.me, sessionTokenFromRequest); GET /api/games (services.games.listGames); GET /api/scoreboard (services.auth.me, services.scoreboard.forUser, services.scoreboard.leaderboard, sessionTokenFromRequest); GET /api/admin/insights (join, log, services.admin.insights, services.auth.me, sessionTokenFromRequest). Worth unknown because the metrics catalog (apps/api/src/infrastructure/observability/metrics-catalog.ts) is not in the repo, so reach is assumed wide. Not code paths, listed only: README.md (docs), apps/web/src/styles.css (stylesheet), bun.lock (lockfile), client/src/styles.css (stylesheet), docker-compose.prod.yml (compose), docker-compose.yml (compose), scripts/deploy-prod.sh (script) |
| Failure mode | domain, infra, security | measured | `.env.example:11`, `Dockerfile:5`, `README.md:1`, `apps/api/package.json:1` +50. rules on touched paths: .env.example -> domain; Dockerfile -> infra; README.md -> none; apps/api/package.json -> infra; apps/api/src/application/admin.ts -> domain; apps/api/src/application/auth.ts -> security; apps/api/src/application/games.ts -> domain; apps/api/src/application/scoreboard.ts -> domain; apps/api/src/domain/ports.ts -> domain; apps/api/src/infrastructure/auth/password.ts -> security; apps/api/src/infrastructure/db/client.ts -> infra; apps/api/src/infrastructure/db/match-repo.ts -> infra; apps/api/src/infrastructure/db/session-repo.ts -> security; apps/api/src/infrastructure/db/user-repo.ts -> infra; apps/api/src/infrastructure/engines/registry.ts -> infra; apps/api/src/infrastructure/observability/adapter.ts -> infra; apps/api/src/infrastructure/observability/openobserve.ts -> infra; apps/api/src/interfaces/http/cookies.ts -> security; apps/api/src/interfaces/http/router.ts -> domain; apps/api/src/main.ts -> domain; apps/web/index.html -> domain; apps/web/package.json -> infra; apps/web/src/App.tsx -> domain; apps/web/src/api.ts -> domain; apps/web/src/main.tsx -> domain; apps/web/src/styles.css -> cosmetic; apps/web/tsconfig.json -> domain; apps/web/vite.config.ts -> domain; bun.lock -> infra; client/src/App.tsx -> domain; client/src/api.ts -> domain; client/src/styles.css -> cosmetic; docker-compose.prod.yml -> infra; docker-compose.yml -> infra; package.json -> infra; packages/engine-connectfour/package.json -> infra; packages/engine-connectfour/src/index.ts -> domain; packages/engine-rps/package.json -> infra; packages/engine-rps/src/index.ts -> domain; packages/engine-tictactoe/package.json -> infra; packages/engine-tictactoe/src/index.ts -> domain; packages/game-core/package.json -> infra; packages/game-core/src/index.ts -> domain; packages/shared/package.json -> infra; packages/shared/src/index.ts -> domain; scripts/deploy-prod.sh -> infra; server/package.json -> infra; server/src/auth.ts -> security; server/src/game.ts -> domain; server/src/index.ts -> domain; start -> domain; start.prod -> domain; stop -> domain; stop.prod -> domain. Matched on file path; each evidence line is the file's first change |
| Failure mode (LLM second opinion) | unavailable | assumed | none. no ANTHROPIC_API_KEY; rules only |
| Detection apparatus | slow | assumed | `apps/api/src/main.ts:20`, `apps/api/src/interfaces/http/router.ts:173`, `docker-compose.prod.yml:44`, `scripts/deploy-prod.sh:66`. domain: value metric info; infra: error rate metric error, deploy health check; security: no auth-error alert. Every failure mode needs its detector, so detection is slow. 8 metric/log calls on changed lines (traceSpan: count, startRequest: count, finishRequest: count, verifyInjection: count, listStreams: count, error: error rate, info: value, log: log). Checked in the repo only; alert config outside the repo (OpenObserve) is not an input |
| Time to revert | full build and deploy | assumed | `.github/workflows/deploy.yml:15`. no one-click rollback in 1 workflow file(s); CI run history is not an input, so pipeline duration is not measured. Declared job timeout: 5 min (a bound, not a measurement). Unknown rounds to slow: a full build and deploy to revert (W 2) |
| History | history unavailable | assumed | `commit 0fb48b9`. measured: 6 earlier commits touch the changed files, 0 reverts, 1 fix commits; repo history before base spans 1h (2026-10-06 to 2026-10-06). Too thin to read as a record (thin: < 5 commits or < 7 days) |
| Provenance | agent-assisted (Cursor) | measured | `commit 3b9c7ed`. commit trailers: Cursor <cursoragent@cursor.com>; PR description: "Made with Cursor"; author(s) in git: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>. Whether a human was in the loop is not verifiable from the input |
| Confidence: test coverage | 0 of 25 changed code files have a test | measured | none. tests that import a changed file; 0 covered by tests that existed before the change. Uncovered: apps/api/src/application/admin.ts, apps/api/src/application/auth.ts, apps/api/src/application/games.ts, apps/api/src/application/scoreboard.ts, apps/api/src/domain/ports.ts, apps/api/src/infrastructure/auth/password.ts, apps/api/src/infrastructure/db/client.ts, apps/api/src/infrastructure/db/match-repo.ts, apps/api/src/infrastructure/db/session-repo.ts, apps/api/src/infrastructure/db/user-repo.ts, apps/api/src/infrastructure/engines/registry.ts, apps/api/src/infrastructure/observability/adapter.ts, apps/api/src/infrastructure/observability/openobserve.ts, apps/api/src/interfaces/http/cookies.ts, apps/api/src/interfaces/http/router.ts, apps/api/src/main.ts, apps/web/src/App.tsx, apps/web/src/api.ts, apps/web/src/main.tsx, apps/web/vite.config.ts, packages/engine-connectfour/src/index.ts, packages/engine-rps/src/index.ts, packages/engine-tictactoe/src/index.ts, packages/game-core/src/index.ts, packages/shared/src/index.ts |
| Confidence: familiarity | single-author repo, people part dropped | measured | none. repo authors before base: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>; per file: .env.example (1), Dockerfile (1), README.md (1), apps/api/package.json (0), apps/api/src/application/admin.ts (0), apps/api/src/application/auth.ts (0), apps/api/src/application/games.ts (0), apps/api/src/application/scoreboard.ts (0), apps/api/src/domain/ports.ts (0), apps/api/src/infrastructure/auth/password.ts (0), apps/api/src/infrastructure/db/client.ts (1), apps/api/src/infrastructure/db/match-repo.ts (0), apps/api/src/infrastructure/db/session-repo.ts (0), apps/api/src/infrastructure/db/user-repo.ts (0), apps/api/src/infrastructure/engines/registry.ts (0), apps/api/src/infrastructure/observability/adapter.ts (0), apps/api/src/infrastructure/observability/openobserve.ts (1), apps/api/src/interfaces/http/cookies.ts (0), apps/api/src/interfaces/http/router.ts (0), apps/api/src/main.ts (0), apps/web/index.html (1), apps/web/package.json (1), apps/web/src/App.tsx (0), apps/web/src/api.ts (0), apps/web/src/main.tsx (1), apps/web/src/styles.css (0), apps/web/tsconfig.json (1), apps/web/vite.config.ts (1), bun.lock (1), client/src/App.tsx (1), client/src/api.ts (1), client/src/styles.css (1), docker-compose.prod.yml (1), docker-compose.yml (1), package.json (1), packages/engine-connectfour/package.json (0), packages/engine-connectfour/src/index.ts (0), packages/engine-rps/package.json (0), packages/engine-rps/src/index.ts (0), packages/engine-tictactoe/package.json (0), packages/engine-tictactoe/src/index.ts (0), packages/game-core/package.json (0), packages/game-core/src/index.ts (0), packages/shared/package.json (0), packages/shared/src/index.ts (0), scripts/deploy-prod.sh (1), server/package.json (1), server/src/auth.ts (1), server/src/game.ts (1), server/src/index.ts (1), start (1), start.prod (1), stop (1), stop.prod (1). Reviewer familiarity needs review data: the PR export lists 0 reviews |
| Confidence: review depth | 0 reviews | declared | none. the PR export lists 0 reviews |
| Confidence: diff vs task (LLM) | unavailable | assumed | none. no ANTHROPIC_API_KEY |
| Secrets present at base | observed | measured | `.env.example:9`, `.env.example:10`, `apps/api/src/infrastructure/db/client.ts:4`, `docker-compose.yml:28`. .env.example:9 (email), .env.example:10 (credential), apps/api/src/infrastructure/db/client.ts:4 (URL credentials), docker-compose.yml:28 (URL credentials): present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence |

## Changed files

- `.env.example` (modified, +2 -2)
- `Dockerfile` (modified, +15 -9)
- `README.md` (modified, +32 -54)
- `apps/api/package.json` (added, +18 -0)
- `apps/api/src/application/admin.ts` (added, +56 -0)
- `apps/api/src/application/auth.ts` (added, +69 -0)
- `apps/api/src/application/games.ts` (added, +156 -0)
- `apps/api/src/application/scoreboard.ts` (added, +33 -0)
- `apps/api/src/domain/ports.ts` (added, +90 -0)
- `apps/api/src/infrastructure/auth/password.ts` (added, +20 -0)
- `apps/api/src/infrastructure/db/client.ts` (renamed, +32 -3)
- `apps/api/src/infrastructure/db/match-repo.ts` (added, +155 -0)
- `apps/api/src/infrastructure/db/session-repo.ts` (added, +32 -0)
- `apps/api/src/infrastructure/db/user-repo.ts` (added, +49 -0)
- `apps/api/src/infrastructure/engines/registry.ts` (added, +13 -0)
- `apps/api/src/infrastructure/observability/adapter.ts` (added, +15 -0)
- `apps/api/src/infrastructure/observability/openobserve.ts` (renamed, +12 -12)
- `apps/api/src/interfaces/http/cookies.ts` (added, +25 -0)
- `apps/api/src/interfaces/http/router.ts` (added, +177 -0)
- `apps/api/src/main.ts` (added, +35 -0)
- `apps/web/index.html` (renamed, +1 -1)
- `apps/web/package.json` (renamed, +1 -1)
- `apps/web/src/App.tsx` (added, +532 -0)
- `apps/web/src/api.ts` (added, +86 -0)
- `apps/web/src/main.tsx` (renamed, +0 -0)
- `apps/web/src/styles.css` (added, +221 -0)
- `apps/web/tsconfig.json` (renamed, +0 -0)
- `apps/web/vite.config.ts` (renamed, +1 -4)
- `bun.lock` (modified, +56 -9)
- `client/src/App.tsx` (deleted, +0 -239)
- `client/src/api.ts` (deleted, +0 -48)
- `client/src/styles.css` (deleted, +0 -247)
- `docker-compose.prod.yml` (modified, +4 -4)
- `docker-compose.yml` (modified, +5 -3)
- `package.json` (modified, +4 -4)
- `packages/engine-connectfour/package.json` (added, +11 -0)
- `packages/engine-connectfour/src/index.ts` (added, +198 -0)
- `packages/engine-rps/package.json` (added, +11 -0)
- `packages/engine-rps/src/index.ts` (added, +65 -0)
- `packages/engine-tictactoe/package.json` (added, +11 -0)
- `packages/engine-tictactoe/src/index.ts` (added, +102 -0)
- `packages/game-core/package.json` (added, +11 -0)
- `packages/game-core/src/index.ts` (added, +41 -0)
- `packages/shared/package.json` (added, +8 -0)
- `packages/shared/src/index.ts` (added, +48 -0)
- `scripts/deploy-prod.sh` (modified, +6 -6)
- `server/package.json` (deleted, +0 -14)
- `server/src/auth.ts` (deleted, +0 -111)
- `server/src/game.ts` (deleted, +0 -92)
- `server/src/index.ts` (deleted, +0 -310)
- `start` (modified, +1 -1)
- `start.prod` (modified, +1 -1)
- `stop` (modified, +1 -1)
- `stop.prod` (modified, +1 -1)
