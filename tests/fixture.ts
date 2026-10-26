// PR 13 inputs shared by the pinned tests. The optional LLM reads are off in tests, so pinned
// briefs never depend on a developer's ANTHROPIC_API_KEY or the network.
delete process.env.ANTHROPIC_API_KEY;
export const REPO = "/Users/nishant/fireweave-study/arcade";
export const RANGE = "30ac194..c5da112a";
export const PR_JSON = new URL("../data/pr13/pr.json", import.meta.url).pathname;
export const PR_DIFF = new URL("../data/pr13/pr13.diff", import.meta.url).pathname;
