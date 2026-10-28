# Release brief: Arcade multi-game centre + rebrand

Range `549a1bc..3b9c7ed`, 54 files, +2463 −1177. Gates 1, 2 and 3 trip. Sources agree.

**Mode: Human.** High damage × long window = Human; gates route to Human. Confidence low.

In one line: an unflagged, irreversible change on a live path (declared) with high reach (assumed), with nothing found that detects a security failure, and gates 1, 2 and 3 route it to Human.

## Plan

Each row is proposed by the system; the owner approves or edits it.

| Step | Proposed |
|---|---|
| Exposure | Small slice, soak, widen; slice by canary or percentage deploy (rollout mechanism is not extracted, so all-at-once is assumed) |
| Soak per step | Hours, scaled to traffic (traffic is not an input, so the hours are not scaled) |
| Guardrails | Watch value metric `info`, error rate metric `error`, deploy health check. No auth errors found on the changed path. |
| Abort | Owner decides |
| Undo | No flag: revert and redeploy (full build and deploy, assumed). |
| Paged | Named owner before step one: Kalyan Chowdary, earlier author of the most touched files (git); the repo has no CODEOWNERS file |
| Sign-off | Required before step one |

## Why Human

1. **Gate 1 trips.** Table stakes, so it routes to a human: hardcoded environment values.
   `apps/api/src/main.ts:35` `console.log('arcade centre on http://localhost:${server.port}');`
2. **Gate 2 trips.** API contract, so it routes to a human: breaking change to route, schema or public signature.
   `server/src/index.ts@549a1bc:105` `if (path === "/api/metrics/streams" && req.method === "GET") {`
3. **Gate 3 trips.** Destructive schema or data change, so it routes to a human: destructive schema change or mutation of existing data.
   `server/src/db.ts@549a1bc:32` `CREATE TABLE IF NOT EXISTS games (`
4. **High damage.** Path live (declared), reach high (assumed: no declared tier applies).
   `apps/api/src/infrastructure/engines/registry.ts:2` `import { ticTacToeEngine } from "@arcade/engine-tictactoe";`
5. **Long window.** The change is irreversible; no flag, so undo is full build and deploy (assumed: no rollback, pipeline time unmeasured). Detection slow (assumed: alert config is not an input): no auth-error alert for security.
   `.github/workflows/deploy.yml:15` `timeout-minutes: 5`
6. **Low confidence.** No test that existed before the change covers any of the 25 changed code files (measured). The mode is already Human, so it moves no further.
   No line to cite.

## What would move it

No assumed input changes the mode, alone or together. No single known input moves it either.

## Signals

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible | irreversible | measured | `api.ts:52` +1. persisted write in the diff: a redeploy cannot undo these |
| Feature flag | none | measured | no flag call (getBooleanValue) or control point anchor in the changed files |
| Path | live | declared | `main.ts:4` +21. entry points declared by package.json scripts and index.html: main.ts, main.tsx |
| Reach | high | assumed | `App.tsx:367` +34. the metrics catalog (metrics-catalog.ts) is not in the repo, so reach is assumed wide |
| Failure mode | domain, infra, security | measured | `.env.example:11` +53. Matched on file path |
| Detection | slow | assumed | `main.ts:20` +3. security: no auth-error alert |
| Time to revert | full build and deploy | assumed | `deploy.yml:15`. no one-click rollback in 1 workflow file(s) |
| History | history unavailable | assumed | `commit 0fb48b9`. Too thin to read as a record |
| Provenance | agent-assisted (Cursor) | measured | `commit 3b9c7ed`. commit trailers: Cursor |
| Test coverage | 0 of 25 changed code files have a test | measured | 0 covered by tests that existed before the change |
| Reviews | 0 reviews | declared | familiarity: single-author repo, people part dropped (measured) |
| Secrets present at base | observed | measured | `.env.example:9` +3. present before this change, not added by it; listed in full below |
| Model | off | — | no ANTHROPIC_API_KEY; failure mode and task check not run |

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

## Secrets present at base

.env.example:9 (email), .env.example:10 (credential), apps/api/src/infrastructure/db/client.ts:4 (URL credentials), docker-compose.yml:28 (URL credentials): present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence.

## Changed files

`.env.example` +2 −2 · `Dockerfile` +15 −9 · `README.md` +32 −54 · `api/package.json` (added) +18 · `admin.ts` (added) +56 · `application/auth.ts` (added) +69 · `games.ts` (added) +156 · `scoreboard.ts` (added) +33 · `ports.ts` (added) +90 · `password.ts` (added) +20 · `client.ts` (renamed) +32 −3 · `match-repo.ts` (added) +155 · `session-repo.ts` (added) +32 · `user-repo.ts` (added) +49 · `registry.ts` (added) +13 · `adapter.ts` (added) +15 · `openobserve.ts` (renamed) +12 −12 · `cookies.ts` (added) +25 · `router.ts` (added) +177 · `main.ts` (added) +35 · `index.html` (renamed) +1 −1 · `web/package.json` (renamed) +1 −1 · `src/App.tsx` (added) +532 · `src/api.ts` (added) +86 · `main.tsx` (renamed) · `src/styles.css` (added) +221 · `tsconfig.json` (renamed) · `vite.config.ts` (renamed) +1 −4 · `bun.lock` +56 −9 · `App.tsx` (deleted) −239 · `api.ts` (deleted) −48 · `styles.css` (deleted) −247 · `docker-compose.prod.yml` +4 −4 · `docker-compose.yml` +5 −3 · `package.json` +4 −4 · `engine-connectfour/package.json` (added) +11 · `engine-connectfour/src/index.ts` (added) +198 · `engine-rps/package.json` (added) +11 · `engine-rps/src/index.ts` (added) +65 · `engine-tictactoe/package.json` (added) +11 · `engine-tictactoe/src/index.ts` (added) +102 · `game-core/package.json` (added) +11 · `game-core/src/index.ts` (added) +41 · `shared/package.json` (added) +8 · `src/index.ts` (added) +48 · `deploy-prod.sh` +6 −6 · `server/package.json` (deleted) −14 · `auth.ts` (deleted) −111 · `game.ts` (deleted) −92 · `index.ts` (deleted) −310 · `start` +1 −1 · `start.prod` +1 −1 · `stop` +1 −1 · `stop.prod` +1 −1
