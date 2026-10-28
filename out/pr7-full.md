# Release brief: Fit games to the screen and give each one its own win and loss animation

Range `cdb77fe..0c4e573`, 47 files changed. Title: PR title, declared.

**Mode: Human.** Grid: high damage x long window = Human.

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

1. High damage: the path is live (declared) and the reach is high (assumed). measured: no calls from changed code reach an apps/api handler. Worth unknown because the metrics catalog declares no tier for any of its 7 entries, so reach is assumed wide. Not code paths, listed only: .github/workflows/deploy.yml (workflow), README.md (docs), apps/web/src/games/outcome.css (stylesheet), apps/web/src/styles.css (stylesheet), bun.lock (lockfile), docker/compose.dev.yml (compose), docker/compose.prod.yml (compose), docker/compose.yml (compose), scripts/deploy-prod.sh (script), scripts/dev-stop.sh (script), scripts/dev.sh (script), scripts/prod-start.sh (script), scripts/prod-stop.sh (script).
   - `apps/api/src/infrastructure/engines/registry.ts:2` `import { EngineRegistry } from "@arcade/game-core";`
   - `apps/web/src/App.tsx:506` `<Route path="play/:gameId" element={<PlayPage />} />`
   - `apps/web/src/App.tsx:505` `<Route index element={<LobbyPage />} />`
2. Long window: undo is slow: the flag is none and time to revert is full build and deploy (assumed); detection is slow (measured): domain: no business-level check (no value metric, no test of the changed domain files); infra: deploy health check.
   - `.github/workflows/deploy.yml:15` `timeout-minutes: 5`
   - `docker/compose.prod.yml:45` `healthcheck:`
   - `scripts/deploy-prod.sh:70` `if curl -fsS --max-time 1 "http://127.0.0.1/api/health" >/dev/null 2>&1; then`
3. Probability: measured confidence is low, so the mode moves one step toward caution (already Human, no further step).
   - no line to cite: this reason rests on something missing from the input or the repo

## Confidence

**low**
- no test that existed before the change covers any of the 24 changed code files (measured)
- single-author repo: familiarity dropped (W appendix)
- Secrets present at base: observed (measured), scripts/dev.sh:21 (URL credentials): present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence
- Failure mode (LLM second opinion): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- History: history unavailable (assumed), lowers confidence, does not raise risk (W 2)
- Confidence: diff vs task (LLM): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- gate 2: 18 export(s) removed or changed in modules internal to the repo (declared by package.json), lowers confidence one notch

## The one unknown

No single assumed input changes the mode. Considered: Reach (high); Time to revert (full build and deploy); Failure mode (LLM second opinion) (cannot move the mode); History (cannot move the mode); Confidence: diff vs task (LLM) (cannot move the mode). With all of them at their favourable value the mode is Human, so the call rests on what is known: Detection apparatus slow (measured), without which it would be Staged; confidence low (measured), without which it would be Staged.

## Disagreements

Disagreements: none between sources.

## Gates

| Gate | Result | Route | Checks |
|---|---|---|---|
| 1. Table stakes | pass | none | secrets: pass (measured); PII: pass (measured); hardcoded environment values: pass (measured); required CI checks: pass (measured) |
| 2. API contract | pass | none | breaking change to route, schema or public signature: pass (declared); moved routes and exports: pass (measured); internal signature changes: pass (declared); additive API surface: pass (measured) |
| 3. Destructive schema or data change | pass | none | destructive schema change or mutation of existing data: pass (measured) |

Gate 2, moved routes and exports:
- `packages/engine-suite/src/helpers.ts@cdb77fe:3` `export type Cell = "X" | "O" | "";`
- `packages/engines/src/lib/line.ts:3` `export type Cell = "X" | "O" | "";`
- `packages/engine-suite/src/helpers.ts@cdb77fe:13` `export function tttLines(): number[][] {`
- `packages/engines/src/lib/line.ts:26` `export function tttLines(): number[][] {`
- and 8 more

Gate 2, internal signature changes:
- `packages/engine-suite/src/helpers.ts@cdb77fe:5` `export function lineWinner(board: Cell[], lines: readonly (readonly number[])[]): "X" | "O" | null {`
- `packages/engine-suite/src/helpers.ts@cdb77fe:27` `export function bestPlaceMove(`
- `packages/engine-suite/src/helpers.ts@cdb77fe:81` `export function randomEmpty(board: Cell[]): number {`
- `packages/engine-suite/src/helpers.ts@cdb77fe:86` `export function statusFromMark(w: "X" | "O" | "draw" | null): EngineStatus {`
- and 14 more

Gate 2, additive API surface:
- `apps/web/src/games/logos.tsx:3` `export function ArcadeMark({ className = "" }: { className?: string }) {`
- `apps/web/src/games/logos.tsx:35` `export function GameMark({ id }: { id: string }) {`
- `apps/web/src/games/outcome.tsx:6` `export function OutcomeFX({`
- `packages/engines/src/games/dots-boxes.ts:33` `export const dotsBoxesEngine: GameEngine<State, Move> = {`
- and 22 more

## Provenance

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible or irreversible | reversible | measured | none. no persisted write, outbound side effect, queue publish or external API client in 2065 added lines |
| Feature flag | none | measured | none. no flag call (getBooleanValue) or control point anchor in the changed files |
| Path | live | declared | `apps/api/src/bootstrap.ts:2`, `apps/api/src/main.ts:1`, `apps/api/src/bootstrap.ts:9`, `apps/web/src/main.tsx:4` +22. apps/api/src/application/games.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/infrastructure/engines/registry.ts reaches apps/api/src/main.ts in 2 import(s); apps/web/src/App.tsx reaches apps/web/src/main.tsx in 1 import(s); apps/web/src/api.ts reaches apps/web/src/main.tsx in 2 import(s); apps/web/src/games/GameBoard.tsx reaches apps/web/src/main.tsx in 2 import(s); apps/web/src/games/logos.tsx reaches apps/web/src/main.tsx in 2 import(s); apps/web/src/games/outcome.tsx reaches apps/web/src/main.tsx in 2 import(s); apps/web/src/main.tsx reaches apps/web/src/main.tsx; packages/engines/src/games/connectfour.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/dots-boxes.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/drops.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/hexapawn.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/mancala.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/marks.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/memory.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/nim.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/placement.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/reversi.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/subtract-square.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/games/tictactoe.ts reaches apps/api/src/main.ts in 4 import(s); packages/engines/src/index.ts reaches apps/api/src/main.ts in 3 import(s); packages/engines/src/lib/drop.ts reaches apps/api/src/main.ts in 5 import(s); packages/engines/src/lib/line.ts reaches apps/api/src/main.ts in 5 import(s); packages/game-core/src/index.ts reaches apps/api/src/main.ts in 3 import(s); PlayPage is mounted by route play/:gameId; LobbyPage is mounted by route (index); not imported from any entry point: .gitignore, apps/api/package.json, docker/Dockerfile, package.json, packages/engines/package.json. Import graph and routes measured; entry points declared by package.json scripts and index.html: apps/api/src/main.ts, apps/web/src/main.tsx. Not code paths, listed only: .github/workflows/deploy.yml (workflow), README.md (docs), apps/web/src/games/outcome.css (stylesheet), apps/web/src/styles.css (stylesheet), bun.lock (lockfile), docker/compose.dev.yml (compose), docker/compose.prod.yml (compose), docker/compose.yml (compose), scripts/deploy-prod.sh (script), scripts/dev-stop.sh (script), scripts/dev.sh (script), scripts/prod-start.sh (script), scripts/prod-stop.sh (script) |
| Reach | high | assumed | none. measured: no calls from changed code reach an apps/api handler. Worth unknown because the metrics catalog declares no tier for any of its 7 entries, so reach is assumed wide. Not code paths, listed only: .github/workflows/deploy.yml (workflow), README.md (docs), apps/web/src/games/outcome.css (stylesheet), apps/web/src/styles.css (stylesheet), bun.lock (lockfile), docker/compose.dev.yml (compose), docker/compose.prod.yml (compose), docker/compose.yml (compose), scripts/deploy-prod.sh (script), scripts/dev-stop.sh (script), scripts/dev.sh (script), scripts/prod-start.sh (script), scripts/prod-stop.sh (script) |
| Failure mode | domain, infra | measured | `.github/workflows/deploy.yml:54`, `.gitignore@cdb77fe:6`, `README.md:12`, `apps/api/package.json:13` +43. rules on touched paths: .github/workflows/deploy.yml -> infra; .gitignore -> domain; README.md -> none; apps/api/package.json -> infra; apps/api/src/application/games.ts -> domain; apps/api/src/infrastructure/engines/registry.ts -> infra; apps/web/src/App.tsx -> domain; apps/web/src/api.ts -> domain; apps/web/src/games/GameBoard.tsx -> domain; apps/web/src/games/logos.tsx -> domain; apps/web/src/games/outcome.css -> cosmetic; apps/web/src/games/outcome.tsx -> domain; apps/web/src/main.tsx -> domain; apps/web/src/styles.css -> cosmetic; bun.lock -> infra; docker/Dockerfile -> infra; docker/compose.dev.yml -> infra; docker/compose.prod.yml -> infra; docker/compose.yml -> infra; package.json -> infra; packages/engine-connectfour/package.json -> infra; packages/engine-suite/src/helpers.ts -> domain; packages/engine-suite/src/index.ts -> domain; packages/engine-tictactoe/package.json -> infra; packages/engines/package.json -> infra; packages/engines/src/games/connectfour.ts -> domain; packages/engines/src/games/dots-boxes.ts -> domain; packages/engines/src/games/drops.ts -> domain; packages/engines/src/games/hexapawn.ts -> domain; packages/engines/src/games/mancala.ts -> domain; packages/engines/src/games/marks.ts -> domain; packages/engines/src/games/memory.ts -> domain; packages/engines/src/games/nim.ts -> domain; packages/engines/src/games/placement.ts -> domain; packages/engines/src/games/reversi.ts -> domain; packages/engines/src/games/subtract-square.ts -> domain; packages/engines/src/games/tictactoe.ts -> domain; packages/engines/src/index.ts -> domain; packages/engines/src/lib/drop.ts -> domain; packages/engines/src/lib/line.ts -> domain; packages/game-core/src/index.ts -> domain; scripts/deploy-prod.sh -> infra; scripts/dev-stop.sh -> infra; scripts/dev.sh -> infra; scripts/prod-start.sh -> infra; scripts/prod-stop.sh -> infra; stop.prod -> domain. Matched on file path; each evidence line is the file's first change |
| Failure mode (LLM second opinion) | unavailable | assumed | none. no ANTHROPIC_API_KEY; rules only |
| Detection apparatus | slow | measured | `docker/compose.prod.yml:45`, `scripts/deploy-prod.sh:70`. domain: no business-level check (no value metric, no test of the changed domain files); infra: deploy health check. Every failure mode needs its detector, so detection is slow. no metric or log call on changed lines. Checked in the repo only; alert config outside the repo (OpenObserve) is not an input |
| Time to revert | full build and deploy | assumed | `.github/workflows/deploy.yml:15`. no one-click rollback in 1 workflow file(s); CI run history is not an input, so pipeline duration is not measured. Declared job timeout: 5 min (a bound, not a measurement). Unknown rounds to slow: a full build and deploy to revert (W 2) |
| History | history unavailable | assumed | `commit cdb77fe`, `commit bd5cf7c`, `commit 0fb48b9`. measured: 10 earlier commits touch the changed files, 0 reverts, 3 fix commits; repo history before base spans 1h (2026-10-06 to 2026-10-06). Too thin to read as a record (thin: < 5 commits or < 7 days) |
| Provenance | agent-assisted (Cursor) | measured | `commit 0c4e573`. commit trailers: Cursor <cursoragent@cursor.com>; PR description: "Made with Cursor"; author(s) in git: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>. Whether a human was in the loop is not verifiable from the input |
| Confidence: test coverage | 0 of 24 changed code files have a test | measured | none. tests that import a changed file; 0 covered by tests that existed before the change. Uncovered: apps/api/src/application/games.ts, apps/api/src/infrastructure/engines/registry.ts, apps/web/src/App.tsx, apps/web/src/api.ts, apps/web/src/games/GameBoard.tsx, apps/web/src/games/logos.tsx, apps/web/src/games/outcome.tsx, apps/web/src/main.tsx, packages/engines/src/games/connectfour.ts, packages/engines/src/games/dots-boxes.ts, packages/engines/src/games/drops.ts, packages/engines/src/games/hexapawn.ts, packages/engines/src/games/mancala.ts, packages/engines/src/games/marks.ts, packages/engines/src/games/memory.ts, packages/engines/src/games/nim.ts, packages/engines/src/games/placement.ts, packages/engines/src/games/reversi.ts, packages/engines/src/games/subtract-square.ts, packages/engines/src/games/tictactoe.ts, packages/engines/src/index.ts, packages/engines/src/lib/drop.ts, packages/engines/src/lib/line.ts, packages/game-core/src/index.ts |
| Confidence: familiarity | single-author repo, people part dropped | measured | none. repo authors before base: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>; per file: .github/workflows/deploy.yml (1), .gitignore (1), README.md (1), apps/api/package.json (1), apps/api/src/application/games.ts (1), apps/api/src/infrastructure/engines/registry.ts (1), apps/web/src/App.tsx (1), apps/web/src/api.ts (1), apps/web/src/games/GameBoard.tsx (1), apps/web/src/games/logos.tsx (0), apps/web/src/games/outcome.css (0), apps/web/src/games/outcome.tsx (0), apps/web/src/main.tsx (1), apps/web/src/styles.css (1), bun.lock (1), docker/Dockerfile (1), docker/compose.dev.yml (1), docker/compose.prod.yml (1), docker/compose.yml (1), package.json (1), packages/engine-connectfour/package.json (1), packages/engine-suite/src/helpers.ts (1), packages/engine-suite/src/index.ts (1), packages/engine-tictactoe/package.json (1), packages/engines/package.json (1), packages/engines/src/games/connectfour.ts (1), packages/engines/src/games/dots-boxes.ts (0), packages/engines/src/games/drops.ts (0), packages/engines/src/games/hexapawn.ts (0), packages/engines/src/games/mancala.ts (0), packages/engines/src/games/marks.ts (0), packages/engines/src/games/memory.ts (0), packages/engines/src/games/nim.ts (0), packages/engines/src/games/placement.ts (0), packages/engines/src/games/reversi.ts (0), packages/engines/src/games/subtract-square.ts (0), packages/engines/src/games/tictactoe.ts (1), packages/engines/src/index.ts (0), packages/engines/src/lib/drop.ts (0), packages/engines/src/lib/line.ts (0), packages/game-core/src/index.ts (1), scripts/deploy-prod.sh (1), scripts/dev-stop.sh (1), scripts/dev.sh (1), scripts/prod-start.sh (1), scripts/prod-stop.sh (0), stop.prod (1). Reviewer familiarity needs review data: the PR export lists 0 reviews |
| Confidence: review depth | 0 reviews | declared | none. the PR export lists 0 reviews |
| Confidence: diff vs task (LLM) | unavailable | assumed | none. no ANTHROPIC_API_KEY |
| Secrets present at base | observed | measured | `scripts/dev.sh:21`. scripts/dev.sh:21 (URL credentials): present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence |

## Changed files

- `.github/workflows/deploy.yml` (modified, +1 -1)
- `.gitignore` (modified, +0 -2)
- `README.md` (modified, +15 -11)
- `apps/api/package.json` (modified, +1 -3)
- `apps/api/src/application/games.ts` (modified, +1 -0)
- `apps/api/src/infrastructure/engines/registry.ts` (modified, +2 -6)
- `apps/web/src/App.tsx` (modified, +44 -22)
- `apps/web/src/api.ts` (modified, +1 -1)
- `apps/web/src/games/GameBoard.tsx` (renamed, +89 -25)
- `apps/web/src/games/logos.tsx` (added, +43 -0)
- `apps/web/src/games/outcome.css` (added, +442 -0)
- `apps/web/src/games/outcome.tsx` (added, +21 -0)
- `apps/web/src/main.tsx` (modified, +1 -0)
- `apps/web/src/styles.css` (modified, +202 -33)
- `bun.lock` (modified, +4 -24)
- `docker/Dockerfile` (renamed, +1 -3)
- `docker/compose.dev.yml` (renamed, +2 -2)
- `docker/compose.prod.yml` (renamed, +2 -2)
- `docker/compose.yml` (renamed, +2 -2)
- `package.json` (modified, +7 -6)
- `packages/engine-connectfour/package.json` (deleted, +0 -11)
- `packages/engine-suite/src/helpers.ts` (deleted, +0 -182)
- `packages/engine-suite/src/index.ts` (deleted, +0 -1002)
- `packages/engine-tictactoe/package.json` (deleted, +0 -11)
- `packages/engines/package.json` (renamed, +1 -1)
- `packages/engines/src/games/connectfour.ts` (renamed, +2 -1)
- `packages/engines/src/games/dots-boxes.ts` (added, +105 -0)
- `packages/engines/src/games/drops.ts` (added, +21 -0)
- `packages/engines/src/games/hexapawn.ts` (added, +60 -0)
- `packages/engines/src/games/mancala.ts` (added, +79 -0)
- `packages/engines/src/games/marks.ts` (added, +181 -0)
- `packages/engines/src/games/memory.ts` (added, +102 -0)
- `packages/engines/src/games/nim.ts` (added, +52 -0)
- `packages/engines/src/games/placement.ts` (added, +67 -0)
- `packages/engines/src/games/reversi.ts` (added, +116 -0)
- `packages/engines/src/games/subtract-square.ts` (added, +33 -0)
- `packages/engines/src/games/tictactoe.ts` (renamed, +2 -1)
- `packages/engines/src/index.ts` (added, +34 -0)
- `packages/engines/src/lib/drop.ts` (added, +110 -0)
- `packages/engines/src/lib/line.ts` (added, +192 -0)
- `packages/game-core/src/index.ts` (modified, +3 -0)
- `scripts/deploy-prod.sh` (modified, +7 -6)
- `scripts/dev-stop.sh` (renamed, +4 -4)
- `scripts/dev.sh` (renamed, +6 -6)
- `scripts/prod-start.sh` (renamed, +2 -2)
- `scripts/prod-stop.sh` (added, +5 -0)
- `stop.prod` (deleted, +0 -5)
