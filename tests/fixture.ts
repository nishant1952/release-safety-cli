// PR 13 inputs shared by the pinned tests. The optional LLM reads are off in tests, so pinned
// briefs never depend on a developer's credentials or the network.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.AWS_BEARER_TOKEN_BEDROCK;
export const REPO = "/Users/nishant/fireweave-study/arcade";
export const RANGE = "30ac194..c5da112a";
// Copies of the PR 13 export and diff, kept as test fixtures (data/ is not part of the repo).
export const PR_JSON = new URL("./fixtures/pr13.json", import.meta.url).pathname;
export const PR_DIFF = new URL("./fixtures/pr13.diff", import.meta.url).pathname;
