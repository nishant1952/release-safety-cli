# Release safety: what to extract before deciding how to ship

Merging is not releasing. Once a change can merge dark behind a flag and be exposed gradually, the question stops being "is this code right?" and becomes: how much can go wrong, how likely is it to go wrong, and how fast can we catch and undo it?

Safety is never a guarantee. Each signal closes part of the gap that the others miss.


## 1. Signals that matter

**Weight scale:** how much each signal counts.

| Weight | Effect |
|---|---|
| Gate | Blocks the release or routes it to a human |
| Primary | Can change the release mode on its own |
| Secondary | Tunes how the mode runs: slice size, soak time, confidence |

### 1a. Gates: non-negotiable rules, a breach means early exit
Some failures are too costly to weigh. They are not scored. They block the release or route it to a human.

1. **Table stakes:** no secrets, PII or hardcoded values in the diff, and all required CI checks are green.
2. **API contract:** an additive-only change passes. A breaking change is raised to a human.
3. **Destructive schema or data change:** additive changes pass. Destructive schema changes and changes that mutate existing data trip to human.

*Caveat: some cases need a bypass. The author must mark it explicitly on the PR, so the sign-off stays on the record.*

### 1b. Damage
How much it costs if the change misbehaves. One of the two axes that pick the release mode.

1. **Path** (primary): who actually reaches this code.
2. **Reach** (primary): which systems break, and what they are worth.
3. **Traffic** (secondary): does the current version of the code have live traffic, and how has it behaved?

### 1c. Reversibility: detect and undo
How fast we see it break plus how fast we get back: the exposure window. The other axis, and it caps how automated the release can be. A fast undo with slow detection is still a long window.

1. **Reversible or irreversible** (primary): can the change be undone by a revert, or does it leave external side effects that a redeploy cannot undo?
2. **Feature flag** (primary): the change can be turned off without a redeploy.
3. **Detection apparatus** (primary): metrics, infra monitoring, alerts and version-tagged logs that tell us when something has gone wrong, and what.
4. **Rollout mechanism** (secondary): canary, percentage rollout, blue-green.
5. **Time to fix** (secondary): the historical turnaround time for similar issues.
6. **Time to revert** (secondary): the time to push, build and release a new change, or to roll back.
7. **Ownership and recovery** (secondary): if the change fails, is there a named owner, and can they be reached?
8. **Timing of release** (secondary): day and time, proximity to peak or near-zero traffic, and concurrent deployments.

### 1d. Probability
How likely this change is to misbehave. These are properties of the change itself.

1. **Failure mode** (primary): how the change can fail: infra, security or domain.
2. **Confidence** (primary): review depth, the author's and reviewer's familiarity with the touched files, test coverage of the diff, and coherence between the task, the PR description and the code.
3. **Type of change** (secondary): bug fix, feature, refactor, dependency bump, revert, and so on.
4. **Runtime assumption** (secondary): the resources the change needs (environment, configs) will support it at runtime.
5. **Provenance** (secondary): was the change written by an agent or a human, and was a human in the loop?
6. **History** (secondary): past issues: incidents, reverts and churn.
7. **Knowledge silos** (secondary): context that lives only with a small group of people and cannot be inferred from the code.

**Agent-written changes:** author familiarity means nothing here. The agent has no history, may have written its own tests, and reports success confidently. Confidence then leans on reviewer familiarity, tests that existed before the change, and whether the diff matches the task.

How each signal is extracted, and when it can be ignored, is in the appendix.

*Note: if I could extract only five things after the gates, in order:*
1. *Reversible or irreversible*
2. *Path*
3. *Reach*
4. *Failure mode*
5. *Detection apparatus*

*The first three place the change on the grid. Failure mode and detection decide how long the window really is.*


## 2. What we do when we cannot know

The diff is always present, so signals derived from it are never missing. Git history usually is, but not always: a recently migrated or squashed repo has none. Everything else (traces, metrics, incident tracker, flag service, on-call schedule) may be missing, and missing data fails asymmetrically:

- **Gates (1a):** if a condition cannot be verified, route to a human, do not block.
- **Damage (1b):** missing data rounds up. Assume the path is live, the reach is wide and the data is touched.
- **Reversibility (1c):** missing data rounds to slow. Assume no flag, no alert on the changed path, an all-at-once rollout and a full build and deploy to revert, never 'instant'.
- **Probability (1d):** missing data lowers confidence. It does not raise risk on its own. Missing history is reported as 'history unavailable', never 'zero incidents'.

Wrong is different from missing. Declared inputs (CODEOWNERS, service catalog, release config) are checked for staleness against recent commits. Measured beats declared: traces over the catalog. Two measured signals that disagree lower confidence, and the brief says so. Each signal is marked measured, declared or assumed, so the human knows what to distrust.

Every decision states how confident it is, and names the one unknown that, if answered, would most likely change it.

## 3. How it all comes together

A release usually carries several changes. The batch takes the highest damage and the longest window among its members. If that lands it in Human, the first recommendation is to split the batch. The rest of this section assumes one change.

A change can go to production fully automatically only if it is harmless. Harmless is not decided by one or two signals, for example, diff size: a one-line change to the payments system is critical, while a one-line log addition (usually) is not. Damage, reversibility and probability decide it together:

| | Short window: detect and undo fast | Long window: slow to detect, slow to undo, or irreversible |
|---|---|---|
| **Low damage** | Auto | Staged |
| **High damage** | Staged | Human |

The output is not the label. It is a release plan: how exposure grows, how long each step soaks, which guardrails watch it, what aborts it, and who is paged. The three modes are presets of that plan.

| | Auto | Staged | Human |
|---|---|---|---|
| Exposure | 100% in one step | Small slice, soak, widen | Proposed by the system, approved or edited by the owner |
| Soak per step | Minutes | Hours, scaled to traffic | Proposed by the system, approved or edited by the owner |
| Guardrails | Deploy health check and error rate | Follow the failure mode: resources and latency for infra, business checks for domain, auth errors for security | Same as staged, plus whatever the owner adds |
| Abort | Any error spike, undo | Guardrail breach: back one step or to 0%. Thin data: hold | Owner decides |
| Paged | Nobody | Service on-call on abort | Named owner before step one |
| Sign-off | None | None | Required before step one |

The undo step in the plan is whatever the reversibility signals found. Behind a flag, undo is a flip and a slice is a flag percentage. Without one, undo is a rollback or redeploy and a slice is a canary or percentage deploy, which is why such changes sit in the slow column. When a change lands in Staged or Human only because it has no flag, the cheapest way left is to add one, and the brief says so.

The human decides only what the system cannot verify: irreversible actions, sign-offs and timing. They get the proposed plan and a short brief, not a score: the mode, the top reasons, the confidence, and the one missing fact that would most change the call. They approve or edit the plan; they do not design it.

Probability adjusts the release mode: auto moves to staged, staged moves to human. It never moves the other way, and that asymmetry is deliberate. A high-damage, low-reversibility change warrants due diligence even when the chance of failure is low.

Take these three changes:

| Change | Failure mode | Damage | Reversibility | Probability adjustment | Release mode |
|---|---|---|---|---|---|
| 1. Adding logs for more visibility | Infra | Low | Fast (revert or flag) | None, unless the log sits in a hot path or touches PII | Auto |
| 2. Bug fix so the end user sees a corrected value in the UI | Domain | Low to medium | Fast undo if behind a flag, but error rate cannot see a wrong value | Moves to staged if no test covers the changed value | Staged, with a check on the corrected value |
| 3. Hotfix with a DB cleanup after a failed release | Domain and data | High | Not reversible: the cleanup mutates existing data | None needed. Gate 3 already routed it to human before the grid | Human |

## 4. Where this approach can go wrong

1. **Gaming the checks:** not every input can be known, so some gates rely on a human attestation, and people or agents can game it by marking the change good to go. The metric stops being a measure and becomes a target.
   - **example:** an API contract change trips gate 2. The developer marks 'consumers informed' without informing anyone, and the change breaks a consumer-facing product.
   - **why my approach fails here:** when a gate's condition cannot be verified mechanically, the attestation becomes the condition. The system records a pass it cannot check.
   - **how I'd notice:** require evidence with each sign-off, and check sign-offs against what happened.

2. **Blind spots:** static analysis is the core input, and the only deterministic one with high availability, but it doesn't capture runtime behaviour and interactions. Race conditions, config mismatches and external side effects cannot be seen from the code alone. The approach handles known unknowns by rounding them up. It fails when it doesn't know what it doesn't know.
   - **example:** a diff adds a Show instance to a data type and a log line that uses it. It compiles and type-checks, and a new log line looks harmless, so it goes auto. The instance recurses and never terminates, and the first request that reaches the log line hangs the server.
   - **why my approach fails here:** static analysis sees a low-damage log addition. It cannot see that the new instance never terminates. A detector miss leaves no record, unlike a gamed attestation.
   - **how I'd notice:** treat every incident in an auto-mode change as a detector miss, and turn its pattern into a new detector.

3. **Late detection:** any miss in review, especially in domain logic, needs attention. If the business requirement is not met, the change causes issues the system cannot detect.
   - **example:** a discount calculation change ships behind a flag. It is reversible fast and low damage, so it goes auto or staged. The canary watches error rate and latency, which stay flat because wrong values don't throw. The issue is only flagged later.
   - **why my approach fails here:** alerts existed on the path, so detection scored fast. They were blind to a domain failure. 'Reversible' was true but useless.
   - **how I'd notice:** track time to detect alongside time to revert, and require a business-level check for domain failure modes.

## Appendix: signal reference

*A note on ignoring: ignoring a signal is rarely the right option, because every ignored signal leaves at least one way the change can fail. The 'when to ignore' cases below are where a signal may not change the release decision, but it should still be computed and recorded. A dash means the signal always applies.*

### Gates (1a)

| Gate | Why it matters | Detector |
|---|---|---|
| 1. Table stakes: secrets, PII and hardcoded values, plus build, tests and lint | A leaked secret is irreversible. PII is a compliance event | Secret and PII scan of the diff, seeds, test data and log statements. Hardcoded environment values. CI checks on the merge commit |
| 2. API contract | Unversioned or uncoordinated changes break consumers | Diff touches an API schema, route, event schema or public signature |
| 3. Destructive schema or data change | Data changes survive a revert | Diff touches migrations, models, SQL or write paths |

### Damage (1b)

| Rank | Signal | Weight | Why | How to extract | When to ignore |
|---|---|---|---|---|---|
| 1 | Path | Primary | Most deterministic view of what actually runs | Call graph, plus a search for shared route, topic and table names. Traces for runtime callers | – |
| 2 | Reach | Primary | Same blast radius, different worth: an internal tool versus payments | Org-wide search for shared topics, tables, cache keys and routes. Infra config, service catalog or README, external reachability | A new module nothing imports yet |
| 3 | Traffic | Secondary | Gives the baseline and expected behaviour | Per-route request rate from metrics, traces and access logs. 90-day trend | CI config changes |

### Reversibility (1c)

| Rank | Signal | Weight | Why | How to extract | When to ignore |
|---|---|---|---|---|---|
| 1 | Reversible or irreversible | Primary | Decides human versus auto more than any other signal | Diff: persisted writes (the gate 3 detector), outbound side effects (payment, email, SMS, webhook, push), queue publishes, external API clients | – |
| 2 | Feature flag | Primary | Moves the reversibility axis: revert in seconds, canary as a flag percentage | Flag calls or config in the diff, flag exists in production, both states tested, kill path works | – |
| 3 | Detection apparatus | Primary | Whether the changed path emits anything an alert watches, not whether dashboards exist | Alert and dashboard config, SLO definitions, metric and infra baselines | Auto mode needs only the deploy health check |
| 4 | Rollout mechanism | Secondary | Detection on 1% of traffic instead of 100% | Deploy config in the repo, deploy system | Flag-wrapped changes with no edits outside the flag |
| 5 | Time to fix | Secondary | Realistic exposure window once something is noticed | Per-service MTTR from the incident tracker, else fix or revert commit to the commit it undoes | – |
| 6 | Time to revert | Secondary | Floor of the exposure window | CI pipeline duration history, one-click rollback | – |
| 7 | Ownership and recovery | Secondary | A reachable owner gives the fastest turnaround | Git history per file and CODEOWNERS (always present), on-call schedule for reachability | A linter config bump in auto mode |
| 8 | Timing of release | Secondary | The window can move to suit the change | Past-traffic seasonality, concurrent deploy queue, freeze calendar, on-call schedule | Auto mode |

### Probability (1d)

| Rank | Signal | Weight | Why | How to extract | When to ignore |
|---|---|---|---|---|---|
| 1 | Failure mode | Primary | Picks which detector must watch: CPU alerts cannot see a domain failure | The diff, an LLM read as a second opinion only | Docs- or test-only changes |
| 2 | Confidence | Primary | Unfamiliar authors, thin review and untested changes carry higher odds of going wrong | Diff coverage from CI, review depth from the PR, familiarity from git history, LLM check of the diff against the task and the PR description | Single-author repos (drop the people part) |
| 3 | Type of change | Secondary | How a change breaks depends on its type | Diff shape, PR labels, commit messages, LLM only as a fallback | – |
| 4 | Runtime assumption | Secondary | Missing or wrong values cause failures | Config reads in the diff, checked against each environment | A UI copy change |
| 5 | Provenance | Secondary | Confidence assumes a human author | Commit and PR metadata | – |
| 6 | History | Secondary | Shows where real issues happened before | RCA store (pattern match), incident tracker, reverts and follow-up fixes in git history | Generated files and lockfiles |
| 7 | Knowledge silos | Secondary | Context that cannot be inferred from the code | Single-author files in git history. Modules with no README, ADR or tests | A CSS tweak in one component |
