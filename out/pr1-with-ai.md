# Release brief: Add OpenObserve logs, metrics, and traces with fetch-back verify.

Range `7eed1d0..528c308`, 7 files changed. Title: PR title, declared.

**Mode: Human.** Grid: high damage x long window = Human.

## Plan

| Step | Proposed |
|---|---|
| Exposure | Proposed by the system: Small slice, soak, widen; slice by canary or percentage deploy (rollout mechanism is not extracted, so all-at-once is assumed). Approved or edited by the owner |
| Soak per step | Proposed by the system: Hours, scaled to traffic (traffic is not an input, so the hours are not scaled). Approved or edited by the owner |
| Guardrails | Same as staged, plus whatever the owner adds. domain: business checks, watch value metric info, measured (server/src/index.ts:65); infra: resources and latency, watch error rate metric error, measured (server/src/index.ts:304); deploy health check, declared (.github/workflows/deploy.yml:71) |
| Abort | Owner decides |
| Undo | Without one, undo is a rollback or redeploy and a slice is a canary or percentage deploy. Undo: revert and redeploy (time to revert: full build and deploy, assumed). |
| Paged | Named owner before step one: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local> (earlier author of the most touched files, measured from git; the repo has no CODEOWNERS file) |
| Sign-off | Required before step one |

## Top reasons

1. High damage: the path is live (assumed) and the reach is high (assumed). measured: no calls from changed code reach an apps/api handler. Worth unknown because the metrics catalog (apps/api/src/infrastructure/observability/metrics-catalog.ts) is not in the repo, so reach is assumed wide. Not code paths, listed only: .github/workflows/deploy.yml (workflow), README.md (docs), docker-compose.yml (compose).
   - no line to cite: this reason rests on something missing from the input or the repo
2. Long window: the change is irreversible; undo is slow: the flag is none and time to revert is full build and deploy (assumed).
   *This change is irreversible and slow to undo, because no feature flag exists and reverting would take a full build and deploy (an assumption). The cited lines show a deploy workflow with a 10-minute timeout and a health check against /api/health, along with server start and request error logging.* (LLM wording)
   - `.github/workflows/deploy.yml:15` `timeout-minutes: 10`
   - `server/src/index.ts:65` `await log("info", "server.start", { port: PORT });`
   - `server/src/index.ts:304` `if (ctx) void log("error", "request.error", { message, route: ctx.route }, ctx);`
   - `.github/workflows/deploy.yml:71` `if curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health" >/dev/null 2>&1; then`
3. Probability: measured confidence is low, so the mode moves one step toward caution (already Human, no further step).
   - no line to cite: this reason rests on something missing from the input or the repo

## Confidence

**low**
- no test that existed before the change covers any of the 2 changed code files (measured)
- single-author repo: familiarity dropped (W appendix)
- Secrets present at base: observed (measured), .env.example:8 (email), .env.example:9 (credential): present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence
- LLM found mismatches between the diff and the task (can only lower confidence)
- History: history unavailable (assumed), lowers confidence, does not raise risk (W 2)
- gate 2: 2 export(s) removed or changed in modules internal to the repo (declared by package.json), lowers confidence one notch
- disagreement lowers confidence: provenance: commit trailers name an agent but the PR description does not (W 2)
- disagreement lowers confidence: failure mode: rules say domain, infra, LLM second opinion says domain, infra, security (W 2)

## The one unknown

No single assumed input changes the mode. Considered: Path (live); Reach (high); Time to revert (full build and deploy); History (cannot move the mode). With all of them at their favourable value the mode is Human, and no single known input changes it either.

## Disagreements

- Disagreement: provenance: commit trailers name an agent but the PR description does not
- Disagreement: failure mode: rules say domain, infra, LLM second opinion says domain, infra, security

## Gates

| Gate | Result | Route | Checks |
|---|---|---|---|
| 1. Table stakes | pass | none | secrets: pass (measured); PII: pass (measured); hardcoded environment values: pass (measured); required CI checks: pass (measured) |
| 2. API contract | pass | none | breaking change to route, schema or public signature: pass (declared); internal signature changes: pass (declared); additive API surface: pass (measured) |
| 3. Destructive schema or data change | pass | none | destructive schema change or mutation of existing data: pass (measured) |

Gate 2, internal signature changes:
- `server/src/metrics.ts@7eed1d0:14` `export async function track(event: MetricEvent): Promise<void> {`
- `server/src/metrics.ts@7eed1d0:41` `export async function listStreams(): Promise<unknown> {`

Gate 2, additive API surface:
- `server/src/index.ts:93` `if (path === "/api/observability/verify" && req.method === "GET") {`
- `server/src/index.ts:98` `if (path === "/api/observability/streams" && req.method === "GET") {`
- `server/src/observability.ts:16` `export type LogLevel = "debug" | "info" | "warn" | "error";`
- `server/src/observability.ts:76` `export async function log(`
- and 9 more

## Provenance

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible or irreversible | irreversible | measured | `server/src/observability.ts:46`, `server/src/observability.ts:68`, `server/src/observability.ts:304`. HTTP call, target not resolved one hop in the diff: treated as irreversible because it may leave effects a redeploy cannot undo |
| Feature flag | none | measured | none. no flag call (getBooleanValue) or control point anchor in the changed files |
| Path | live | assumed | none. no entry point found in workspace package.json scripts or index.html, so the path is assumed live. Not code paths, listed only: .github/workflows/deploy.yml (workflow), README.md (docs), docker-compose.yml (compose) |
| Reach | high | assumed | `server/src/index.ts:73`, `server/src/index.ts:47`. measured: no calls from changed code reach an apps/api handler. Worth unknown because the metrics catalog (apps/api/src/infrastructure/observability/metrics-catalog.ts) is not in the repo, so reach is assumed wide. Not code paths, listed only: .github/workflows/deploy.yml (workflow), README.md (docs), docker-compose.yml (compose) |
| Failure mode | domain, infra | measured | `.env.example:10`, `.github/workflows/deploy.yml:29`, `README.md:19`, `docker-compose.yml:30` +3. rules on touched paths: .env.example -> domain; .github/workflows/deploy.yml -> infra; README.md -> none; docker-compose.yml -> infra; server/src/index.ts -> domain; server/src/metrics.ts -> domain; server/src/observability.ts -> domain. Matched on file path; each evidence line is the file's first change |
| Failure mode (LLM second opinion) | domain, infra, security | assumed | none. disagrees with the rules (domain, infra). Infra: every API request now fires four extra outbound calls to OpenObserve (log, two metrics, trace), and the verify endpoint can run for ~12s or more with retries, so a slow or unreachable OpenObserve adds load and latency, and it also makes the verify endpoint a long-running request. Security: /api/observability/verify and /api/observability/streams are unauthenticated and expose OpenObserve ingest responses, stream names and schemas; the verify endpoint triggers writes and searches on demand (a DoS/cost vector); probe IDs are interpolated into SQL, though they are generated server-side. Domain: metrics are posted with the stream/format assumptions of OpenObserve (the metrics-ingest format, the trace search field names), so they may be silently dropped or mislabeled, and the old temp_battle stream is no longer written so existing dashboards break; the usernames are logged as fields. |
| Detection apparatus | fast | measured | `server/src/index.ts:65`, `server/src/index.ts:304`, `.github/workflows/deploy.yml:71`. domain: value metric info; infra: error rate metric error, deploy health check. 7 metric/log calls on changed lines (info: value, startRequest: count, finishRequest: count, verifyInjection: count, listStreams: count, error: error rate) |
| Time to revert | full build and deploy | assumed | `.github/workflows/deploy.yml:15`. no one-click rollback in 1 workflow file(s); CI run history is not an input, so pipeline duration is not measured. Declared job timeout: 10 min (a bound, not a measurement). Unknown rounds to slow: a full build and deploy to revert (W 2) |
| History | history unavailable | assumed | none. measured: 2 earlier commits touch the changed files, 0 reverts, 0 fix commits; repo history before base spans 0h (2026-10-06 to 2026-10-06). Too thin to read as a record (thin: < 5 commits or < 7 days) |
| Provenance | agent-assisted (Cursor) | measured | `commit 528c308`. commit trailers: Cursor <cursoragent@cursor.com>; PR description: no agent named; author(s) in git: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>. Whether a human was in the loop is not verifiable from the input |
| Confidence: test coverage | 0 of 2 changed code files have a test | measured | none. tests that import a changed file; 0 covered by tests that existed before the change. Uncovered: server/src/index.ts, server/src/observability.ts |
| Confidence: familiarity | single-author repo, people part dropped | measured | none. repo authors before base: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>; per file: .env.example (1), .github/workflows/deploy.yml (1), README.md (1), docker-compose.yml (1), server/src/index.ts (1), server/src/metrics.ts (1), server/src/observability.ts (0). Reviewer familiarity needs review data: the PR export lists 0 reviews |
| Confidence: review depth | 0 reviews | declared | none. the PR export lists 0 reviews |
| Confidence: diff vs task (LLM) | mismatch | assumed | none. Removes server/src/metrics.ts and its writes to the temp_battle stream, which the description does not mention; existing dashboards on that stream go stale.; Adds an unauthenticated /api/observability/streams endpoint and keeps a /api/metrics/streams alias, which the description does not mention.; The description says every API request is instrumented, but static routes are skipped and the metrics for the request are sent fire-and-forget after the response; the verify endpoint is also instrumented recursively.; Adds the OPENOBSERVE_LOG_STREAM and OPENOBSERVE_TRACE_STREAM deploy configuration through secrets, which the description does not mention. |
| Secrets present at base | observed | measured | `.env.example:8`, `.env.example:9`. .env.example:8 (email), .env.example:9 (credential): present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence |

## Changed files

- `.env.example` (modified, +2 -0)
- `.github/workflows/deploy.yml` (modified, +5 -1)
- `README.md` (modified, +17 -1)
- `docker-compose.yml` (modified, +2 -0)
- `server/src/index.ts` (modified, +97 -41)
- `server/src/metrics.ts` (deleted, +0 -51)
- `server/src/observability.ts` (added, +454 -0)
