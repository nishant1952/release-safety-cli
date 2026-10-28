# Release brief: Correlate every action across logs, metrics, and traces

Range `504f75e..48a2a83`, 13 files, +1299 −128. Gate 2 trips. Sources disagree on 1 point, listed below.

**Mode: Human.** High damage × long window = Human; gates route to Human. Confidence low.

In one line: an unflagged, irreversible change on a live path (declared) with high reach (assumed), with nothing found that detects a domain or security failure, and gate 2 routes it to Human.

## Plan

Each row is proposed by the system; the owner approves or edits it.

| Step | Proposed |
|---|---|
| Exposure | Small slice, soak, widen; slice by canary or percentage deploy (rollout mechanism is not extracted, so all-at-once is assumed) |
| Soak per step | Hours, scaled to traffic (traffic is not an input, so the hours are not scaled) |
| Guardrails | Watch deploy health check. No business checks or auth errors found on the changed path. |
| Abort | Owner decides |
| Undo | No flag: revert and redeploy (full build and deploy, assumed). |
| Paged | Named owner before step one: Kalyan Chowdary, earlier author of the most touched files (git); the repo has no CODEOWNERS file |
| Sign-off | Required before step one |

## Why Human

1. **Gate 2 trips.** API contract, so it routes to a human: breaking change to route, schema or public signature.
   `apps/api/src/infrastructure/observability/metrics-catalog.ts@504f75e:21` `source: "openobserve.startRequest / finishRequest",`
2. **High damage.** Path live (declared), reach high (assumed: no declared tier applies).
   `apps/web/src/App.tsx:14` `import { AdminPage } from "./Admin";`
3. **Long window.** The change is irreversible; no flag, so undo is full build and deploy (assumed: no rollback, pipeline time unmeasured). Detection slow (assumed: alert config is not an input): no business-level check for domain; no auth-error alert for security.
   `.github/workflows/deploy.yml:15` `timeout-minutes: 5`
4. **Low confidence.** No test that existed before the change covers any of the 12 changed code files (measured). The mode is already Human, so it moves no further.
   No line to cite.

## What would move it

No assumed input changes the mode, alone or together. No single known input moves it either.

## Disagreements

- metrics added to the catalog but not emitted by the changed code: arcade_active_matches, arcade_admin_injects_total, arcade_auth_failures_total, arcade_bot_move_duration_ms, arcade_illegal_moves_total, arcade_lobby_views_total, arcade_match_duration_ms, arcade_openobserve_export_errors_total, arcade_scoreboard_views_total

## Signals

| Signal | Value | Source | Evidence |
|---|---|---|---|
| Reversible | irreversible | measured | `openobserve.ts:64` +1. HTTP call, target not resolved one hop in the diff: treated as irreversible because it may leave effects a redeploy cannot undo |
| Feature flag | none | measured | no flag call (getBooleanValue) or control point anchor in the changed files |
| Path | live | declared | `bootstrap.ts:4` +13. entry points declared by package.json scripts and index.html: main.ts, main.tsx |
| Reach | high | assumed | `Admin.tsx:396` +10. the metrics catalog declares no tier for any of its 16 entries, so reach is assumed wide |
| Failure mode | domain, infra, security | measured | `admin.ts:2` +12. Matched on file path |
| Detection | slow | assumed | `compose.prod.yml:45` +1. domain: no business-level check |
| Time to revert | full build and deploy | assumed | `deploy.yml:15`. no one-click rollback in 1 workflow file(s) |
| History | history unavailable | assumed | Too thin to read as a record |
| Provenance | agent-assisted (Cursor) | measured | `commit 48a2a83`. commit trailers: Cursor |
| Test coverage | 0 of 12 changed code files have a test | measured | 0 covered by tests that existed before the change |
| Reviews | 0 reviews | declared | familiarity: single-author repo, people part dropped (measured) |
| Model | off | — | no ANTHROPIC_API_KEY; failure mode and task check not run |

## Gates

| Gate | Result | Route | Checks |
|---|---|---|---|
| 1. Table stakes | pass | none | secrets: pass (measured); PII: pass (measured); hardcoded environment values: pass (measured); required CI checks: pass (measured) |
| 2. API contract | trip | human | breaking change to route, schema or public signature: trip (declared); internal signature changes: pass (declared); additive API surface: pass (measured) |
| 3. Destructive schema or data change | pass | none | destructive schema change or mutation of existing data: pass (measured) |

Gate 2, breaking change to route, schema or public signature:
- `apps/api/src/infrastructure/observability/metrics-catalog.ts@504f75e:21` `source: "openobserve.startRequest / finishRequest",`
- `apps/api/src/infrastructure/observability/metrics-catalog.ts@504f75e:33` `description: "Auth and product events (login, register, …)",`
- `apps/api/src/infrastructure/observability/metrics-catalog.ts@504f75e:34` `defaultLabels: { event: "admin_inject" },`

Gate 2, internal signature changes:
- `apps/api/src/infrastructure/observability/openobserve.ts@504f75e:245` `export async function track(event: {`

Gate 2, additive API surface:
- `apps/api/src/domain/ports.ts:6` `export type EmitActionInput = {`
- `apps/api/src/domain/ports.ts:42` `export type TraceCtx = {`
- `apps/api/src/infrastructure/observability/actions-catalog.ts:5` `export type ActionDef = {`
- `apps/api/src/infrastructure/observability/actions-catalog.ts:17` `export const ACTIONS_CATALOG: ActionDef[] = [`
- and 42 more

## Changed files

`admin.ts` +90 −12 · `auth.ts` +125 −15 · `games.ts` +138 −41 · `scoreboard.ts` +11 −5 · `ports.ts` +30 −1 · `actions-catalog.ts` (added) +260 · `adapter.ts` +5 −1 · `metrics-catalog.ts` +66 −3 · `openobserve.ts` +144 −32 · `router.ts` +42 −14 · `Admin.tsx` +169 −4 · `api.ts` +25 · `observability-strategy.md` (added) +194
