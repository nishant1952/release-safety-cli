# Release brief: Initialise FireWeave rollout-ready for the API

Range `206fa14..974d34c`, 70 files changed. Title: PR title, declared.

**Mode: Human.** Grid: high damage x long window = Human. Gates route to Human.

## Plan

| Step | Proposed |
|---|---|
| Exposure | Proposed by the system: Small slice, soak, widen; slice by canary or percentage deploy (rollout mechanism is not extracted, so all-at-once is assumed). Approved or edited by the owner |
| Soak per step | Proposed by the system: Hours, scaled to traffic (traffic is not an input, so the hours are not scaled). Approved or edited by the owner |
| Guardrails | Same as staged, plus whatever the owner adds. domain: business checks, none found on the changed path; infra: resources and latency, watch deploy health check, declared (docker/compose.prod.yml:49, scripts/deploy-prod.sh:74); security: auth errors, none found on the changed path |
| Abort | Owner decides |
| Undo | Without one, undo is a rollback or redeploy and a slice is a canary or percentage deploy. Undo: revert and redeploy (time to revert: full build and deploy, assumed). |
| Paged | Named owner before step one: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local> (earlier author of the most touched files, measured from git; the repo has no CODEOWNERS file) |
| Sign-off | Required before step one |

## Top reasons

1. Gate 1 (Table stakes) is trip, so it routes to a human: hardcoded environment values: 10 added line(s) match.
   - `apps/api/src/fireweave/fw-providers.ts:93` `return [new URL(apiUrl).hostname, 'localhost', '127.0.0.1'];`
   - `apps/api/src/fireweave/fw-providers.ts:95` `return ['localhost', '127.0.0.1'];`
   - `apps/web/src/fireweave/fw-providers.ts:131` `const apiUrl = (current ?? legacy ?? 'https://app-server.fireweave.ai')`
   - `apps/web/src/fireweave/fw-providers.ts:155` `return [new URL(apiUrl).hostname, 'localhost', '127.0.0.1'];`
   - and 6 more
2. Gate 1: Red advisory check, no required checks on the repo: FireWeave — flag contract (FAILURE). Not required, so it cannot block; each lowers confidence one notch.
   - no line to cite: this reason rests on the PR export's check rollup and required-checks.json (declared and measured), not on a line of code
3. High damage: the path is live (declared) and the reach is high (assumed). measured: calls reach POST /api/client-telemetry (emitAction). Worth unknown because the metrics catalog declares no tier for any of its 17 entries, so reach is assumed wide. Not code paths, listed only: .claude/hooks/rollout-build-gate-stop.sh (editor config), .claude/hooks/rollout-intent-gate.sh (editor config), .claude/settings.json (editor config), .cursor/hooks.json (editor config), .cursor/hooks/fireweave-rollout-session.sh (editor config), .cursor/hooks/fireweave-rollout-stop.sh (editor config), .cursor/rules/fireweave-rollout-ready.mdc (editor config), .cursor/skills/adopt/SKILL.md (editor config), .cursor/skills/ci-register-control-points/SKILL.md (editor config), .cursor/skills/ci-rollout-readiness/SKILL.md (editor config), .cursor/skills/cleanup/SKILL.md (editor config), .cursor/skills/feedback/SKILL.md (editor config), .cursor/skills/feedback/references/taxonomy.md (editor config), .cursor/skills/initialise/SKILL.md (editor config), .cursor/skills/initialise/harness/go/fw_harness.go.tpl (editor config), .cursor/skills/initialise/harness/go/fw_providers.go.tpl (editor config), .cursor/skills/initialise/harness/go/fw_tracker.go.tpl (editor config), .cursor/skills/initialise/harness/java/FwHarness.java.tpl (editor config), .cursor/skills/initialise/harness/java/FwProviders.java.tpl (editor config), .cursor/skills/initialise/harness/java/FwTracker.java.tpl (editor config), .cursor/skills/initialise/harness/python/fw_harness.py.tpl (editor config), .cursor/skills/initialise/harness/python/fw_providers.py.tpl (editor config), .cursor/skills/initialise/harness/python/fw_tracker.py.tpl (editor config), .cursor/skills/initialise/harness/rust/fw_harness.rs.tpl (editor config), .cursor/skills/initialise/harness/rust/fw_providers.rs.tpl (editor config), .cursor/skills/initialise/harness/rust/fw_tracker.rs.tpl (editor config), .cursor/skills/initialise/harness/swift/FwHarness.swift.tpl (editor config), .cursor/skills/initialise/harness/swift/FwProviders.swift.tpl (editor config), .cursor/skills/initialise/harness/swift/FwTracker.swift.tpl (editor config), .cursor/skills/initialise/harness/ts-server/fw-harness.ts.tpl (editor config), .cursor/skills/initialise/harness/ts-server/fw-providers.ts.tpl (editor config), .cursor/skills/initialise/harness/ts-server/fw-tracker.ts.tpl (editor config), .cursor/skills/initialise/harness/web/fw-harness.ts.tpl (editor config), .cursor/skills/initialise/harness/web/fw-providers.ts.tpl (editor config), .cursor/skills/initialise/harness/web/fw-tracker.ts.tpl (editor config), .cursor/skills/migrate-harness/SKILL.md (editor config), .cursor/skills/safe-rollout/SKILL.md (editor config), .fireweave/PROVIDERS.md (docs), .fireweave/agent-instructions.md (docs), .github/workflows/deploy.yml (workflow), CLAUDE.md (docs), bun.lock (lockfile), docker/compose.dev.yml (compose), docker/compose.prod.yml (compose), fireweave.md (docs), scripts/deploy-prod.sh (script).
   - `apps/web/src/main.tsx:4` `import { initFwHarness } from "./fireweave/fw-harness";`
   - `apps/web/src/fireweave/fw-harness.ts:46` `} from './fw-providers';`
   - `apps/web/src/Lobby.tsx:6` `import { emitClientAction } from "./observability/openobserve";`
   - `apps/api/src/interfaces/http/router.ts:80` `if (path === "/api/client-telemetry" && req.method === "POST") {`
4. Long window: undo is slow: the flag is none and time to revert is full build and deploy (assumed); detection is slow (assumed): domain: no business-level check (no value metric, no test of the changed domain files); infra: deploy health check; security: no auth-error alert.
   - `.github/workflows/deploy.yml:15` `timeout-minutes: 5`
   - `docker/compose.prod.yml:49` `healthcheck:`
   - `scripts/deploy-prod.sh:74` `if curl -fsS --max-time 1 "http://127.0.0.1/api/health" >/dev/null 2>&1; then`
5. Probability: measured confidence is low, so the mode moves one step toward caution (already Human, no further step).
   - no line to cite: this reason rests on something missing from the input or the repo

## Confidence

**low**
- no test that existed before the change covers any of the 16 changed code files (measured)
- single-author repo: familiarity dropped (W appendix)
- Secrets present at base: observed (measured), .env.example:11 (credential): present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence
- Failure mode (LLM second opinion): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- History: history unavailable (assumed), lowers confidence, does not raise risk (W 2)
- Confidence: diff vs task (LLM): unavailable (assumed), lowers confidence, does not raise risk (W 2)
- gate 1: red advisory check FireWeave — flag contract (FAILURE), not required on the repo, lowers confidence one notch
- disagreement lowers confidence: metrics added to the catalog but not emitted by the changed code: arcade_web_events, arcade_web_lobby_views_total (W 2)

## The one unknown

No single assumed input changes the mode. Considered: Reach (high); Detection apparatus (slow); Time to revert (full build and deploy); Failure mode (LLM second opinion) (cannot move the mode); History (cannot move the mode); Confidence: diff vs task (LLM) (cannot move the mode). With all of them at their favourable value the mode is Human, and no single known input changes it either.

## Disagreements

- Disagreement: metrics added to the catalog but not emitted by the changed code: arcade_web_events, arcade_web_lobby_views_total

## Gates

| Gate | Result | Route | Checks |
|---|---|---|---|
| 1. Table stakes | trip | human | secrets: pass (measured); PII: pass (measured); hardcoded environment values: trip (measured); required CI checks: pass (measured); advisory CI checks: pass (declared) |
| 2. API contract | pass | none | breaking change to route, schema or public signature: pass (measured); additive API surface: pass (measured) |
| 3. Destructive schema or data change | pass | none | destructive schema change or mutation of existing data: pass (measured) |

Gate 1, hardcoded environment values:
- `apps/api/src/fireweave/fw-providers.ts:93` `return [new URL(apiUrl).hostname, 'localhost', '127.0.0.1'];`
- `apps/api/src/fireweave/fw-providers.ts:95` `return ['localhost', '127.0.0.1'];`
- `apps/web/src/fireweave/fw-providers.ts:131` `const apiUrl = (current ?? legacy ?? 'https://app-server.fireweave.ai')`
- `apps/web/src/fireweave/fw-providers.ts:155` `return [new URL(apiUrl).hostname, 'localhost', '127.0.0.1'];`
- and 6 more

Gate 2, additive API surface:
- `.cursor/skills/initialise/harness/ts-server/fw-harness.ts.tpl:49` `export async function initFwHarness(): Promise<void> {`
- `.cursor/skills/initialise/harness/ts-server/fw-harness.ts.tpl:58` `export const fw = {`
- `.cursor/skills/initialise/harness/ts-server/fw-providers.ts.tpl:156` `export function isProd(`
- `.cursor/skills/initialise/harness/ts-server/fw-providers.ts.tpl:172` `export async function makeConnectedVendorProvider(): Promise<FireweaveClient> {`
- and 41 more

## Provenance

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible or irreversible | reversible | measured | none. no persisted write, outbound side effect, queue publish or external API client in 8595 added lines |
| Feature flag | none | measured | none. no flag call (getBooleanValue) or control point anchor in the changed files |
| Path | live | declared | `apps/api/src/bootstrap.ts:1`, `apps/api/src/main.ts:2`, `apps/api/src/main.ts:1`, `apps/api/src/fireweave/fw-harness.ts:46` +9. apps/api/src/application/auth.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/fireweave/fw-harness.ts reaches apps/api/src/main.ts in 1 import(s); apps/api/src/fireweave/fw-providers.ts reaches apps/api/src/main.ts in 2 import(s); apps/api/src/infrastructure/observability/metrics-catalog.ts reaches apps/api/src/main.ts in 3 import(s); apps/api/src/interfaces/http/router.ts reaches apps/api/src/main.ts in 1 import(s); apps/api/src/main.ts reaches apps/api/src/main.ts; apps/web/src/Lobby.tsx reaches apps/web/src/main.tsx in 2 import(s); apps/web/src/auth.tsx reaches apps/web/src/main.tsx in 2 import(s); apps/web/src/fireweave/fw-harness.ts reaches apps/web/src/main.tsx in 1 import(s); apps/web/src/fireweave/fw-providers.ts reaches apps/web/src/main.tsx in 2 import(s); apps/web/src/main.tsx reaches apps/web/src/main.tsx; apps/web/src/observability/openobserve.ts reaches apps/web/src/main.tsx in 3 import(s); not imported from any entry point: .env.example, .fireweave/.gitignore, .fireweave/hooks/rollout-build-gate.mjs, .fireweave/hooks/rollout-build-gate.sh, .fireweave/project.json, .gitignore, apps/api/package.json, apps/api/src/fireweave/fw-tracker.ts, apps/web/package.json, apps/web/src/fireweave/fw-tracker.ts, apps/web/vite.config.ts, docker/Dockerfile. Import graph and routes measured; entry points declared by package.json scripts and index.html: apps/api/src/main.ts, apps/web/src/main.tsx. Not code paths, listed only: .claude/hooks/rollout-build-gate-stop.sh (editor config), .claude/hooks/rollout-intent-gate.sh (editor config), .claude/settings.json (editor config), .cursor/hooks.json (editor config), .cursor/hooks/fireweave-rollout-session.sh (editor config), .cursor/hooks/fireweave-rollout-stop.sh (editor config), .cursor/rules/fireweave-rollout-ready.mdc (editor config), .cursor/skills/adopt/SKILL.md (editor config), .cursor/skills/ci-register-control-points/SKILL.md (editor config), .cursor/skills/ci-rollout-readiness/SKILL.md (editor config), .cursor/skills/cleanup/SKILL.md (editor config), .cursor/skills/feedback/SKILL.md (editor config), .cursor/skills/feedback/references/taxonomy.md (editor config), .cursor/skills/initialise/SKILL.md (editor config), .cursor/skills/initialise/harness/go/fw_harness.go.tpl (editor config), .cursor/skills/initialise/harness/go/fw_providers.go.tpl (editor config), .cursor/skills/initialise/harness/go/fw_tracker.go.tpl (editor config), .cursor/skills/initialise/harness/java/FwHarness.java.tpl (editor config), .cursor/skills/initialise/harness/java/FwProviders.java.tpl (editor config), .cursor/skills/initialise/harness/java/FwTracker.java.tpl (editor config), .cursor/skills/initialise/harness/python/fw_harness.py.tpl (editor config), .cursor/skills/initialise/harness/python/fw_providers.py.tpl (editor config), .cursor/skills/initialise/harness/python/fw_tracker.py.tpl (editor config), .cursor/skills/initialise/harness/rust/fw_harness.rs.tpl (editor config), .cursor/skills/initialise/harness/rust/fw_providers.rs.tpl (editor config), .cursor/skills/initialise/harness/rust/fw_tracker.rs.tpl (editor config), .cursor/skills/initialise/harness/swift/FwHarness.swift.tpl (editor config), .cursor/skills/initialise/harness/swift/FwProviders.swift.tpl (editor config), .cursor/skills/initialise/harness/swift/FwTracker.swift.tpl (editor config), .cursor/skills/initialise/harness/ts-server/fw-harness.ts.tpl (editor config), .cursor/skills/initialise/harness/ts-server/fw-providers.ts.tpl (editor config), .cursor/skills/initialise/harness/ts-server/fw-tracker.ts.tpl (editor config), .cursor/skills/initialise/harness/web/fw-harness.ts.tpl (editor config), .cursor/skills/initialise/harness/web/fw-providers.ts.tpl (editor config), .cursor/skills/initialise/harness/web/fw-tracker.ts.tpl (editor config), .cursor/skills/migrate-harness/SKILL.md (editor config), .cursor/skills/safe-rollout/SKILL.md (editor config), .fireweave/PROVIDERS.md (docs), .fireweave/agent-instructions.md (docs), .github/workflows/deploy.yml (workflow), CLAUDE.md (docs), bun.lock (lockfile), docker/compose.dev.yml (compose), docker/compose.prod.yml (compose), fireweave.md (docs), scripts/deploy-prod.sh (script) |
| Reach | high | assumed | `apps/web/src/Lobby.tsx:71`, `apps/web/src/observability/openobserve.ts:23`, `apps/web/src/auth.tsx:106`, `apps/web/src/auth.tsx:68` +3. measured: calls reach POST /api/client-telemetry (emitAction). Worth unknown because the metrics catalog declares no tier for any of its 17 entries, so reach is assumed wide. Not code paths, listed only: .claude/hooks/rollout-build-gate-stop.sh (editor config), .claude/hooks/rollout-intent-gate.sh (editor config), .claude/settings.json (editor config), .cursor/hooks.json (editor config), .cursor/hooks/fireweave-rollout-session.sh (editor config), .cursor/hooks/fireweave-rollout-stop.sh (editor config), .cursor/rules/fireweave-rollout-ready.mdc (editor config), .cursor/skills/adopt/SKILL.md (editor config), .cursor/skills/ci-register-control-points/SKILL.md (editor config), .cursor/skills/ci-rollout-readiness/SKILL.md (editor config), .cursor/skills/cleanup/SKILL.md (editor config), .cursor/skills/feedback/SKILL.md (editor config), .cursor/skills/feedback/references/taxonomy.md (editor config), .cursor/skills/initialise/SKILL.md (editor config), .cursor/skills/initialise/harness/go/fw_harness.go.tpl (editor config), .cursor/skills/initialise/harness/go/fw_providers.go.tpl (editor config), .cursor/skills/initialise/harness/go/fw_tracker.go.tpl (editor config), .cursor/skills/initialise/harness/java/FwHarness.java.tpl (editor config), .cursor/skills/initialise/harness/java/FwProviders.java.tpl (editor config), .cursor/skills/initialise/harness/java/FwTracker.java.tpl (editor config), .cursor/skills/initialise/harness/python/fw_harness.py.tpl (editor config), .cursor/skills/initialise/harness/python/fw_providers.py.tpl (editor config), .cursor/skills/initialise/harness/python/fw_tracker.py.tpl (editor config), .cursor/skills/initialise/harness/rust/fw_harness.rs.tpl (editor config), .cursor/skills/initialise/harness/rust/fw_providers.rs.tpl (editor config), .cursor/skills/initialise/harness/rust/fw_tracker.rs.tpl (editor config), .cursor/skills/initialise/harness/swift/FwHarness.swift.tpl (editor config), .cursor/skills/initialise/harness/swift/FwProviders.swift.tpl (editor config), .cursor/skills/initialise/harness/swift/FwTracker.swift.tpl (editor config), .cursor/skills/initialise/harness/ts-server/fw-harness.ts.tpl (editor config), .cursor/skills/initialise/harness/ts-server/fw-providers.ts.tpl (editor config), .cursor/skills/initialise/harness/ts-server/fw-tracker.ts.tpl (editor config), .cursor/skills/initialise/harness/web/fw-harness.ts.tpl (editor config), .cursor/skills/initialise/harness/web/fw-providers.ts.tpl (editor config), .cursor/skills/initialise/harness/web/fw-tracker.ts.tpl (editor config), .cursor/skills/migrate-harness/SKILL.md (editor config), .cursor/skills/safe-rollout/SKILL.md (editor config), .fireweave/PROVIDERS.md (docs), .fireweave/agent-instructions.md (docs), .github/workflows/deploy.yml (workflow), CLAUDE.md (docs), bun.lock (lockfile), docker/compose.dev.yml (compose), docker/compose.prod.yml (compose), fireweave.md (docs), scripts/deploy-prod.sh (script) |
| Failure mode | domain, infra, security | measured | `.claude/hooks/rollout-build-gate-stop.sh:1`, `.claude/hooks/rollout-intent-gate.sh:1`, `.claude/settings.json:1`, `.cursor/hooks.json:1` +66. rules on touched paths: .claude/hooks/rollout-build-gate-stop.sh -> none; .claude/hooks/rollout-intent-gate.sh -> none; .claude/settings.json -> none; .cursor/hooks.json -> none; .cursor/hooks/fireweave-rollout-session.sh -> none; .cursor/hooks/fireweave-rollout-stop.sh -> none; .cursor/rules/fireweave-rollout-ready.mdc -> none; .cursor/skills/adopt/SKILL.md -> none; .cursor/skills/ci-register-control-points/SKILL.md -> none; .cursor/skills/ci-rollout-readiness/SKILL.md -> none; .cursor/skills/cleanup/SKILL.md -> none; .cursor/skills/feedback/SKILL.md -> none; .cursor/skills/feedback/references/taxonomy.md -> none; .cursor/skills/initialise/SKILL.md -> none; .cursor/skills/initialise/harness/go/fw_harness.go.tpl -> none; .cursor/skills/initialise/harness/go/fw_providers.go.tpl -> none; .cursor/skills/initialise/harness/go/fw_tracker.go.tpl -> none; .cursor/skills/initialise/harness/java/FwHarness.java.tpl -> none; .cursor/skills/initialise/harness/java/FwProviders.java.tpl -> none; .cursor/skills/initialise/harness/java/FwTracker.java.tpl -> none; .cursor/skills/initialise/harness/python/fw_harness.py.tpl -> none; .cursor/skills/initialise/harness/python/fw_providers.py.tpl -> none; .cursor/skills/initialise/harness/python/fw_tracker.py.tpl -> none; .cursor/skills/initialise/harness/rust/fw_harness.rs.tpl -> none; .cursor/skills/initialise/harness/rust/fw_providers.rs.tpl -> none; .cursor/skills/initialise/harness/rust/fw_tracker.rs.tpl -> none; .cursor/skills/initialise/harness/swift/FwHarness.swift.tpl -> none; .cursor/skills/initialise/harness/swift/FwProviders.swift.tpl -> none; .cursor/skills/initialise/harness/swift/FwTracker.swift.tpl -> none; .cursor/skills/initialise/harness/ts-server/fw-harness.ts.tpl -> none; .cursor/skills/initialise/harness/ts-server/fw-providers.ts.tpl -> none; .cursor/skills/initialise/harness/ts-server/fw-tracker.ts.tpl -> none; .cursor/skills/initialise/harness/web/fw-harness.ts.tpl -> none; .cursor/skills/initialise/harness/web/fw-providers.ts.tpl -> none; .cursor/skills/initialise/harness/web/fw-tracker.ts.tpl -> none; .cursor/skills/migrate-harness/SKILL.md -> none; .cursor/skills/safe-rollout/SKILL.md -> none; .env.example -> domain; .fireweave/.gitignore -> domain; .fireweave/PROVIDERS.md -> none; .fireweave/agent-instructions.md -> none; .fireweave/hooks/rollout-build-gate.mjs -> domain; .fireweave/hooks/rollout-build-gate.sh -> domain; .fireweave/project.json -> domain; .github/workflows/deploy.yml -> infra; .gitignore -> domain; CLAUDE.md -> none; apps/api/package.json -> infra; apps/api/src/application/auth.ts -> security; apps/api/src/fireweave/fw-harness.ts -> domain; apps/api/src/fireweave/fw-providers.ts -> domain; apps/api/src/fireweave/fw-tracker.ts -> domain; apps/api/src/infrastructure/observability/metrics-catalog.ts -> infra; apps/api/src/interfaces/http/router.ts -> domain; apps/api/src/main.ts -> domain; apps/web/package.json -> infra; apps/web/src/Lobby.tsx -> domain; apps/web/src/auth.tsx -> security; apps/web/src/fireweave/fw-harness.ts -> domain; apps/web/src/fireweave/fw-providers.ts -> domain; apps/web/src/fireweave/fw-tracker.ts -> domain; apps/web/src/main.tsx -> domain; apps/web/src/observability/openobserve.ts -> infra; apps/web/vite.config.ts -> domain; bun.lock -> infra; docker/Dockerfile -> infra; docker/compose.dev.yml -> infra; docker/compose.prod.yml -> infra; fireweave.md -> none; scripts/deploy-prod.sh -> infra. Matched on file path; each evidence line is the file's first change |
| Failure mode (LLM second opinion) | unavailable | assumed | none. no ANTHROPIC_API_KEY; rules only |
| Detection apparatus | slow | assumed | `docker/compose.prod.yml:49`, `scripts/deploy-prod.sh:74`. domain: no business-level check (no value metric, no test of the changed domain files); infra: deploy health check; security: no auth-error alert. Every failure mode needs its detector, so detection is slow. 11 metric/log calls on changed lines (console.warn: log, emitAction: count, emitClientAction: count). Checked in the repo only; alert config outside the repo (OpenObserve) is not an input |
| Time to revert | full build and deploy | assumed | `.github/workflows/deploy.yml:15`. no one-click rollback in 1 workflow file(s); CI run history is not an input, so pipeline duration is not measured. Declared job timeout: 5 min (a bound, not a measurement). Unknown rounds to slow: a full build and deploy to revert (W 2) |
| History | history unavailable | assumed | `commit 206fa14`, `commit cdb77fe`, `commit bd5cf7c`, `commit 0fb48b9`. measured: 16 earlier commits touch the changed files, 0 reverts, 4 fix commits; repo history before base spans 3h (2026-10-06 to 2026-10-06). Too thin to read as a record (thin: < 5 commits or < 7 days) |
| Provenance | agent-assisted (Cursor) | measured | `commit 974d34c`. commit trailers: Cursor <cursoragent@cursor.com>; PR description: "Made with Cursor"; author(s) in git: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>. Whether a human was in the loop is not verifiable from the input |
| Confidence: test coverage | 0 of 16 changed code files have a test | measured | none. tests that import a changed file; 0 covered by tests that existed before the change. Uncovered: .fireweave/hooks/rollout-build-gate.mjs, apps/api/src/application/auth.ts, apps/api/src/fireweave/fw-harness.ts, apps/api/src/fireweave/fw-providers.ts, apps/api/src/fireweave/fw-tracker.ts, apps/api/src/infrastructure/observability/metrics-catalog.ts, apps/api/src/interfaces/http/router.ts, apps/api/src/main.ts, apps/web/src/Lobby.tsx, apps/web/src/auth.tsx, apps/web/src/fireweave/fw-harness.ts, apps/web/src/fireweave/fw-providers.ts, apps/web/src/fireweave/fw-tracker.ts, apps/web/src/main.tsx, apps/web/src/observability/openobserve.ts, apps/web/vite.config.ts |
| Confidence: familiarity | single-author repo, people part dropped | measured | none. repo authors before base: Kalyan Chowdary <kalyanchowdary@Kalyans-MacBook-Pro.local>; per file: .claude/hooks/rollout-build-gate-stop.sh (0), .claude/hooks/rollout-intent-gate.sh (0), .claude/settings.json (0), .cursor/hooks.json (0), .cursor/hooks/fireweave-rollout-session.sh (0), .cursor/hooks/fireweave-rollout-stop.sh (0), .cursor/rules/fireweave-rollout-ready.mdc (0), .cursor/skills/adopt/SKILL.md (0), .cursor/skills/ci-register-control-points/SKILL.md (0), .cursor/skills/ci-rollout-readiness/SKILL.md (0), .cursor/skills/cleanup/SKILL.md (0), .cursor/skills/feedback/SKILL.md (0), .cursor/skills/feedback/references/taxonomy.md (0), .cursor/skills/initialise/SKILL.md (0), .cursor/skills/initialise/harness/go/fw_harness.go.tpl (0), .cursor/skills/initialise/harness/go/fw_providers.go.tpl (0), .cursor/skills/initialise/harness/go/fw_tracker.go.tpl (0), .cursor/skills/initialise/harness/java/FwHarness.java.tpl (0), .cursor/skills/initialise/harness/java/FwProviders.java.tpl (0), .cursor/skills/initialise/harness/java/FwTracker.java.tpl (0), .cursor/skills/initialise/harness/python/fw_harness.py.tpl (0), .cursor/skills/initialise/harness/python/fw_providers.py.tpl (0), .cursor/skills/initialise/harness/python/fw_tracker.py.tpl (0), .cursor/skills/initialise/harness/rust/fw_harness.rs.tpl (0), .cursor/skills/initialise/harness/rust/fw_providers.rs.tpl (0), .cursor/skills/initialise/harness/rust/fw_tracker.rs.tpl (0), .cursor/skills/initialise/harness/swift/FwHarness.swift.tpl (0), .cursor/skills/initialise/harness/swift/FwProviders.swift.tpl (0), .cursor/skills/initialise/harness/swift/FwTracker.swift.tpl (0), .cursor/skills/initialise/harness/ts-server/fw-harness.ts.tpl (0), .cursor/skills/initialise/harness/ts-server/fw-providers.ts.tpl (0), .cursor/skills/initialise/harness/ts-server/fw-tracker.ts.tpl (0), .cursor/skills/initialise/harness/web/fw-harness.ts.tpl (0), .cursor/skills/initialise/harness/web/fw-providers.ts.tpl (0), .cursor/skills/initialise/harness/web/fw-tracker.ts.tpl (0), .cursor/skills/migrate-harness/SKILL.md (0), .cursor/skills/safe-rollout/SKILL.md (0), .env.example (1), .fireweave/.gitignore (0), .fireweave/PROVIDERS.md (0), .fireweave/agent-instructions.md (0), .fireweave/hooks/rollout-build-gate.mjs (0), .fireweave/hooks/rollout-build-gate.sh (0), .fireweave/project.json (0), .github/workflows/deploy.yml (1), .gitignore (1), CLAUDE.md (0), apps/api/package.json (1), apps/api/src/application/auth.ts (1), apps/api/src/fireweave/fw-harness.ts (0), apps/api/src/fireweave/fw-providers.ts (0), apps/api/src/fireweave/fw-tracker.ts (0), apps/api/src/infrastructure/observability/metrics-catalog.ts (1), apps/api/src/interfaces/http/router.ts (1), apps/api/src/main.ts (1), apps/web/package.json (1), apps/web/src/Lobby.tsx (1), apps/web/src/auth.tsx (1), apps/web/src/fireweave/fw-harness.ts (0), apps/web/src/fireweave/fw-providers.ts (0), apps/web/src/fireweave/fw-tracker.ts (0), apps/web/src/main.tsx (1), apps/web/src/observability/openobserve.ts (0), apps/web/vite.config.ts (1), bun.lock (1), docker/Dockerfile (1), docker/compose.dev.yml (1), docker/compose.prod.yml (1), fireweave.md (0), scripts/deploy-prod.sh (1). Reviewer familiarity needs review data: the PR export lists 0 reviews |
| Confidence: review depth | 0 reviews | declared | none. the PR export lists 0 reviews |
| Confidence: diff vs task (LLM) | unavailable | assumed | none. no ANTHROPIC_API_KEY |
| Secrets present at base | observed | measured | `.env.example:11`. .env.example:11 (credential): present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence |

## Changed files

- `.claude/hooks/rollout-build-gate-stop.sh` (added, +32 -0)
- `.claude/hooks/rollout-intent-gate.sh` (added, +20 -0)
- `.claude/settings.json` (added, +34 -0)
- `.cursor/hooks.json` (added, +11 -0)
- `.cursor/hooks/fireweave-rollout-session.sh` (added, +18 -0)
- `.cursor/hooks/fireweave-rollout-stop.sh` (added, +19 -0)
- `.cursor/rules/fireweave-rollout-ready.mdc` (added, +20 -0)
- `.cursor/skills/adopt/SKILL.md` (added, +409 -0)
- `.cursor/skills/ci-register-control-points/SKILL.md` (added, +80 -0)
- `.cursor/skills/ci-rollout-readiness/SKILL.md` (added, +88 -0)
- `.cursor/skills/cleanup/SKILL.md` (added, +65 -0)
- `.cursor/skills/feedback/SKILL.md` (added, +86 -0)
- `.cursor/skills/feedback/references/taxonomy.md` (added, +21 -0)
- `.cursor/skills/initialise/SKILL.md` (added, +1936 -0)
- `.cursor/skills/initialise/harness/go/fw_harness.go.tpl` (added, +54 -0)
- `.cursor/skills/initialise/harness/go/fw_providers.go.tpl` (added, +212 -0)
- `.cursor/skills/initialise/harness/go/fw_tracker.go.tpl` (added, +14 -0)
- `.cursor/skills/initialise/harness/java/FwHarness.java.tpl` (added, +73 -0)
- `.cursor/skills/initialise/harness/java/FwProviders.java.tpl` (added, +250 -0)
- `.cursor/skills/initialise/harness/java/FwTracker.java.tpl` (added, +21 -0)
- `.cursor/skills/initialise/harness/python/fw_harness.py.tpl` (added, +77 -0)
- `.cursor/skills/initialise/harness/python/fw_providers.py.tpl` (added, +233 -0)
- `.cursor/skills/initialise/harness/python/fw_tracker.py.tpl` (added, +11 -0)
- `.cursor/skills/initialise/harness/rust/fw_harness.rs.tpl` (added, +59 -0)
- `.cursor/skills/initialise/harness/rust/fw_providers.rs.tpl` (added, +201 -0)
- `.cursor/skills/initialise/harness/rust/fw_tracker.rs.tpl` (added, +12 -0)
- `.cursor/skills/initialise/harness/swift/FwHarness.swift.tpl` (added, +69 -0)
- `.cursor/skills/initialise/harness/swift/FwProviders.swift.tpl` (added, +259 -0)
- `.cursor/skills/initialise/harness/swift/FwTracker.swift.tpl` (added, +10 -0)
- `.cursor/skills/initialise/harness/ts-server/fw-harness.ts.tpl` (added, +62 -0)
- `.cursor/skills/initialise/harness/ts-server/fw-providers.ts.tpl` (added, +335 -0)
- `.cursor/skills/initialise/harness/ts-server/fw-tracker.ts.tpl` (added, +19 -0)
- `.cursor/skills/initialise/harness/web/fw-harness.ts.tpl` (added, +62 -0)
- `.cursor/skills/initialise/harness/web/fw-providers.ts.tpl` (added, +316 -0)
- `.cursor/skills/initialise/harness/web/fw-tracker.ts.tpl` (added, +19 -0)
- `.cursor/skills/migrate-harness/SKILL.md` (added, +786 -0)
- `.cursor/skills/safe-rollout/SKILL.md` (added, +137 -0)
- `.env.example` (modified, +7 -0)
- `.fireweave/.gitignore` (added, +5 -0)
- `.fireweave/PROVIDERS.md` (added, +11 -0)
- `.fireweave/agent-instructions.md` (added, +170 -0)
- `.fireweave/hooks/rollout-build-gate.mjs` (added, +966 -0)
- `.fireweave/hooks/rollout-build-gate.sh` (added, +34 -0)
- `.fireweave/project.json` (added, +77 -0)
- `.github/workflows/deploy.yml` (modified, +5 -1)
- `.gitignore` (modified, +3 -0)
- `CLAUDE.md` (added, +39 -0)
- `apps/api/package.json` (modified, +3 -2)
- `apps/api/src/application/auth.ts` (modified, +8 -0)
- `apps/api/src/fireweave/fw-harness.ts` (added, +62 -0)
- `apps/api/src/fireweave/fw-providers.ts` (added, +334 -0)
- `apps/api/src/fireweave/fw-tracker.ts` (added, +19 -0)
- `apps/api/src/infrastructure/observability/metrics-catalog.ts` (modified, +14 -0)
- `apps/api/src/interfaces/http/router.ts` (modified, +42 -0)
- `apps/api/src/main.ts` (modified, +3 -0)
- `apps/web/package.json` (modified, +1 -0)
- `apps/web/src/Lobby.tsx` (modified, +11 -1)
- `apps/web/src/auth.tsx` (modified, +51 -2)
- `apps/web/src/fireweave/fw-harness.ts` (added, +62 -0)
- `apps/web/src/fireweave/fw-providers.ts` (added, +323 -0)
- `apps/web/src/fireweave/fw-tracker.ts` (added, +19 -0)
- `apps/web/src/main.tsx` (modified, +3 -0)
- `apps/web/src/observability/openobserve.ts` (added, +44 -0)
- `apps/web/vite.config.ts` (modified, +33 -20)
- `bun.lock` (modified, +6 -0)
- `docker/Dockerfile` (modified, +4 -0)
- `docker/compose.dev.yml` (modified, +2 -0)
- `docker/compose.prod.yml` (modified, +4 -0)
- `fireweave.md` (added, +96 -0)
- `scripts/deploy-prod.sh` (modified, +4 -0)
