# How this repo works

A walk through one run of the release-safety brief: inputs, gates, signals, the decision, and
how the prose is produced without a model.

## One run, end to end

```
bun run brief <repo> <base>..<head>
        |
        v
 cli.ts -- parses args --> run.ts (the pipeline) --> render.ts (markdown) --> stdout or --out
```

Everything in the pipeline reads the repo through one class, `src/git.ts`, which shells out to
`git show <sha>:<path>`, `git ls-tree` and `git log`. It never touches the working tree, so two
runs on the same range see the same bytes. That is where determinism comes from.

## Stage 1: inputs

**`diff.ts`** runs `git diff --unified=0` over the range and parses it into a list of changed
files, each with its added and removed lines, every line carrying file, line number and text.
Everything downstream consumes this structure. Nothing re-reads the diff.

**`pr.ts`** looks for a PR export. It scans `data/*/REFS.txt` for a base and head that match the
range and loads the `pr.json` beside it. That gives title, body, author, and optionally CI check
results and review count. It is tagged declared because a person or tool wrote it, not the
code. Absent is allowed and is treated as unknown, not as empty. Beside it, `required-checks.json`
names the checks the base branch requires (branch protection and repository rules). It is
written by `bun run export <owner/repo> <pr> <repo-path>` (`export.ts`, which calls `gh`).

## Stage 2: gates

`gates.ts` runs three checks. Each returns pass, trip or unverifiable plus the lines that
caused it.

- **Table stakes.** Regex lists over added lines: private key headers, AWS and GitHub token
  shapes, JWTs, credential assignments quoted or bare (`password = "..."`, `KEY_PASSWORD=...`),
  emails, SSNs, card numbers, http URLs, IP addresses. CI: a red required check blocks, a
  pending or absent one is unverifiable, a red check nothing requires only lowers confidence.
  The same secret and PII scanners also redact the model payload (see below).
- **API contract.** Finds `export` declarations and route strings on removed lines and checks
  whether the same name or route reappears on added lines with the same signature. Removed and
  not re-added is breaking. Files named schema, catalog, openapi or swagger are stricter: any
  removed line is breaking.
- **Destructive data.** Regexes for `DROP`, `TRUNCATE`, `ALTER TABLE ... DROP`, `DELETE FROM`,
  `UPDATE ... SET`, ORM bulk writes, and removed `CREATE TABLE` or `ADD COLUMN`.

## Stage 3: signals

One file per signal under `src/signals/`. Every extractor returns the same shape:
`{name, value, source, evidence[], note}`. Two kinds of extraction are used.

### Text rules

Over added lines or whole files read from git.

- **`reversible.ts`**: pattern lists for payment and email SDKs, queue publish calls, HTTP
  calls whose target is not a `/api/` literal. Any hit means irreversible.
- **`failureMode.ts`**: first-match rules on each changed file's path. Tests and docs, then
  auth and security directories, then infra directories, else domain.
- **`revert.ts`**: reads workflow YAML for a job or input named rollback, a `workflow_dispatch`
  input that takes a ref, and `timeout-minutes` values.
- **`history.ts`**: `git log` on the changed paths before base, counting commits whose subject
  starts with Revert or Fix. Fewer than five commits or under seven days is "thin" and reported
  as unavailable.
- **`confidence.ts`**: test files that import a changed file by relative path, whether those
  tests existed at base, authors per file from `git log`, `Co-authored-by` trailers naming an
  agent.
- **`detection.ts`**: calls to functions imported from observability modules, classified by
  metric name into error rate, latency, value or count. Plus health check lines in files the
  deploy workflow executes, and alert config files that name an emitted metric.

### AST rules

These use ts-morph, which parses TypeScript into a syntax tree. `ast.ts` loads files from git
into an in-memory project.

- **`flag.ts`**: finds `getBooleanValue(key, default)` calls, follows every reference to the
  resulting variable, and records the line ranges it controls: the branches of an `if` or
  ternary, the right side of `&&`, everything after an `if (!flag) return`, and the body of a
  component the flag is passed to as a prop. Every added line is then classed inside, outside
  or control.
- **`path.ts`**: builds an import graph across the monorepo, finds entry points from
  `package.json` scripts and `index.html`, and runs a breadth-first search from each changed
  file upward to an entry point. Inside TSX files it also follows JSX usage from the changed
  component up to a `<Route>`.
- **`reach.ts`**: from each call on an added line, follows the definition through up to four
  hops until it finds a `/api/...` string literal, then finds the handler in `apps/api`
  matching that path and lists the services it calls.

## Stage 4: policy, decision, plan, unknown

**`policy.ts`** reads `policy.json`, which quotes section 2 of the write-up. Any signal tagged
assumed is overwritten with its rounded value: damage up, window slow. Assumed probability
signals and disagreements each lower confidence one step. The measured-only confidence level
is kept separately, because only measured facts may move the mode.

**`decide.ts`** is the grid. Gates first. Damage is high when path is live and reach is high.
Window is short when reversible, undo fast and detection fast. The grid cell gives a mode.
Measured low confidence moves it one step stricter. A gate route overrides with whichever is
stricter. It also computes what the mode would be with a full flag, to produce the "cheapest
way left" advice.

**`plan.ts`** picks the preset row from `plans.json`, the section 3 table verbatim, and fills
the cells from signals: guardrails from the detectors found per failure mode, undo from flag
and time-to-revert, owner from the most frequent git author.

**`unknown.ts`** re-runs `decide` with each assumed input flipped to its favourable value, in
top-five order, and reports the first flip that changes the mode. If none does, it flips all at
once, and then flips each measured input on top to name what actually holds the call.

## How sentences exist without AI

Every sentence in the brief is a template with facts slotted in. The extractor that computes a
value also writes its note. For example, in `detection.ts`:

```ts
`${r.mode}: no business-level check (no value metric, no test of the changed domain files)`
```

`decide.ts` composes reasons the same way, concatenating clauses depending on which condition
failed. `render.ts` then lays these strings into headed sections and tables, and for each
evidence reference like `apps/web/src/App.tsx:466` it calls `git show` on that file and quotes
the line. So the brief reads as prose because someone wrote the prose once, with holes, and
the holes are filled from measurements. The honesty test in `tests/brief.test.ts` checks that
no template describes the contents of something the run never read.

## The model, when there is a key

With `ANTHROPIC_API_KEY` set there are two kinds of call, both through `askJson` in `llm.ts`,
both returning JSON against a schema. Without a key the brief is the one described above.

**Redaction first.** `askJson` runs gate 1's secret and PII scanners (`sensitiveSpans` in
`gates.ts`) over the system and user prompt and replaces each value with `[REDACTED:<kind>]`
before anything is sent. The contract prompt also leaves out every file named `.env*`,
`secrets.*` or `credentials.*`. A secret on an added line trips gate 1, and then no call is
made. A secret already in the repo, on a context or removed line, is listed under Confidence
as "Secrets present at base".

**The model contract** (`model.ts`) is one call. The model sees the diff with line numbers, the
PR text and the assumed signals that have a scale. For each one it may propose a value one
step away, citing a line. `judge` accepts a proposal only when:
- the line exists;
- the line sits in the signal's citation domain (for Reach, a code line on the measured path
  or a route or handler definition; for Time to revert, a release file; for Path, an entry
  point, route or import on the graph);
- the line is not the evidence of a measured conclusion the proposal contradicts (`RULES_OUT`:
  a flag that does not cover the whole change cannot argue reach or undo).

An accepted value is tagged `model (cited)`. A refusal is listed with its rule and does not
lower confidence. `decide.ts` puts the model's citation, its sentence and the replaced value at
the top of the reason that rests on it. The same call answers the failure-mode second opinion
and the coherence check. Each coherence item that claims the change adds, removes or includes
credentials is checked against the diff, and is dropped if the diff does not support it.
Confidence is computed before any fill, so a model answer never raises it.

**Reason wording** (`prose.ts`) adds two sentences beside a reason that already has evidence
lines. It never changes the reason.

## Tests

One file per unit under `tests/`, each pinning real PR 13 output: specific line numbers,
specific values. `bun run test` typechecks (`tsc --noEmit`) and then runs them. Model tests
inject a canned answer through `buildBrief`, and `payload.test.ts` checks the bytes sent to a
local stand-in for the API. `brief.test.ts` compares the full rendered brief to the committed
`out/pr13.md` byte for byte, so any rule change shows up as a golden-file diff you have
to consciously accept.
