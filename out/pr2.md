# Release brief: Prod compose on :80 + faster EC2 deploys

Range `a2ac289..1ee249b`, 13 files, +203 −70. Gate 1 trips. Sources agree.

**Mode: Human.** High damage × long window = Human; gates route to Human. Confidence low.

In one line: an unflagged change on a live path (assumed) with high reach (assumed), undone by a full build and deploy (assumed), with nothing found that detects a domain failure, and gate 1 routes it to Human.

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
   `scripts/deploy-prod.sh:66` `if curl -fsS --max-time 1 "http://127.0.0.1/api/health" >/dev/null 2>&1; then`
2. **High damage.** Path live (assumed: no entry point found), reach high (assumed: no declared tier applies).
   No line to cite.
3. **Long window.** No flag, so undo is full build and deploy (assumed: no rollback, pipeline time unmeasured). Detection slow (measured): no business-level check for domain.
   `.github/workflows/deploy.yml:15` `timeout-minutes: 5`

Confidence low, high from measured facts. Lowered by: Failure mode (LLM second opinion): unavailable (assumed); History: history unavailable (assumed); Confidence: diff vs task (LLM): unavailable (assumed).

## What would move it

No assumed input changes the mode, alone or together. No single known input moves it either.

## Signals

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible | reversible | measured | no persisted write, outbound side effect, queue publish or external API client in 203 added lines |
| Feature flag | none | measured | no flag call (getBooleanValue) or control point anchor in the changed files |
| Path | live | assumed | no entry point found in workspace package.json scripts or index.html, so the path is assumed live |
| Reach | high | assumed | the metrics catalog (metrics-catalog.ts) is not in the repo, so reach is assumed wide |
| Failure mode | domain, infra | measured | `.env.example:6` +12. Matched on file path |
| Detection | slow | measured | `docker-compose.prod.yml:44` +1. domain: no business-level check |
| Time to revert | full build and deploy | assumed | `deploy.yml:15`. no one-click rollback in 1 workflow file(s) |
| History | history unavailable | assumed | Too thin to read as a record |
| Provenance | agent-assisted (Cursor) | measured | `commit 1ee249b`. commit trailers: Cursor |
| Test coverage | no code files changed | measured | 0 covered by tests that existed before the change |
| Reviews | 0 reviews | declared | familiarity: single-author repo, people part dropped (measured) |
| Secrets present at base | observed | measured | `.env.example:4` +2. present before this change, not added by it; listed in full below |
| Model | off | — | no ANTHROPIC_API_KEY; failure mode and task check not run |

## Gates

| Gate | Result | Route | Checks |
|---|---|---|---|
| 1. Table stakes | trip | human | secrets: pass (measured); PII: pass (measured); hardcoded environment values: trip (measured); required CI checks: pass (measured) |
| 2. API contract | pass | none | breaking change to route, schema or public signature: pass (measured) |
| 3. Destructive schema or data change | pass | none | destructive schema change or mutation of existing data: pass (measured) |

Gate 1, hardcoded environment values:
- `scripts/deploy-prod.sh:66` `if curl -fsS --max-time 1 "http://127.0.0.1/api/health" >/dev/null 2>&1; then`

## Secrets present at base

.env.example:4 (URL credentials), .env.example:9 (email), docker-compose.yml:26 (URL credentials): present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence.

## Changed files

`.env.example` +1 · `deploy.yml` +7 −39 · `.gitignore` +2 · `Dockerfile` +6 −3 · `README.md` +28 −22 · `docker-compose.prod.yml` (added) +58 · `docker-compose.yml` +3 −1 · `package.json` +3 −1 · `deploy-prod.sh` (added) +77 · `start` +2 −2 · `start.prod` (added) +9 · `stop` +2 −2 · `stop.prod` (added) +5
