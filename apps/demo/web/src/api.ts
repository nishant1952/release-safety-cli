// Calls to the demo's API. A run's answer is a stream of server-sent events over the POST response.
import type { Asks, PrSummary, Progress, RunResult } from "../../server/app";
import type { Overrides } from "../../../../src/overrides";

export type { Asks, PrSummary, Progress, RunResult, Overrides };

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
  return res.json();
}

export const listPrs = () => fetch("/api/prs").then((r) => json<PrSummary[]>(r));

/**
 * Runs a PR on the server: measured on its first run, then decided with the overrides. The key goes in the body of
 * this one request and is not kept by the server.
 */
export async function runPr(
  n: number,
  overrides: Overrides,
  modelKey: string | null,
  onStage: (stage: string, ms: number) => void,
  onProgress: (p: Progress) => void,
): Promise<RunResult> {
  const res = await fetch(`/api/prs/${n}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ overrides, modelKey }),
  });
  if (!res.ok || !res.body) return json<RunResult>(res);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let at: number;
    while ((at = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, at);
      buffer = buffer.slice(at + 2);
      const event = block.match(/^event: (.+)$/m)?.[1];
      const data = block.match(/^data: (.+)$/m)?.[1];
      if (!event || data === undefined) continue; // a keep-alive comment
      const payload = JSON.parse(data);
      if (event === "stage") onStage(payload.stage, payload.ms);
      else if (event === "progress") onProgress(payload);
      else if (event === "result") return payload;
      else if (event === "error") throw new Error(payload.message);
    }
  }
  throw new Error("the run ended without a result");
}
