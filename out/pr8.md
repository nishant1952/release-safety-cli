# Release brief: Redesign the lobby as a CrazyGames-style game portal

Range `7207063..85298bc`, 15 files, +1146 −111. Gate 1 trips. Sources agree.

**Mode: Human.** High damage × long window = Human; gates route to Human. Confidence low.

In one line: an unflagged change on a live path (declared) with high reach (assumed), undone by a full build and deploy (assumed), with nothing found that detects a domain failure, and gate 1 routes it to Human.

## Plan

Each row is proposed by the system; the owner approves or edits it.

| Step | Proposed |
|---|---|
| Exposure | Small slice, soak, widen; slice by canary or percentage deploy (rollout mechanism is not extracted, so all-at-once is assumed) |
| Soak per step | Hours, scaled to traffic (traffic is not an input, so the hours are not scaled) |
| Guardrails | Watch deploy health check. No business checks found on the changed path. |
| Abort | Owner decides |
| Undo | No flag: revert and redeploy (full build and deploy, assumed). |
| Paged | Named owner before step one: Kalyan Chowdary, earlier author of the most touched files (git); the repo has no CODEOWNERS file |
| Sign-off | Required before step one |

## Why Human

1. **Gate 1 trips.** Table stakes, so it routes to a human: hardcoded environment values.
   `apps/web/index.html:10` `href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Space+Grotesk:wght@400;600;700&family=IBM+Plex+Mono:wght@500&display=swap"`
2. **High damage.** Path live (declared), reach high (assumed: no declared tier applies).
   `apps/web/src/Lobby.tsx:5` `import { CATEGORIES, inCategory, metaFor, type GameCategory } from "./games/meta";`
3. **Long window.** No flag, so undo is full build and deploy (assumed: no rollback, pipeline time unmeasured). Detection slow (measured): no business-level check for domain.
   `.github/workflows/deploy.yml:15` `timeout-minutes: 5`
4. **Low confidence.** No test that existed before the change covers any of the 6 changed code files (measured). The mode is already Human, so it moves no further.
   No line to cite.

## What would move it

No assumed input changes the mode, alone or together. No single known input moves it either.

## Signals

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible | reversible | measured | no persisted write, outbound side effect, queue publish or external API client in 1146 added lines |
| Feature flag | none | measured | no flag call (getBooleanValue) or control point anchor in the changed files |
| Path | live | declared | `main.ts:2` +6. entry points declared by package.json scripts and index.html: main.ts, main.tsx |
| Reach | high | assumed | `Lobby.tsx:66` +2. the metrics catalog declares no tier for any of its 7 entries, so reach is assumed wide |
| Failure mode | domain, infra | measured | `README.md:11` +14. Matched on file path |
| Detection | slow | measured | `compose.prod.yml:45` +1. domain: no business-level check |
| Time to revert | full build and deploy | assumed | `deploy.yml:15`. no one-click rollback in 1 workflow file(s) |
| History | history unavailable | assumed | `commit 0fb48b9`. Too thin to read as a record |
| Provenance | agent-assisted (Cursor) | measured | `commit 85298bc`. commit trailers: Cursor |
| Test coverage | 0 of 6 changed code files have a test | measured | 0 covered by tests that existed before the change |
| Reviews | 0 reviews | declared | familiarity: single-author repo, people part dropped (measured) |
| Secrets present at base | observed | measured | `compose.dev.yml:43`. present before this change, not added by it; listed in full below |
| Model | off | — | no ANTHROPIC_API_KEY; failure mode and task check not run |

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

## Secrets present at base

docker/compose.dev.yml:43 (URL credentials): present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence.

## Changed files

`README.md` +6 −3 · `router.ts` +7 −1 · `index.html` +1 −1 · `App.tsx` +51 −75 · `Lobby.tsx` (added) +147 · `covers.tsx` (added) +273 · `meta.ts` (added) +197 · `styles.css` +306 −24 · `compose.dev.yml` +28 −2 · `compose.yml` +1 −1 · `package.json` +4 −2 · `dev.sh` +3 −2 · `docker-api-watch.ts` (added) +91 · `docker-dev-stop.sh` (added) +5 · `docker-dev.sh` (added) +26
