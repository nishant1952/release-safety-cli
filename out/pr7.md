# Release brief: Fit games to the screen and give each one its own win and loss animation

Range `cdb77fe..0c4e573`, 47 files, +2065 −1375. All three gates pass. Sources agree.

**Mode: Human.** High damage × long window. Confidence low.

In one line: an unflagged change on a live path (declared) with high reach (assumed), undone by a full build and deploy (assumed), with nothing found that detects a domain failure.

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

1. **High damage.** Path live (declared), reach high (assumed: no declared tier applies).
   `apps/api/src/infrastructure/engines/registry.ts:2` `import { EngineRegistry } from "@arcade/game-core";`
2. **Long window.** No flag, so undo is full build and deploy (assumed: no rollback, pipeline time unmeasured). Detection slow (measured): no business-level check for domain.
   `.github/workflows/deploy.yml:15` `timeout-minutes: 5`
3. **Low confidence.** No test that existed before the change covers any of the 24 changed code files (measured). The mode is already Human, so it moves no further.
   No line to cite.

## What would move it

No assumed input changes the mode, alone or together. The known inputs that would move it: Detection apparatus slow (measured), to Staged; confidence low (measured), to Staged.

## Signals

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible | reversible | measured | no persisted write, outbound side effect, queue publish or external API client in 2065 added lines |
| Feature flag | none | measured | no flag call (getBooleanValue) or control point anchor in the changed files |
| Path | live | declared | `bootstrap.ts:2` +25. entry points declared by package.json scripts and index.html: main.ts, main.tsx |
| Reach | high | assumed | the metrics catalog declares no tier for any of its 7 entries, so reach is assumed wide |
| Failure mode | domain, infra | measured | `deploy.yml:54` +46. Matched on file path |
| Detection | slow | measured | `compose.prod.yml:45` +1. domain: no business-level check |
| Time to revert | full build and deploy | assumed | `deploy.yml:15`. no one-click rollback in 1 workflow file(s) |
| History | history unavailable | assumed | `commit cdb77fe` +2. Too thin to read as a record |
| Provenance | agent-assisted (Cursor) | measured | `commit 0c4e573`. commit trailers: Cursor |
| Test coverage | 0 of 24 changed code files have a test | measured | 0 covered by tests that existed before the change |
| Reviews | 0 reviews | declared | familiarity: single-author repo, people part dropped (measured) |
| Secrets present at base | observed | measured | `dev.sh:21`. present before this change, not added by it; listed in full below |
| Model | off | — | no ANTHROPIC_API_KEY; failure mode and task check not run |

## Gates

All pass. Gate 2 notes moved routes and exports: 12 lines, `helpers.ts@cdb77fe:3` +11. Gate 2 notes internal signature changes: 18 lines, `helpers.ts@cdb77fe:5` +17. Gate 2 notes additive API surface: 26 lines, `logos.tsx:3` +25.

## Secrets present at base

scripts/dev.sh:21 (URL credentials): present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence.

## Changed files

`deploy.yml` +1 −1 · `.gitignore` −2 · `README.md` +15 −11 · `api/package.json` +1 −3 · `games.ts` +1 · `registry.ts` +2 −6 · `App.tsx` +44 −22 · `api.ts` +1 −1 · `GameBoard.tsx` (renamed) +89 −25 · `logos.tsx` (added) +43 · `outcome.css` (added) +442 · `outcome.tsx` (added) +21 · `main.tsx` +1 · `styles.css` +202 −33 · `bun.lock` +4 −24 · `Dockerfile` (renamed) +1 −3 · `compose.dev.yml` (renamed) +2 −2 · `compose.prod.yml` (renamed) +2 −2 · `compose.yml` (renamed) +2 −2 · `package.json` +7 −6 · `engine-connectfour/package.json` (deleted) −11 · `helpers.ts` (deleted) −182 · `engine-suite/src/index.ts` (deleted) −1002 · `engine-tictactoe/package.json` (deleted) −11 · `engines/package.json` (renamed) +1 −1 · `connectfour.ts` (renamed) +2 −1 · `dots-boxes.ts` (added) +105 · `drops.ts` (added) +21 · `hexapawn.ts` (added) +60 · `mancala.ts` (added) +79 · `marks.ts` (added) +181 · `memory.ts` (added) +102 · `nim.ts` (added) +52 · `placement.ts` (added) +67 · `reversi.ts` (added) +116 · `subtract-square.ts` (added) +33 · `tictactoe.ts` (renamed) +2 −1 · `src/index.ts` (added) +34 · `drop.ts` (added) +110 · `line.ts` (added) +192 · `index.ts` +3 · `deploy-prod.sh` +7 −6 · `dev-stop.sh` (renamed) +4 −4 · `dev.sh` (renamed) +6 −6 · `prod-start.sh` (renamed) +2 −2 · `prod-stop.sh` (added) +5 · `stop.prod` (deleted) −5
