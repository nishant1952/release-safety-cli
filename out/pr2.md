# Release brief: Prod compose on :80 + faster EC2 deploys

Range `a2ac289..1ee249b`, 13 files changed. Title: PR title, declared.

**Mode: Human.** Grid: high damage x long window = Human. Gates route to Human.

## Plan

| Step | Proposed |
|---|---|
| Exposure | Proposed by the system: Small slice, soak, widen; slice by canary or percentage deploy (rollout mechanism is not extracted, so all-at-once is assumed). Approved or edited by the owner |
| Soak per step | Proposed by the system: Hours, scaled to traffic (traffic is not an input, so the hours are not scaled). Approved or edited by the owner |
| Guardrails | Same as staged, plus whatever the owner adds. domain: business checks, none found on the changed path; infra: resources and latency, watch deploy health check, declared (docker-compose.prod.yml:44, scripts/deploy-prod.sh:66) |
| Abort | Owner decides |
| Undo | Without one, undo is a rollback or redeploy and a slice is a canary or percentage deploy. Undo: revert and redeploy (time to revert: full build and deploy, assumed). |
| Paged | Named owner before step one: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local> (earlier author of the most touched files, measured from git; the repo has no CODEOWNERS file) |
| Sign-off | Required before step one |

## Top reasons

1. Gate 1 (Table stakes) is trip, so it routes to a human: hardcoded environment values: 1 added line(s) match.
   - `scripts/deploy-prod.sh:66` `if curl -fsS --max-time 1 "http://127.0.0.1/api/health" >/dev/null 2>&1; then`
2. High damage: the path is live (assumed) and the reach is high (assumed). measured: no calls from changed code reach an apps/api handler. Worth unknown because the metrics catalog (apps/api/src/infrastructure/observability/metrics-catalog.ts) is not in the repo, so reach is assumed wide. Not code paths, listed only: .github/workflows/deploy.yml (workflow), README.md (docs), docker-compose.prod.yml (compose), docker-compose.yml (compose), scripts/deploy-prod.sh (script).
   - no line to cite: this reason rests on something missing from the input or the repo
3. Long window: undo is slow: the flag is none and time to revert is full build and deploy (assumed); detection is slow (measured): domain: no business-level check (no value metric, no test of the changed domain files); infra: deploy health check.
   - `.github/workflows/deploy.yml:15` `timeout-minutes: 5`
   - `docker-compose.prod.yml:44` `healthcheck:`
   - `scripts/deploy-prod.sh:66` `if curl -fsS --max-time 1 "http://127.0.0.1/api/health" >/dev/null 2>&1; then`

## Confidence

**low**
- single-author repo: familiarity dropped (W appendix)
- Secrets present at base: observed (measured), .env.example:4 (URL credentials), .env.example:9 (email), docker-compose.yml:26 (URL credentials): present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence
- Failure mode (LLM second opinion): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- History: history unavailable (assumed), lowers confidence, does not raise risk (W 2)
- Confidence: diff vs task (LLM): unavailable (assumed), lowers confidence, does not raise risk (W 2)

## The one unknown

No single assumed input changes the mode. Considered: Path (live); Reach (high); Time to revert (full build and deploy); Failure mode (LLM second opinion) (cannot move the mode); History (cannot move the mode); Confidence: diff vs task (LLM) (cannot move the mode). With all of them at their favourable value the mode is Human, and no single known input changes it either.

## Disagreements

Disagreements: none between sources.

## Gates

| Gate | Result | Route | Checks |
|---|---|---|---|
| 1. Table stakes | trip | human | secrets: pass (measured); PII: pass (measured); hardcoded environment values: trip (measured); required CI checks: pass (measured) |
| 2. API contract | pass | none | breaking change to route, schema or public signature: pass (measured) |
| 3. Destructive schema or data change | pass | none | destructive schema change or mutation of existing data: pass (measured) |

Gate 1, hardcoded environment values:
- `scripts/deploy-prod.sh:66` `if curl -fsS --max-time 1 "http://127.0.0.1/api/health" >/dev/null 2>&1; then`

## Provenance

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible or irreversible | reversible | measured | none. no persisted write, outbound side effect, queue publish or external API client in 203 added lines |
| Feature flag | none | measured | none. no flag call (getBooleanValue) or control point anchor in the changed files |
| Path | live | assumed | none. no entry point found in workspace package.json scripts or index.html, so the path is assumed live. Not code paths, listed only: .github/workflows/deploy.yml (workflow), README.md (docs), docker-compose.prod.yml (compose), docker-compose.yml (compose), scripts/deploy-prod.sh (script) |
| Reach | high | assumed | none. measured: no calls from changed code reach an apps/api handler. Worth unknown because the metrics catalog (apps/api/src/infrastructure/observability/metrics-catalog.ts) is not in the repo, so reach is assumed wide. Not code paths, listed only: .github/workflows/deploy.yml (workflow), README.md (docs), docker-compose.prod.yml (compose), docker-compose.yml (compose), scripts/deploy-prod.sh (script) |
| Failure mode | domain, infra | measured | `.env.example:6`, `.github/workflows/deploy.yml:15`, `.gitignore:10`, `Dockerfile:7` +9. rules on touched paths: .env.example -> domain; .github/workflows/deploy.yml -> infra; .gitignore -> domain; Dockerfile -> infra; README.md -> none; docker-compose.prod.yml -> infra; docker-compose.yml -> infra; package.json -> infra; scripts/deploy-prod.sh -> infra; start -> domain; start.prod -> domain; stop -> domain; stop.prod -> domain. Matched on file path; each evidence line is the file's first change |
| Failure mode (LLM second opinion) | unavailable | assumed | none. no ANTHROPIC_API_KEY; rules only |
| Detection apparatus | slow | measured | `docker-compose.prod.yml:44`, `scripts/deploy-prod.sh:66`. domain: no business-level check (no value metric, no test of the changed domain files); infra: deploy health check. Every failure mode needs its detector, so detection is slow. no metric or log call on changed lines. Checked in the repo only; alert config outside the repo (OpenObserve) is not an input |
| Time to revert | full build and deploy | assumed | `.github/workflows/deploy.yml:15`. no one-click rollback in 1 workflow file(s); CI run history is not an input, so pipeline duration is not measured. Declared job timeout: 5 min (a bound, not a measurement). Unknown rounds to slow: a full build and deploy to revert (W 2) |
| History | history unavailable | assumed | none. measured: 3 earlier commits touch the changed files, 0 reverts, 0 fix commits; repo history before base spans 0h (2026-10-06 to 2026-10-06). Too thin to read as a record (thin: < 5 commits or < 7 days) |
| Provenance | agent-assisted (Cursor) | measured | `commit 1ee249b`. commit trailers: Cursor <cursoragent@cursor.com>; PR description: "Made with Cursor"; author(s) in git: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>. Whether a human was in the loop is not verifiable from the input |
| Confidence: test coverage | no code files changed | measured | none. tests that import a changed file; 0 covered by tests that existed before the change. Uncovered: none |
| Confidence: familiarity | single-author repo, people part dropped | measured | none. repo authors before base: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>; per file: .env.example (1), .github/workflows/deploy.yml (1), .gitignore (1), Dockerfile (1), README.md (1), docker-compose.prod.yml (0), docker-compose.yml (1), package.json (1), scripts/deploy-prod.sh (0), start (1), start.prod (0), stop (1), stop.prod (0). Reviewer familiarity needs review data: the PR export lists 0 reviews |
| Confidence: review depth | 0 reviews | declared | none. the PR export lists 0 reviews |
| Confidence: diff vs task (LLM) | unavailable | assumed | none. no ANTHROPIC_API_KEY |
| Secrets present at base | observed | measured | `.env.example:4`, `.env.example:9`, `docker-compose.yml:26`. .env.example:4 (URL credentials), .env.example:9 (email), docker-compose.yml:26 (URL credentials): present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence |

## Changed files

- `.env.example` (modified, +1 -0)
- `.github/workflows/deploy.yml` (modified, +7 -39)
- `.gitignore` (modified, +2 -0)
- `Dockerfile` (modified, +6 -3)
- `README.md` (modified, +28 -22)
- `docker-compose.prod.yml` (added, +58 -0)
- `docker-compose.yml` (modified, +3 -1)
- `package.json` (modified, +3 -1)
- `scripts/deploy-prod.sh` (added, +77 -0)
- `start` (modified, +2 -2)
- `start.prod` (added, +9 -0)
- `stop` (modified, +2 -2)
- `stop.prod` (added, +5 -0)
