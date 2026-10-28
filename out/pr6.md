# Release brief: Fix arcade EC2 deploy path

Range `50f606b..bd5cf7c`, 2 files, +12 −4. All three gates pass. Sources agree.

**Mode: Staged.** Low damage × long window. Confidence low.

In one line: an unflagged change that touches no code path (measured), undone by a full build and deploy (assumed).

## Plan

| Step | Proposed |
|---|---|
| Exposure | Small slice, soak, widen; slice by canary or percentage deploy (rollout mechanism is not extracted, so all-at-once is assumed) |
| Soak per step | Hours, scaled to traffic (traffic is not an input, so the hours are not scaled) |
| Guardrails | Watch deploy health check. |
| Abort | Guardrail breach: back one step or to 0%. Thin data: hold |
| Undo | No flag: revert and redeploy (full build and deploy, assumed). |
| Paged | Service on-call on abort |
| Sign-off | None |

## Why Staged

1. **Low damage.** Path not a code path (measured).
   No line to cite.
2. **Long window.** No flag, so undo is full build and deploy (assumed: no rollback, pipeline time unmeasured).
   `.github/workflows/deploy.yml:15` `timeout-minutes: 5`

Confidence low, high from measured facts. Lowered by: Failure mode (LLM second opinion): unavailable (assumed); History: history unavailable (assumed); Confidence: diff vs task (LLM): unavailable (assumed).

## What would move it

If Time to revert (assumed full build and deploy) were measured pipeline under 15 minutes, the mode would move from Staged to Auto. No single known input moves it either.

## Signals

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible | reversible | measured | no persisted write, outbound side effect, queue publish or external API client in 12 added lines |
| Feature flag | none | measured | no flag call (getBooleanValue) or control point anchor in the changed files |
| Path | not a code path | measured | every changed file is a non-code file: deploy.yml (workflow), deploy-prod.sh (script) |
| Reach | none | measured | every changed file is a non-code file, so no system is reached: deploy.yml (workflow), deploy-prod.sh (script) |
| Failure mode | infra | measured | `deploy.yml:40` +1. Matched on file path |
| Detection | fast | declared | `docker-compose.prod.yml:44` +1. infra: deploy health check. no metric or log call on changed lines |
| Time to revert | full build and deploy | assumed | `deploy.yml:15`. no one-click rollback in 1 workflow file(s) |
| History | history unavailable | assumed | `commit 0fb48b9`. Too thin to read as a record |
| Provenance | agent-assisted (Cursor) | measured | `commit bd5cf7c`. commit trailers: Cursor |
| Test coverage | no code files changed | measured | 0 covered by tests that existed before the change |
| Reviews | 0 reviews | declared | familiarity: single-author repo, people part dropped (measured) |
| Model | off | — | no ANTHROPIC_API_KEY; failure mode and task check not run |

## Gates

All pass.

## Changed files

`deploy.yml` +9 −3 · `deploy-prod.sh` +3 −1
