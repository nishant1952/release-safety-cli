import { expect, test } from "bun:test";
import { llmTarget } from "../src/llm";
import "./fixture";

test("no credential: no LLM", () => {
  expect(llmTarget({})).toBeNull();
});

test("a Bedrock bearer token selects Claude Sonnet 5.5 on Claude in Amazon Bedrock, in AWS_REGION", () => {
  expect(llmTarget({ AWS_BEARER_TOKEN_BEDROCK: "tok", AWS_REGION: "us-west-2" })).toEqual({
    provider: "bedrock",
    model: "anthropic.claude-sonnet-5-5",
    apiKey: "tok",
    baseURL: "https://bedrock-mantle.us-west-2.api.aws/anthropic",
  });
  expect(llmTarget({ AWS_BEARER_TOKEN_BEDROCK: "tok" })!.baseURL).toBe("https://bedrock-mantle.us-east-1.api.aws/anthropic");
});

test("the Bedrock token wins over ANTHROPIC_API_KEY; the API key alone selects the first-party API", () => {
  expect(llmTarget({ AWS_BEARER_TOKEN_BEDROCK: "tok", ANTHROPIC_API_KEY: "k" })!.provider).toBe("bedrock");
  expect(llmTarget({ ANTHROPIC_API_KEY: "k" })).toEqual({ provider: "anthropic", model: "claude-opus-5-5", apiKey: "k", baseURL: null });
});
