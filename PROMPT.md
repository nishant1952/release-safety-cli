Build a prototype of the release-safety model in writeup.md and run it on one real PR.

## What this is
writeup.md is a submitted answer to a take-home. It defines a model: three gates, then
signals in three buckets (damage, reversibility as an exposure window, probability), a 2x2
grid that picks a mode (Auto, Staged, Human), a release plan preset per mode, a one-direction
probability shift, and a rule for missing and wrong data (section 2). The output is a brief,
not a score. Read the whole file before writing code. Every behaviour of the tool must trace
to a sentence in writeup.md. Where the write-up is silent, choose the simplest option and
note it in DECISIONS.md. Do not invent signals that are not in the write-up.

## Input
The PR to run against is fireweave-HQ-Demo/arcade PR 13. The repo is cloned with full
history at /Users/nishant/fireweave-study/arcade. Commit range is in data/pr13/REFS.txt
(base 30ac194, head c5da112a). The diff is in data/pr13/pr13.diff and the PR title, body and
author are in data/pr13/pr.json. Those two files and the repo are the only inputs about this
PR. Do not fetch anything about it from the network. The repo is a TypeScript Bun monorepo:
apps/api, apps/web, packages.

## Stack
TypeScript, run with Bun. ts-morph for AST work. git via Bun.spawn. Anthropic TypeScript SDK
for the optional LLM calls. No other dependencies unless you justify them in DECISIONS.md.
Code lives in ./src, one command runs it:
  bun install && bun run brief <repo-path> <base>..<head> [--ignore-declared] [--out file]

## How to work
One unit at a time: a single component or a single signal. For each unit:
1. Build it. Run it against PR 13. Check its output by hand against the diff and the repo.
2. Write a small test that pins the real PR 13 output. Run `bun test`.
3. Spawn the `reviewer` subagent (defined in .claude/agents/reviewer.md; use that agent
   type, do not substitute a general agent). Hand it: the unit's purpose, the section of
   writeup.md it implements, the files you added or changed, the test, and the unit's
   printed output for PR 13. Give it the code, not your conclusions about the code.
4. On BLOCK: fix every blocking item, rerun the test, spawn the reviewer again. At most
   two rounds. If still blocked, stop and report to me with both verdicts.
5. On PASS: print the full current brief so the whole chain runs, then start the next unit.
Never build two units between reviews. Never skip the reviewer because a unit looks small.
At the end, spawn the reviewer once more over the whole out/pr13-brief.md with the same
checks, and include its verdict in your final report.

## Components, in build order
1. diff loader: repo path + base..head -> changed files, added lines with file:line,
   files bucketed by directory.
2. gates: table stakes (secret/PII regex on added lines; CI status is a declared input,
   absent means unverifiable -> route to human), API contract (route/schema/public signature
   changes: additive passes, breaking trips), destructive data (migrations, raw UPDATE/DELETE,
   ORM bulk writes). Each returns pass / trip / unverifiable with evidence lines.
3. signal extractors, one per signal in the write-up's top five plus flag and detection.
   Every extractor returns {value, source: measured|declared|assumed, evidence: [file:line]}.
   Text rules first, ts-morph only where structure is needed (marked *).
   - reversible/irreversible: outbound side effects, writes, queue publishes, external clients
   - feature flag*: control point calls (getBooleanValue, @fireweave-controlpoint anchor),
     default value, and which changed statements sit inside the flag's branch versus outside
   - path*: import graph from changed files up to route components or entry points
   - reach*: follow calls from changed code into apps/api handlers; read
     apps/api/src/infrastructure/observability/metrics-catalog.ts tiers as a declared input,
     else assumed high
   - failure mode: rules on touched dirs; LLM second opinion only if ANTHROPIC_API_KEY set
   - detection: metric/log calls on the changed path; alert config if present else assumed none
   - history: reverts and fix commits touching the same files; "history unavailable" if thin
   - confidence: tests covering changed files, authors per file from git, agent provenance
     from data/pr13/pr.json, coherence of diff vs task (LLM, optional)
4. missing-data policy as one small data file: assumed damage rounds up, assumed window
   rounds slow, assumed probability lowers confidence only. Section 2 verbatim.
5. decision engine: gates first, then grid, then probability shift (auto->staged,
   staged->human, never the other way). Batch rule is out of scope: one change.
6. plan presets: the Auto/Staged/Human table from section 3 as data, guardrails chosen by
   failure mode.
7. the one unknown: for each assumed signal, flip to its favourable value, rerun, report the
   first flip that changes the mode.
8. brief renderer: markdown with mode, plan, top reasons each with evidence lines,
   confidence, a provenance table (signal / value / measured|declared|assumed), the one
   unknown, and a "disagreements" line when two sources conflict.

## LLM use
Optional and bounded. With no API key the tool must still run and print a brief with the two
LLM signals marked unavailable. With a key, the model may only: classify failure mode, judge
diff-vs-task coherence, and write two-sentence prose for reasons that already have evidence
lines. It may lower confidence or move the mode one step toward caution. It may never loosen
a decision. Log code-vs-model disagreement as lowered confidence. The LLM is never on the
path that decides gates, grid placement or the plan.

## Deliverables
- README.md: what it is, how to run, what the brief contains. Short.
- out/pr13-brief.md, plus out/pr13-brief-no-catalog.md produced with --ignore-declared,
  to show the mode shifting and the one unknown changing.
- DECISIONS.md: every choice the write-up did not make for you, one line each.
- tests/ with one pinned test per component, all passing with `bun test`.
- No changes to writeup.md. If the code reveals a contradiction in the write-up, stop and
  tell me instead of working around it.

## Constraints
Time box four hours. Get components 1, 2, the reversibility extractor and the renderer
working end to end before adding the rest. Deterministic output: same input, same brief.
No network calls except the optional LLM. Do not commit; I will review and commit myself.
