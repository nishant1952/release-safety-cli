# release-safety-cli

A prototype of the release-safety model in [writeup.md](writeup.md). Given a repo and a commit range, it runs the three gates, extracts the write-up's signals from the diff and the repo, places the change on the damage × window grid, applies the one-way probability shift, and writes a brief: the mode, a proposed release plan, the reasons with evidence lines, the confidence, and the one unknown that would most change the call. It writes a brief, not a score.

## Run

```sh
bun install && bun run brief <repo-path> <base>..<head> [--out file] [--pr pr.json] [--llm-log file]
```

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
- With `ANTHROPIC_API_KEY` in the environment or `.env` (Bun loads it), two optional LLM uses run on the Anthropic API (model `claude-sonnet-5-5`, server-side refusal fallback).
  - The **model contract** is one structured call.
    - For each assumed signal with a scale in `src/policy.json`, the model answers "no change" or proposes a value one step away, citing the `file:line` it rests on.
    - Code accepts a proposal only when the cited line exists and the step is within one. An accepted value is tagged `model (cited)`; a refused one is listed under Disagreements.
    - The model never sees measured or declared signals, gate results or the mode.
    - The same call answers the failure-mode second opinion and the diff-vs-task coherence check; those can only lower confidence or tighten the mode.
  - **Reason wording** adds two sentences for reasons that already have evidence lines.
  - Without a key, every assumed signal stays assumed, the two reads show as unavailable, and no wording is added. The diff is sent only in that case, and never when gate 1 finds a secret.
  - Every LLM call is appended as one JSON line to `logs/llm-calls.jsonl` (gitignored; `--llm-log` or `LLM_LOG` to change): purpose, model, endpoint, request id, the full system and user prompt (it contains the diff), the schema, the response text and stop reason, input/output/thinking/cache tokens, latency, outcome and error, and an estimated cost at Anthropic list prices. A one-line summary goes to stderr after the run; the brief itself is unchanged.

The PR 13 brief:

```sh
bun run brief /Users/nishant/fireweave-study/arcade 30ac194..c5da112a --out out/pr13-brief.md
bun test
```

## What the brief contains

1. **Mode** (Auto, Staged, Human or Block) and how it was reached: gate routes, grid cell, probability shift.
2. **Plan**: the section 3 preset for that mode, filled with what the signals found (slice, guardrails per failure mode, undo, owner), each value tagged with its source.
3. **Top reasons**, each with `file:line` evidence quoted from the repo at the head commit.
4. **Confidence**, with every reason it was lowered.
5. **The one unknown**: the first assumed input that, flipped to its favourable value, changes the mode, or a statement that none does and what holds the call.
6. **Disagreements** between sources (catalog vs code, PR description vs commit trailers, code vs LLM).
7. **Gates** and a **provenance table**: every signal's value and whether it is measured, declared or assumed.

Every rule traces to a sentence in the write-up; choices the write-up did not make are in [DECISIONS.md](DECISIONS.md). Code is in `src/` (`signals/` holds one extractor per signal), tests in `tests/`.
