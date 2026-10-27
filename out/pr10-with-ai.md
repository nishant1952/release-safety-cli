# Release brief: Competitive color palette for the online game lobby

Range `f9a802d..0d3e9d1`, 3 files changed. Title: PR title, declared.

**Mode: Human.** Grid: high damage x long window = Human.

## Plan

| Step | Proposed |
|---|---|
| Exposure | Proposed by the system: Small slice, soak, widen; slice by canary or percentage deploy (rollout mechanism is not extracted, so all-at-once is assumed). Approved or edited by the owner |
| Soak per step | Proposed by the system: Hours, scaled to traffic (traffic is not an input, so the hours are not scaled). Approved or edited by the owner |
| Guardrails | Same as staged, plus whatever the owner adds. domain: business checks, none found on the changed path |
| Abort | Owner decides |
| Undo | Without one, undo is a rollback or redeploy and a slice is a canary or percentage deploy. Undo: revert and redeploy (time to revert: full build and deploy, assumed). |
| Paged | Named owner before step one: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local> (earlier author of the most touched files, measured from git; the repo has no CODEOWNERS file) |
| Sign-off | Required before step one |

## Top reasons

1. High damage: the path is live (declared) and the reach is high (assumed). measured: no calls from changed code reach an apps/api handler. Worth unknown because the metrics catalog declares no tier for any of its 16 entries, so reach is assumed wide. Not code paths, listed only: apps/web/src/games/outcome.css (stylesheet), apps/web/src/styles.css (stylesheet).
   *The damage is rated high because the path is declared live and its reach is assumed to be high, and the reach is only assumed because the metrics catalog declares no tier for any of its 16 entries, so the worth is unknown. Measurement found no calls from changed code reaching an apps/api handler, and the two stylesheets, apps/web/src/games/outcome.css and apps/web/src/styles.css, are listed only and are not code paths.* (LLM wording)
   - `apps/web/src/Lobby.tsx:5` `import { CATEGORIES, inCategory, metaFor, type GameCategory } from "./games/meta";`
   - `apps/web/src/App.tsx:16` `import { LobbyPage } from "./Lobby";`
   - `apps/web/src/main.tsx:4` `import App from "./App";`
2. Long window: undo is slow: the flag is none and time to revert is full build and deploy (assumed); detection is slow (measured): domain: no business-level check (no value metric, no test of the changed domain files).
   *The window for problems to persist is long because undoing the release is slow: there is no feature flag, so reverting requires a full build and deploy (an assumption), and detection is also slow (measured). Detection is weak at the business level because there is no value metric and no test covering the changed domain files, and the cited line .github/workflows/deploy.yml:15 sets timeout-minutes: 5.* (LLM wording)
   - `.github/workflows/deploy.yml:15` `timeout-minutes: 5`
3. Probability: measured confidence is low, so the mode moves one step toward caution (already Human, no further step).
   - no line to cite: this reason rests on something missing from the input or the repo

## Confidence

**low**
- no test that existed before the change covers any of the 1 changed code files (measured)
- single-author repo: familiarity dropped (W appendix)
- LLM found mismatches between the diff and the task (can only lower confidence)
- History: history unavailable (assumed), lowers confidence, does not raise risk (W 2)

## The one unknown

No single assumed input changes the mode. Considered: Reach (high); Time to revert (full build and deploy); History (cannot move the mode). With all of them at their favourable value the mode is Human, and no single known input changes it either.

## Disagreements

Disagreements: none between sources.

## Gates

| Gate | Result | Route | Checks |
|---|---|---|---|
| 1. Table stakes | pass | none | secrets: pass (measured); PII: pass (measured); hardcoded environment values: pass (measured); required CI checks: pass (measured) |
| 2. API contract | pass | none | breaking change to route, schema or public signature: pass (measured) |
| 3. Destructive schema or data change | pass | none | destructive schema change or mutation of existing data: pass (measured) |

## Provenance

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible or irreversible | reversible | measured | none. no persisted write, outbound side effect, queue publish or external API client in 118 added lines |
| Feature flag | none | measured | none. no flag call (getBooleanValue) or control point anchor in the changed files |
| Path | live | declared | `apps/web/src/Lobby.tsx:5`, `apps/web/src/App.tsx:16`, `apps/web/src/main.tsx:4`. apps/web/src/games/meta.ts reaches apps/web/src/main.tsx in 3 import(s). Import graph and routes measured; entry points declared by package.json scripts and index.html: apps/api/src/main.ts, apps/web/src/main.tsx. Not code paths, listed only: apps/web/src/games/outcome.css (stylesheet), apps/web/src/styles.css (stylesheet) |
| Reach | high | assumed | none. measured: no calls from changed code reach an apps/api handler. Worth unknown because the metrics catalog declares no tier for any of its 16 entries, so reach is assumed wide. Not code paths, listed only: apps/web/src/games/outcome.css (stylesheet), apps/web/src/styles.css (stylesheet) |
| Failure mode | domain | measured | `apps/web/src/games/meta.ts:1`, `apps/web/src/games/outcome.css:322`, `apps/web/src/styles.css:2`. rules on touched paths: apps/web/src/games/meta.ts -> domain; apps/web/src/games/outcome.css -> cosmetic; apps/web/src/styles.css -> cosmetic. Matched on file path; each evidence line is the file's first change |
| Failure mode (LLM second opinion) | domain | assumed | none. agrees with the rules (domain). Purely visual color changes; the risk is wrong appearance such as poor contrast or the repurposed --mint variable now being volt, which error rates cannot detect. |
| Detection apparatus | slow | measured | none. domain: no business-level check (no value metric, no test of the changed domain files). Every failure mode needs its detector, so detection is slow. no metric or log call on changed lines. Checked in the repo only; alert config outside the repo (OpenObserve) is not an input |
| Time to revert | full build and deploy | assumed | `.github/workflows/deploy.yml:15`. no one-click rollback in 1 workflow file(s); CI run history is not an input, so pipeline duration is not measured. Declared job timeout: 5 min (a bound, not a measurement). Unknown rounds to slow: a full build and deploy to revert (W 2) |
| History | history unavailable | assumed | none. measured: 4 earlier commits touch the changed files, 0 reverts, 0 fix commits; repo history before base spans 2h (2026-10-06 to 2026-10-06). Too thin to read as a record (thin: < 5 commits or < 7 days) |
| Provenance | agent-assisted (Cursor) | measured | `commit 0d3e9d1`. commit trailers: Cursor <cursoragent@cursor.com>; PR description: "Made with Cursor"; author(s) in git: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>. Whether a human was in the loop is not verifiable from the input |
| Confidence: test coverage | 0 of 1 changed code files have a test | measured | none. tests that import a changed file; 0 covered by tests that existed before the change. Uncovered: apps/web/src/games/meta.ts |
| Confidence: familiarity | single-author repo, people part dropped | measured | none. repo authors before base: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>; per file: apps/web/src/games/meta.ts (1), apps/web/src/games/outcome.css (1), apps/web/src/styles.css (1). Reviewer familiarity needs review data: the PR export lists 0 reviews |
| Confidence: review depth | 0 reviews | declared | none. the PR export lists 0 reviews |
| Confidence: diff vs task (LLM) | mismatch | assumed | none. --teal was changed from #1f6f5b to #00b8a0, while outcome.css still uses var(--teal) for the dotsboxes win border, and the change also adds new CSS variables --cyan, --cobalt and --amber (amber is defined but never used in the diff).; The PR description says the board accents, mobile lobby categories and play board contrast were refreshed, but the diff only changes a few board colors (boxes-owner, glow); the variable --mint now holds volt, which is a misleading name. |

## Changed files

- `apps/web/src/games/meta.ts` (modified, +74 -73)
- `apps/web/src/games/outcome.css` (modified, +1 -1)
- `apps/web/src/styles.css` (modified, +43 -38)
