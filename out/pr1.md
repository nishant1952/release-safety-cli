# Release brief: Add OpenObserve logs, metrics, and traces with fetch-back verify.

Range `7eed1d0..528c308`, 7 files, +577 −94. All three gates pass. Sources disagree on 1 point, listed below.

**Mode: Human.** High damage × long window. Confidence low.

In one line: an unflagged, irreversible change on a live path (assumed) with high reach (assumed).

## Plan

Each row is proposed by the system; the owner approves or edits it.

| Step | Proposed |
|---|---|
| Exposure | Small slice, soak, widen; slice by canary or percentage deploy (rollout mechanism is not extracted, so all-at-once is assumed) |
| Soak per step | Hours, scaled to traffic (traffic is not an input, so the hours are not scaled) |
| Guardrails | Watch value metric `info`, error rate metric `error`, deploy health check. |
| Abort | Owner decides |
| Undo | No flag: revert and redeploy (full build and deploy, assumed). |
| Paged | Named owner before step one: Kalyan Chowdary, earlier author of the most touched files (git); the repo has no CODEOWNERS file |
| Sign-off | Required before step one |

## Why Human

1. **High damage.** Path live (assumed: no entry point found), reach high (assumed: no declared tier applies).
   No line to cite.
2. **Long window.** The change is irreversible; no flag, so undo is full build and deploy (assumed: no rollback, pipeline time unmeasured).
   `.github/workflows/deploy.yml:15` `timeout-minutes: 10`
3. **Low confidence.** No test that existed before the change covers any of the 2 changed code files (measured). The mode is already Human, so it moves no further.
   No line to cite.

## What would move it

No assumed input changes the mode, alone or together. The known inputs that would move it: Reversible or irreversible irreversible (measured), to Staged; confidence low (measured), to Staged.

## Disagreements

- provenance: commit trailers name an agent but the PR description does not

## Signals

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible | irreversible | measured | `observability.ts:46` +2. HTTP call, target not resolved one hop in the diff: treated as irreversible because it may leave effects a redeploy cannot undo |
| Feature flag | none | measured | no flag call (getBooleanValue) or control point anchor in the changed files |
| Path | live | assumed | no entry point found in workspace package.json scripts or index.html, so the path is assumed live |
| Reach | high | assumed | `index.ts:73` +1. the metrics catalog (metrics-catalog.ts) is not in the repo, so reach is assumed wide |
| Failure mode | domain, infra | measured | `.env.example:10` +6. Matched on file path |
| Detection | fast | measured | `index.ts:65` +2. domain: value metric info |
| Time to revert | full build and deploy | assumed | `deploy.yml:15`. no one-click rollback in 1 workflow file(s) |
| History | history unavailable | assumed | Too thin to read as a record |
| Provenance | agent-assisted (Cursor) | measured | `commit 528c308`. commit trailers: Cursor |
| Test coverage | 0 of 2 changed code files have a test | measured | 0 covered by tests that existed before the change |
| Reviews | 0 reviews | declared | familiarity: single-author repo, people part dropped (measured) |
| Secrets present at base | observed | measured | `.env.example:8` +1. present before this change, not added by it; listed in full below |
| Model | off | — | no ANTHROPIC_API_KEY; failure mode and task check not run |

## Gates

All pass. Gate 2 notes internal signature changes: 2 lines, `metrics.ts@7eed1d0:14` +1. Gate 2 notes additive API surface: 13 lines, `index.ts:93` +12.

## Secrets present at base

.env.example:8 (email), .env.example:9 (credential): present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence.

## Changed files

`.env.example` +2 · `deploy.yml` +5 −1 · `README.md` +17 −1 · `docker-compose.yml` +2 · `index.ts` +97 −41 · `metrics.ts` (deleted) −51 · `observability.ts` (added) +454
