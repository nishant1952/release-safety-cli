# release-safety-cli

A prototype of the release-safety model in [writeup.md](writeup.md). Given a repo and a commit range, it runs the three gates, extracts the write-up's signals from the diff and the repo, places the change on the damage × window grid, applies the one-way probability shift, and writes a brief: the mode, a proposed release plan, the reasons with evidence lines, the confidence, and the one unknown that would most change the call. It writes a brief, not a score.

## Run

```sh
bun install && bun run brief <repo-path> <base>..<head> [--full] [--out file] [--pr pr.json] [--llm-log file] [--overrides json]
```

- The brief has two layouts, both rendered from the same brief data. The **short** layout is the default: the mode, the plan, the top reasons with one cited line each, what would move the mode, one table of signals, the gates and the changed files, in under half the words of the full layout. `--full` writes the **full** layout: every section with full evidence lists and full paths. `--out` writes either one.
- The short layout never hides anything unfavourable. A gate that does not pass shows its full table and evidence lines. Disagreements, refused model proposals, secrets present at base and owner overrides appear in full when there are any, and are left out when there are none.
- `--overrides '<json>'` applies the release owner's values and switches before the decision: `{"signals": {"Reach": "low"}, "revertMinutes": 5, "advisoryAsRequired": true, "stylesheetsCovered": true, "model": false, "confidence": "high"}`, every field optional. An owner value replaces the signal and is tagged `declared by owner`. When it replaces a measured or declared value (not an assumed one), the brief marks it ⚠, and a measured one is also listed as a disagreement. `confidence` replaces the measured confidence level. See DECISIONS.md, Demo Unit 2 and Round 6.
- `--pr` points at a `gh pr view --json` export; by default it is found by matching the range against `data/*/REFS.txt`. `data/` is gitignored and not shipped; without an export the brief says no PR export was found and gate 1's CI check is unverifiable.

## Export a PR

```sh
bun run export <owner/repo> <pr-number> <repo-path>           # writes data/pr<N>/pr.json, REFS.txt, required-checks.json
bun run export <owner/repo> <pr-number> --required-only       # adds required-checks.json to an existing export
```

It needs an authenticated `gh`.
- `pr.json` is `gh pr view --json author,body,reviews,state,statusCheckRollup,title,url,baseRefName,baseRefOid,headRefOid`.
- `REFS.txt` holds the range and the local repo path.
- `required-checks.json` holds `{ "checks": [...], "source": "..." }`: the check names the base branch requires, read from `GET repos/{owner}/{repo}/branches/{base}/protection` (`required_status_checks`) and `GET repos/{owner}/{repo}/rules/branches/{base}` (rules of type `required_status_checks`). The protection endpoint needs admin rights, so when it is refused the script reads the branch summary `GET repos/{owner}/{repo}/branches/{base}`, which any reader can see. `source` records what each endpoint answered. The file is written only when at least one endpoint answered.

Gate 1 reads CI as follows:
- A required check that is not green blocks.
- A required check that is pending, or absent from the rollup, routes to a human.
- With no required checks configured, CI cannot block; red advisory checks are listed and each lowers confidence one notch.
- Without `required-checks.json`, every rollup check is treated as required and tagged assumed.
## The model (optional)

With `ANTHROPIC_API_KEY` in the environment or `.env` (Bun loads it), two optional LLM uses run on the Anthropic API (model `claude-sonnet-5-5`, server-side refusal fallback). Without a key nothing is sent: every assumed signal stays assumed, the two model reads show as unavailable, and no wording is added.

- The **model contract** is one structured call.
  - For each assumed signal with a scale in `src/policy.json`, the model answers "no change" or proposes a value one step away, citing the `file:line` it rests on. The model never sees measured or declared signals, gate results or the mode.
  - Code accepts a proposal only when all of these hold. Accepted values are tagged `model (cited)`.
    - The signal is assumed and the value is within one step on its scale.
    - The cited line exists.
    - The line is in the signal's **citation domain**:
      - Reach: a code line on the measured path, or a route or handler definition.
      - Time to revert: a workflow, compose file, deploy or rollback script or config.
      - Path: an entry point, a route line, or an import on the measured graph.
      - Failure mode: a changed code line.
    - The line is not the evidence of a measured conclusion that the proposal contradicts. For example, the flag read behind "flag partial" cannot show low reach or one-click undo.
  - A refused proposal is listed under Disagreements with the rule that refused it. It does not lower confidence.
  - A top reason that rests on a filled signal opens with the model's citation, its sentence and the old value, then the lines the old value rested on.
  - The same call answers the failure-mode second opinion and the diff-vs-task coherence check, which can only lower confidence or tighten the mode.
  - A coherence item that says the change adds, removes or includes credentials is kept only if the diff supports it. Otherwise it is listed as "model claim not supported by the diff".
- **Reason wording** adds two sentences for reasons that already have evidence lines.
- **Nothing secret leaves the process.**
  - Gate 1's secret and PII scanners run over the whole payload of every call: diff lines of every kind, PR title and body, commit messages, quoted lines. Each value found is replaced with `[REDACTED:<kind>]`.
  - Files named `.env*`, `secrets.*` or `credentials.*` are never sent.
  - A secret on an added line trips gate 1, and then no call is made at all.
  - A secret already in the repo (a context or removed line) is listed under Confidence as "Secrets present at base". It is not a gate trip.
- Every LLM call is appended as one JSON line to `logs/llm-calls.jsonl` (gitignored; `--llm-log` or `LLM_LOG` to change).
  - Each line records purpose, model, endpoint and request id; the system and user prompt as sent (after redaction) with the kinds redacted; the schema; the response text and stop reason; tokens; latency, outcome and error; and an estimated cost at Anthropic list prices.
  - A one-line summary goes to stderr after the run. The brief itself is unchanged.

The PR 13 brief:

```sh
bun run brief /Users/nishant/fireweave-study/arcade 30ac194..c5da112a --pr tests/fixtures/pr13.json --out out/pr13.md
bun run brief /Users/nishant/fireweave-study/arcade 30ac194..c5da112a --pr tests/fixtures/pr13.json --full --out out/pr13-full.md
bun run test        # tsc --noEmit, then bun test
```

`out/prN.md` is each PR's short brief without a key, and `out/prN-full.md` the full one. `out/prN-with-ai.md` (PRs 1, 10 and 13) are full-layout briefs from a run with the model, kept as they were.

## What the brief contains

The full layout (`--full`), section by section:

1. **Mode** (Auto, Staged, Human or Block) and how it was reached: gate routes, grid cell, probability shift.
2. **Plan**: the section 3 preset for that mode, filled with what the signals found (slice, guardrails per failure mode, undo, owner), each value tagged with its source.
3. **Top reasons**, each with `file:line` evidence quoted from the repo at the head commit.
4. **Confidence**, with every reason it was lowered.
5. **The one unknown**: the first assumed input that, flipped to its favourable value, changes the mode, or a statement that none does and what holds the call.
6. **Disagreements** between sources (catalog vs code, PR description vs commit trailers, code vs LLM), including refused model proposals and unsupported model claims.
7. **Gates** and a **provenance table**: every signal's value and whether it is measured, declared or assumed.

The short layout keeps the mode, the plan, the reasons, the confidence and what would move the call. It drops the full evidence lists, the list of unknowns considered, the per-rule explanations and the owner's email (see DECISIONS.md, Round 5).

Every rule traces to a sentence in the write-up; choices the write-up did not make are in [DECISIONS.md](DECISIONS.md). Code is in `src/` (`signals/` holds one extractor per signal), tests in `tests/`.

## The demo page (apps/demo)

A web page over the 21 arcade PRs: pick a PR, click Next, and the server runs its brief. Then answer what the run could not find out and re-run to see what moved.

```sh
bun run demo:bake     # once: bare clone and the 21 exports (already committed in apps/demo/fixtures); checks every PR measures
bun run demo          # builds the page and serves it with the API on http://localhost:3000 (PORT to change)
docker build -f apps/demo/Dockerfile -t release-brief-demo . && docker run -p 3000:3000 release-brief-demo
```

- **Stored inputs only.** `apps/demo/fixtures` holds the bare clone and the PR exports, and nothing computed from them. Nothing is fetched or cloned at runtime and no GitHub token is used. Only the model is called, and only when a viewer ticks "Use the LLM" and gives the right password.
- **Next.** The server measures the PR (diff, gates, flag, path, reach, detection, confidence, revert and history) in a worker and streams each stage to the page. It then decides the brief. A PR takes about 0.4 to 5 seconds on its first run.
- **Owner panel.** It asks only for what that PR's run could not find:
  - the signals that came out assumed, such as Reach, Detection, Time to revert (with a measured pipeline time in minutes) or History;
  - the CI switch, when the PR has red checks the base branch does not require;
  - the stylesheet switch, when stylesheet lines are outside the flag;
  - under "Measured from the repo", with a caution, the measured and declared values the grid reads (reversibility, flag, path, reach, detection, time to revert) and the measured confidence. A value set there replaces the measurement, and the verdict and brief mark it ⚠.

  Re-run reuses the measurement kept in server memory and only redoes the decision, in well under a second. With the model on, the page shows a progress line per call.
- **How the mode was reached.** Under the grid cell, the verdict shows each step from the cell to the mode, coloured by mode, with what took it: low confidence, the model's task check, or a gate (Staged → low confidence → Human). A step that rests on an owner value over a measured or declared one carries ⚠. The grid marks the same path: the chosen cell filled, each later mode's cell outlined with its reason, joined by arrows; Block, which has no cell, gets a box under the grid.
- **Look.** Each section is a card with its own accent: the run in blue, the verdict tinted in its mode's colour, the brief in ink. Decision values are coloured by what they mean for the release (green good, amber in between, red bad: fast or slow, high or low confidence, low or high reach), in the panel, the verdict and the brief's Signals table. The owner panel keeps Re-run pinned at its top, then groups your answers (amber), the switches (blue), "Measured from the repo" (light red, collapsed until opened, and open when a measured value is already replaced) and the model. Notes and ⚠ explain themselves on hover or keyboard focus at once.
- **Brief layout.** The brief shows the short layout by default. The toggle beside its heading switches to the full one (the CLI's `--full`) and stays set across PRs and runs. Both come from the same run.
- **One run kept.** Each PR keeps only its latest run; a re-run replaces it.
- **The model is behind a password.** The server holds the key (`ANTHROPIC_API_KEY`) and the password (`DEMO_MODEL_PASSWORD`), both from its environment or `.env`. The page has a "Use the LLM" checkbox and, once ticked, a password field. The password is sent only with a run that has the model on; the server compares it (in constant time), answers 401 if it is wrong and 503 if no key or password is set, and never sends the key or the password back.
- **Nothing a viewer enters is kept.** The password is held in the page's memory only. The server writes no call log, and every line it quotes from the repo goes through the CLI's secret redaction.
