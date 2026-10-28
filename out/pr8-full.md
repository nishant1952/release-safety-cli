# Release brief: Redesign the lobby as a CrazyGames-style game portal

Range `7207063..85298bc`, 15 files changed. Title: PR title, declared.

**Mode: Human.** Grid: high damage x long window = Human. Gates route to Human.

## Plan

| Step | Proposed |
|---|---|
| Exposure | Proposed by the system: Small slice, soak, widen; slice by canary or percentage deploy (rollout mechanism is not extracted, so all-at-once is assumed). Approved or edited by the owner |
| Soak per step | Proposed by the system: Hours, scaled to traffic (traffic is not an input, so the hours are not scaled). Approved or edited by the owner |
| Guardrails | Same as staged, plus whatever the owner adds. domain: business checks, none found on the changed path; infra: resources and latency, watch deploy health check, declared (docker/compose.prod.yml:45, scripts/deploy-prod.sh:70) |
| Abort | Owner decides |
| Undo | Without one, undo is a rollback or redeploy and a slice is a canary or percentage deploy. Undo: revert and redeploy (time to revert: full build and deploy, assumed). |
| Paged | Named owner before step one: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local> (earlier author of the most touched files, measured from git; the repo has no CODEOWNERS file) |
| Sign-off | Required before step one |

## Top reasons

1. Gate 1 (Table stakes) is trip, so it routes to a human: hardcoded environment values: 6 added line(s) match.
   - `apps/web/index.html:10` `href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Space+Grotesk:wght@400;600;700&family=IBM+Plex+Mono:wght@500&display=swap"`
   - `scripts/dev.sh:28` `export WEB_DEV_ORIGIN="${WEB_DEV_ORIGIN:-http://127.0.0.1:5173}"`
   - `scripts/dev.sh:44` `echo "  UI   → http://127.0.0.1:5173      (Vite HMR — use this)"`
   - `scripts/dev.sh:45` `echo "  API  → http://127.0.0.1:${PORT}   (/api; / redirects to Vite)"`
   - and 2 more
2. High damage: the path is live (declared) and the reach is high (assumed). measured: calls reach GET /api/games (services.games.listGames). Worth unknown because the metrics catalog declares no tier for any of its 7 entries, so reach is assumed wide. Not code paths, listed only: README.md (docs), apps/web/src/styles.css (stylesheet), docker/compose.dev.yml (compose), docker/compose.yml (compose), scripts/dev.sh (script), scripts/docker-dev-stop.sh (script), scripts/docker-dev.sh (script).
   - `apps/web/src/Lobby.tsx:5` `import { CATEGORIES, inCategory, metaFor, type GameCategory } from "./games/meta";`
   - `apps/web/src/App.tsx:467` `<Shell />`
   - `apps/web/src/App.tsx:464` `<Route`
   - `apps/api/src/interfaces/http/router.ts:110` `if (path === "/api/games" && req.method === "GET") {`
3. Long window: undo is slow: the flag is none and time to revert is full build and deploy (assumed); detection is slow (measured): domain: no business-level check (no value metric, no test of the changed domain files); infra: deploy health check.
   - `.github/workflows/deploy.yml:15` `timeout-minutes: 5`
   - `docker/compose.prod.yml:45` `healthcheck:`
   - `scripts/deploy-prod.sh:70` `if curl -fsS --max-time 1 "http://127.0.0.1/api/health" >/dev/null 2>&1; then`
4. Probability: measured confidence is low, so the mode moves one step toward caution (already Human, no further step).
   - no line to cite: this reason rests on something missing from the input or the repo

## Confidence

**low**
- no test that existed before the change covers any of the 6 changed code files (measured)
- single-author repo: familiarity dropped (W appendix)
- Secrets present at base: observed (measured), docker/compose.dev.yml:43 (URL credentials): present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence
- Failure mode (LLM second opinion): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- History: history unavailable (assumed), lowers confidence, does not raise risk (W 2)
- Confidence: diff vs task (LLM): unavailable (assumed), lowers confidence, does not raise risk (W 2)

## The one unknown

No single assumed input changes the mode. Considered: Reach (high); Time to revert (full build and deploy); Failure mode (LLM second opinion) (cannot move the mode); History (cannot move the mode); Confidence: diff vs task (LLM) (cannot move the mode). With all of them at their favourable value the mode is Human, and no single known input changes it either.

## Disagreements

Disagreements: none between sources.

## Gates

| Gate | Result | Route | Checks |
|---|---|---|---|
| 1. Table stakes | trip | human | secrets: pass (measured); PII: pass (measured); hardcoded environment values: trip (measured); required CI checks: pass (measured) |
| 2. API contract | pass | none | breaking change to route, schema or public signature: pass (measured); additive API surface: pass (measured) |
| 3. Destructive schema or data change | pass | none | destructive schema change or mutation of existing data: pass (measured) |

Gate 1, hardcoded environment values:
- `apps/web/index.html:10` `href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Space+Grotesk:wght@400;600;700&family=IBM+Plex+Mono:wght@500&display=swap"`
- `scripts/dev.sh:28` `export WEB_DEV_ORIGIN="${WEB_DEV_ORIGIN:-http://127.0.0.1:5173}"`
- `scripts/dev.sh:44` `echo "  UI   → http://127.0.0.1:5173      (Vite HMR — use this)"`
- `scripts/dev.sh:45` `echo "  API  → http://127.0.0.1:${PORT}   (/api; / redirects to Vite)"`
- and 2 more

Gate 2, additive API surface:
- `apps/web/src/Lobby.tsx:60` `export function LobbyPage() {`
- `apps/web/src/games/covers.tsx:258` `export function GameCover({ id }: { id: string; title?: string }) {`
- `apps/web/src/games/meta.ts:3` `export type GameCategory = "all" | "classics" | "gravity" | "strategy" | "puzzle" | "quick";`
- `apps/web/src/games/meta.ts:5` `export const CATEGORIES: { id: GameCategory; label: string }[] = [`
- and 4 more

## Provenance

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible or irreversible | reversible | measured | none. no persisted write, outbound side effect, queue publish or external API client in 1146 added lines |
| Feature flag | none | measured | none. no flag call (getBooleanValue) or control point anchor in the changed files |
| Path | live | declared | `apps/api/src/main.ts:2`, `apps/web/src/main.tsx:4`, `apps/web/src/App.tsx:16`, `apps/web/src/Lobby.tsx:4` +3. apps/api/src/interfaces/http/router.ts reaches apps/api/src/main.ts in 1 import(s); apps/web/src/App.tsx reaches apps/web/src/main.tsx in 1 import(s); apps/web/src/Lobby.tsx reaches apps/web/src/main.tsx in 2 import(s); apps/web/src/games/covers.tsx reaches apps/web/src/main.tsx in 3 import(s); apps/web/src/games/meta.ts reaches apps/web/src/main.tsx in 3 import(s); Shell is mounted by route (layout) with child routes (index), play/:gameId, scoreboard, admin behind RequireAuth; not imported from any entry point: apps/web/index.html, package.json, scripts/docker-api-watch.ts. Import graph and routes measured; entry points declared by package.json scripts and index.html: apps/api/src/main.ts, apps/web/src/main.tsx. Not code paths, listed only: README.md (docs), apps/web/src/styles.css (stylesheet), docker/compose.dev.yml (compose), docker/compose.yml (compose), scripts/dev.sh (script), scripts/docker-dev-stop.sh (script), scripts/docker-dev.sh (script) |
| Reach | high | assumed | `apps/web/src/Lobby.tsx:66`, `apps/web/src/api.ts:145`, `apps/api/src/interfaces/http/router.ts:110`. measured: calls reach GET /api/games (services.games.listGames). Worth unknown because the metrics catalog declares no tier for any of its 7 entries, so reach is assumed wide. Not code paths, listed only: README.md (docs), apps/web/src/styles.css (stylesheet), docker/compose.dev.yml (compose), docker/compose.yml (compose), scripts/dev.sh (script), scripts/docker-dev-stop.sh (script), scripts/docker-dev.sh (script) |
| Failure mode | domain, infra | measured | `README.md:11`, `apps/api/src/interfaces/http/router.ts:187`, `apps/web/index.html:10`, `apps/web/src/App.tsx:16` +11. rules on touched paths: README.md -> none; apps/api/src/interfaces/http/router.ts -> domain; apps/web/index.html -> domain; apps/web/src/App.tsx -> domain; apps/web/src/Lobby.tsx -> domain; apps/web/src/games/covers.tsx -> domain; apps/web/src/games/meta.ts -> domain; apps/web/src/styles.css -> cosmetic; docker/compose.dev.yml -> infra; docker/compose.yml -> infra; package.json -> infra; scripts/dev.sh -> infra; scripts/docker-api-watch.ts -> infra; scripts/docker-dev-stop.sh -> infra; scripts/docker-dev.sh -> infra. Matched on file path; each evidence line is the file's first change |
| Failure mode (LLM second opinion) | unavailable | assumed | none. no ANTHROPIC_API_KEY; rules only |
| Detection apparatus | slow | measured | `docker/compose.prod.yml:45`, `scripts/deploy-prod.sh:70`. domain: no business-level check (no value metric, no test of the changed domain files); infra: deploy health check. Every failure mode needs its detector, so detection is slow. no metric or log call on changed lines. Checked in the repo only; alert config outside the repo (OpenObserve) is not an input |
| Time to revert | full build and deploy | assumed | `.github/workflows/deploy.yml:15`. no one-click rollback in 1 workflow file(s); CI run history is not an input, so pipeline duration is not measured. Declared job timeout: 5 min (a bound, not a measurement). Unknown rounds to slow: a full build and deploy to revert (W 2) |
| History | history unavailable | assumed | `commit 0fb48b9`. measured: 9 earlier commits touch the changed files, 0 reverts, 1 fix commits; repo history before base spans 2h (2026-10-06 to 2026-10-06). Too thin to read as a record (thin: < 5 commits or < 7 days) |
| Provenance | agent-assisted (Cursor) | measured | `commit 85298bc`. commit trailers: Cursor <cursoragent@cursor.com>; PR description: "Made with Cursor"; author(s) in git: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>. Whether a human was in the loop is not verifiable from the input |
| Confidence: test coverage | 0 of 6 changed code files have a test | measured | none. tests that import a changed file; 0 covered by tests that existed before the change. Uncovered: apps/api/src/interfaces/http/router.ts, apps/web/src/App.tsx, apps/web/src/Lobby.tsx, apps/web/src/games/covers.tsx, apps/web/src/games/meta.ts, scripts/docker-api-watch.ts |
| Confidence: familiarity | single-author repo, people part dropped | measured | none. repo authors before base: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>; per file: README.md (1), apps/api/src/interfaces/http/router.ts (1), apps/web/index.html (1), apps/web/src/App.tsx (1), apps/web/src/Lobby.tsx (0), apps/web/src/games/covers.tsx (0), apps/web/src/games/meta.ts (0), apps/web/src/styles.css (1), docker/compose.dev.yml (1), docker/compose.yml (1), package.json (1), scripts/dev.sh (1), scripts/docker-api-watch.ts (0), scripts/docker-dev-stop.sh (0), scripts/docker-dev.sh (0). Reviewer familiarity needs review data: the PR export lists 0 reviews |
| Confidence: review depth | 0 reviews | declared | none. the PR export lists 0 reviews |
| Confidence: diff vs task (LLM) | unavailable | assumed | none. no ANTHROPIC_API_KEY |
| Secrets present at base | observed | measured | `docker/compose.dev.yml:43`. docker/compose.dev.yml:43 (URL credentials): present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence |

## Changed files

- `README.md` (modified, +6 -3)
- `apps/api/src/interfaces/http/router.ts` (modified, +7 -1)
- `apps/web/index.html` (modified, +1 -1)
- `apps/web/src/App.tsx` (modified, +51 -75)
- `apps/web/src/Lobby.tsx` (added, +147 -0)
- `apps/web/src/games/covers.tsx` (added, +273 -0)
- `apps/web/src/games/meta.ts` (added, +197 -0)
- `apps/web/src/styles.css` (modified, +306 -24)
- `docker/compose.dev.yml` (modified, +28 -2)
- `docker/compose.yml` (modified, +1 -1)
- `package.json` (modified, +4 -2)
- `scripts/dev.sh` (modified, +3 -2)
- `scripts/docker-api-watch.ts` (added, +91 -0)
- `scripts/docker-dev-stop.sh` (added, +5 -0)
- `scripts/docker-dev.sh` (added, +26 -0)
