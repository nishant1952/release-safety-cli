# release-safety-cli

A prototype of the release-safety model in [writeup.md](writeup.md). Given a repo and a commit range, it runs the three gates, extracts the write-up's signals from the diff and the repo, places the change on the damage × window grid, applies the one-way probability shift, and writes a brief: the mode, a proposed release plan, the reasons with evidence lines, the confidence, and the one unknown that would most change the call. It writes a brief, not a score.

## Run

```sh
bun install && bun run brief <repo-path> <base>..<head> [--out file] [--pr pr.json]
```

- `--pr` points at a `gh pr view --json` export; by default it is found by matching the range against `data/*/REFS.txt`. `data/` ships empty, so without `--pr` the brief says no PR export was found and gate 1's CI check is unverifiable.
- With `ANTHROPIC_API_KEY` set, three optional LLM uses run: a failure-mode second opinion, a diff-vs-task coherence check, and two-sentence wording for reasons that already have evidence lines. They can only lower confidence or tighten the mode, never loosen it. Without a key the two reads show as unavailable and no wording is added. The diff is sent to the Anthropic API only in that case, and never when gate 1 finds a secret.

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
