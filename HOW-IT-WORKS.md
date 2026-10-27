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
code. Absent is allowed and is treated as unknown, not as empty.

## Stage 2: gates

`gates.ts` runs three checks. Each returns pass, trip or unverifiable plus the lines that
caused it.

- **Table stakes.** Regex lists over added lines: private key headers, AWS and GitHub token
  shapes, JWTs, `password = "..."`, emails, SSNs, card numbers, http URLs, IP addresses. CI
  status comes from the PR export if present, otherwise unverifiable.
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

The only model involvement, when `ANTHROPIC_API_KEY` is set, is three bounded calls in
`llm.ts`: classify failure mode, judge diff against task, and reword a reason that already has
evidence. Each returns JSON against a schema, is tagged assumed, and can only lower confidence
or add one step toward caution. Without a key those three signals say "unavailable" and the
rest of the brief is unchanged.

## Tests

One file per unit under `tests/`, each pinning real PR 13 output: specific line numbers,
specific values. `brief.test.ts` compares the full rendered brief to the committed
`out/pr13.md` byte for byte, so any rule change shows up as a golden-file diff you have
to consciously accept.
