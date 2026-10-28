# Release brief: Fix deploy SSH timeout warning + SG docs

Range `d4a40df..0fb48b9`, 2 files changed. Title: PR title, declared.

**Mode: Staged.** Grid: low damage x long window = Staged.

## Plan

| Step | Proposed |
|---|---|
| Exposure | Small slice, soak, widen; slice by canary or percentage deploy (rollout mechanism is not extracted, so all-at-once is assumed) |
| Soak per step | Hours, scaled to traffic (traffic is not an input, so the hours are not scaled) |
| Guardrails | Follow the failure mode: resources and latency for infra, business checks for domain, auth errors for security. infra: resources and latency, watch deploy health check, declared (docker-compose.prod.yml:44, scripts/deploy-prod.sh:66) |
| Abort | Guardrail breach: back one step or to 0%. Thin data: hold |
| Undo | Without one, undo is a rollback or redeploy and a slice is a canary or percentage deploy. Undo: revert and redeploy (time to revert: full build and deploy, assumed). |
| Paged | Service on-call on abort |
| Sign-off | None |

## Top reasons

1. Low damage: the path is not a code path (measured).
   - no line to cite: this reason rests on something missing from the input or the repo
2. Long window: undo is slow: the flag is none and time to revert is full build and deploy (assumed).
   - `.github/workflows/deploy.yml:15` `timeout-minutes: 5`
   - `docker-compose.prod.yml:44` `healthcheck:`
   - `scripts/deploy-prod.sh:66` `if curl -fsS --max-time 1 "http://127.0.0.1/api/health" >/dev/null 2>&1; then`

## Confidence

**low**
- single-author repo: familiarity dropped (W appendix)
- Failure mode (LLM second opinion): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- History: history unavailable (assumed), lowers confidence, does not raise risk (W 2)
- Confidence: diff vs task (LLM): unavailable (assumed), lowers confidence, does not raise risk (W 2)

## The one unknown

**Time to revert**: assumed full build and deploy. If it were measured pipeline under 15 minutes, the mode would move from Staged to Auto.

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
| Reversible or irreversible | reversible | measured | none. no persisted write, outbound side effect, queue publish or external API client in 13 added lines |
| Feature flag | none | measured | none. no flag call (getBooleanValue) or control point anchor in the changed files |
| Path | not a code path | measured | none. every changed file is a non-code file: .github/workflows/deploy.yml (workflow), README.md (docs) |
| Reach | none | measured | none. every changed file is a non-code file, so no system is reached: .github/workflows/deploy.yml (workflow), README.md (docs) |
| Failure mode | infra | measured | `.github/workflows/deploy.yml:34`, `README.md:70`. rules on touched paths: .github/workflows/deploy.yml -> infra; README.md -> none. Matched on file path; each evidence line is the file's first change |
| Failure mode (LLM second opinion) | unavailable | assumed | none. no ANTHROPIC_API_KEY; rules only |
| Detection apparatus | fast | declared | `docker-compose.prod.yml:44`, `scripts/deploy-prod.sh:66`. infra: deploy health check. no metric or log call on changed lines |
| Time to revert | full build and deploy | assumed | `.github/workflows/deploy.yml:15`. no one-click rollback in 1 workflow file(s); CI run history is not an input, so pipeline duration is not measured. Declared job timeout: 5 min (a bound, not a measurement). Unknown rounds to slow: a full build and deploy to revert (W 2) |
| History | history unavailable | assumed | none. measured: 4 earlier commits touch the changed files, 0 reverts, 0 fix commits; repo history before base spans 1h (2026-10-06 to 2026-10-06). Too thin to read as a record (thin: < 5 commits or < 7 days) |
| Provenance | agent-assisted (Cursor) | measured | `commit 0fb48b9`. commit trailers: Cursor <cursoragent@cursor.com>; PR description: "Made with Cursor"; author(s) in git: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>. Whether a human was in the loop is not verifiable from the input |
| Confidence: test coverage | no code files changed | measured | none. tests that import a changed file; 0 covered by tests that existed before the change. Uncovered: none |
| Confidence: familiarity | single-author repo, people part dropped | measured | none. repo authors before base: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>; per file: .github/workflows/deploy.yml (1), README.md (1). Reviewer familiarity needs review data: the PR export lists 0 reviews |
| Confidence: review depth | 0 reviews | declared | none. the PR export lists 0 reviews |
| Confidence: diff vs task (LLM) | unavailable | assumed | none. no ANTHROPIC_API_KEY |

## Changed files

- `.github/workflows/deploy.yml` (modified, +3 -1)
- `README.md` (modified, +10 -1)
