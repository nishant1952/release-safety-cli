# release-safety-cli

A prototype of the release-safety model in [writeup.md](writeup.md). Given a repo and a commit range, it runs the three gates, extracts the write-up's signals from the diff and the repo, places the change on the damage × window grid, applies the one-way probability shift, and writes a brief: the mode, a proposed release plan, the reasons with evidence lines, the confidence, and the one unknown that would most change the call. It writes a brief, not a score.

## Run

```sh
bun install && bun run brief <repo-path> <base>..<head> [--out file] [--pr pr.json] [--llm-log file] [--overrides json]
```

- `--overrides '<json>'` applies the release owner's values and switches before the decision: `{"signals": {"Reach": "low"}, "revertMinutes": 5, "advisoryAsRequired": true, "stylesheetsCovered": true, "model": false}`, every field optional. An owner value replaces an assumed or declared signal, tagged `declared by owner`; for a measured signal it is listed as a disagreement and the measured value stands. See DECISIONS.md, Demo Unit 2.
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
bun run brief /Users/nishant/fireweave-study/arcade 30ac194..c5da112a --out out/pr13.md
bun run test        # tsc --noEmit, then bun test
```

## What the brief contains

1. **Mode** (Auto, Staged, Human or Block) and how it was reached: gate routes, grid cell, probability shift.
2. **Plan**: the section 3 preset for that mode, filled with what the signals found (slice, guardrails per failure mode, undo, owner), each value tagged with its source.
3. **Top reasons**, each with `file:line` evidence quoted from the repo at the head commit.
4. **Confidence**, with every reason it was lowered.
5. **The one unknown**: the first assumed input that, flipped to its favourable value, changes the mode, or a statement that none does and what holds the call.
6. **Disagreements** between sources (catalog vs code, PR description vs commit trailers, code vs LLM), including refused model proposals and unsupported model claims.
7. **Gates** and a **provenance table**: every signal's value and whether it is measured, declared or assumed.

Every rule traces to a sentence in the write-up; choices the write-up did not make are in [DECISIONS.md](DECISIONS.md). Code is in `src/` (`signals/` holds one extractor per signal), tests in `tests/`.

## The demo page (apps/demo)

A web page over the 21 arcade PRs: pick a PR, click Next, and the server runs its brief. Then answer what the run could not find out and re-run to see what moved.

```sh
bun run demo:bake     # once: bare clone and the 21 exports (already committed in apps/demo/fixtures); checks every PR measures
bun run demo          # builds the page and serves it with the API on http://localhost:3000 (PORT to change)
docker build -f apps/demo/Dockerfile -t release-brief-demo . && docker run -p 3000:3000 release-brief-demo
```

- **Stored inputs only.** `apps/demo/fixtures` holds the bare clone and the PR exports, and nothing computed from them. Nothing is fetched or cloned at runtime and no GitHub token is used. Only the model is called, and only with a key typed into the page.
- **Next.** The server measures the PR (diff, gates, flag, path, reach, detection, confidence, revert and history) in a worker and streams each stage to the page. It then decides the brief. A PR takes about 0.4 to 5 seconds on its first run.
- **Owner panel.** It asks only for what that PR's run could not find:
  - the signals that came out assumed, such as Reach, Detection, Time to revert (with a measured pipeline time in minutes) or History;
  - the CI switch, when the PR has red checks the base branch does not require;
  - the stylesheet switch, when stylesheet lines are outside the flag.

  Re-run reuses the measurement kept in server memory and only redoes the decision, in well under a second. With a model key, the page shows a progress line per call.
- **What moved.** After a re-run, the page compares mode, grid cell, gates, reasons and provenance rows with the run before it. Only the latest run and the one before it are kept.
- **Nothing a viewer enters is kept.** The key is held in the page's memory and sent only with a run that has the model on. The server writes no call log, and every line it quotes from the repo goes through the CLI's secret redaction.
