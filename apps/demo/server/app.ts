// The demo's API. Every brief is decided from a baked measurement: nothing is fetched, cloned or measured
// at runtime, and nothing a viewer sends is kept. The model key in a run request is used for that run's
// calls and dropped with the request.
import type { Brief } from "../../../src/brief";
import { redact } from "../../../src/gates";
import type { CallProgress } from "../../../src/llm";
import { VALUES, type Overrides } from "../../../src/overrides";
import { makeQuoter } from "../../../src/render";
import { decide, type Decided, type Measured } from "../../../src/run";
import { loadMeasured, PR_NUMBERS } from "./fixtures";

// Bun loads .env from the working directory. The demo never uses a key it was not handed by the page.
delete process.env.ANTHROPIC_API_KEY;

export interface RunResult {
  brief: Brief;
  markdown: string;
  cell: Decided["cell"];
  overrides: Overrides;
  /** whether the model was called */
  model: boolean;
  /** time decide took, in milliseconds */
  ms: number;
}

export interface PrSummary {
  n: number;
  title: string;
  mode: string;
  cell: string;
}

export interface PrDetail extends PrSummary {
  range: string;
  baseline: RunResult;
  /** the model's two reads; decide writes them after the owner's values, so they are not editable */
  readOnly: string[];
  /** suggested values for signals that have a fixed set */
  choices: Record<string, string[]>;
}

/** One model call, as the page shows it: never the prompt, never the key. */
export type Progress =
  | { purpose: string; phase: "start" }
  | { purpose: string; phase: "end"; outcome: string; latency_ms: number; tokens: number | null; usd: number | null; error: string | null };

const READ_ONLY = ["Failure mode (LLM second opinion)", "Confidence: diff vs task (LLM)"];

// The values the decision tests for, from src/overrides.ts; the minutes switch gives a measured pipeline.
const CHOICES = VALUES;

export const cellText = (c: Decided["cell"]) => `${c.damage} x ${c.window}`;

/** The CLI's secret redaction, over every line quoted from the repo onto the screen. */
export function redactingQuoter(m: Measured) {
  const quote = makeQuoter(m.repo, m.base, m.head);
  return (ref: string) => {
    const text = quote(ref);
    return text === null ? null : redact(text).text;
  };
}

export async function run(m: Measured, overrides: Overrides, modelKey: string | null, progress?: (p: Progress) => void): Promise<RunResult> {
  // Without a key from the page the model is off, whatever the panel says: the environment's key was deleted above.
  const useModel = Boolean(modelKey) && overrides.model !== false;
  const onCall = (p: CallProgress) =>
    progress?.(
      p.done === null
        ? { purpose: p.purpose, phase: "start" }
        : {
            purpose: p.purpose,
            phase: "end",
            outcome: p.done.outcome,
            latency_ms: p.done.latency_ms,
            tokens: p.done.tokens?.total ?? null,
            usd: p.done.cost?.usd ?? null,
            error: p.done.error?.message ?? null,
          },
    );
  const started = performance.now();
  // With a key and the model switched off, decide is still handed the key, so the brief says "switched off".
  const d = await decide(m, overrides, modelKey ?? undefined, { quote: redactingQuoter(m), progress: onCall });
  return { ...d, overrides, model: useModel, ms: Math.round(performance.now() - started) };
}

/** Request bodies are checked field by field; anything else is a 400. */
export function parseOverrides(x: unknown): Overrides {
  if (x === undefined || x === null) return {};
  if (typeof x !== "object" || Array.isArray(x)) throw new BadRequest("overrides must be an object");
  const o = x as Record<string, unknown>;
  const out: Overrides = {};
  for (const k of Object.keys(o))
    if (!["signals", "model", "advisoryAsRequired", "stylesheetsCovered", "revertMinutes"].includes(k)) throw new BadRequest(`unknown override "${k}"`);
  if (o.signals !== undefined) {
    if (typeof o.signals !== "object" || o.signals === null || Array.isArray(o.signals)) throw new BadRequest("signals must be an object");
    const signals: Record<string, string> = {};
    for (const [name, v] of Object.entries(o.signals)) {
      if (typeof v !== "string" || v.length > 200) throw new BadRequest(`signal "${name}" must be a string of at most 200 characters`);
      signals[name] = v;
    }
    out.signals = signals;
  }
  for (const k of ["model", "advisoryAsRequired", "stylesheetsCovered"] as const) {
    if (o[k] === undefined) continue;
    if (typeof o[k] !== "boolean") throw new BadRequest(`${k} must be true or false`);
    out[k] = o[k];
  }
  if (o.revertMinutes !== undefined && o.revertMinutes !== null) {
    if (typeof o.revertMinutes !== "number" || !Number.isFinite(o.revertMinutes) || o.revertMinutes < 0) throw new BadRequest("revertMinutes must be a number of minutes");
    out.revertMinutes = o.revertMinutes;
  }
  return out;
}

export class BadRequest extends Error {}

/** Server-sent events over a POST response, with a comment every few seconds so a long model call keeps the line open. */
function sse(body: (send: (event: string, data: unknown) => void) => Promise<void>): Response {
  const enc = new TextEncoder();
  let ping: ReturnType<typeof setInterval>;
  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      const write = (s: string) => {
        try {
          c.enqueue(enc.encode(s));
        } catch {
          // the viewer went away
        }
      };
      ping = setInterval(() => write(": ping\n\n"), 5000);
      try {
        await body((event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      } catch (error) {
        write(`event: error\ndata: ${JSON.stringify({ message: (error as Error).message })}\n\n`);
      } finally {
        clearInterval(ping);
        try {
          c.close();
        } catch {}
      }
    },
    cancel() {
      clearInterval(ping);
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
}

export interface App {
  fetch(req: Request): Promise<Response>;
  prs: PrSummary[];
}

/** Loads the 21 measurements and decides each baseline once. */
export async function createApp(): Promise<App> {
  const measured = new Map<number, Measured>();
  const baseline = new Map<number, RunResult>();
  for (const n of PR_NUMBERS) {
    const m = loadMeasured(n);
    measured.set(n, m);
    baseline.set(n, await run(m, {}, null));
  }
  const summary = (n: number): PrSummary => {
    const b = baseline.get(n)!;
    return { n, title: b.brief.title ?? "", mode: b.brief.mode ?? "", cell: cellText(b.cell) };
  };
  const prs = PR_NUMBERS.map(summary);

  async function fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === "/api/prs" && req.method === "GET") return Response.json(prs);
    const match = path.match(/^\/api\/prs\/(\d+)(\/run)?$/);
    if (!match || !measured.has(Number(match[1]))) return Response.json({ error: "not found" }, { status: 404 });
    const n = Number(match[1]);
    const m = measured.get(n)!;
    if (!match[2] && req.method === "GET") {
      const detail: PrDetail = { ...summary(n), range: `${m.base.slice(0, 7)}..${m.head.slice(0, 7)}`, baseline: baseline.get(n)!, readOnly: READ_ONLY, choices: CHOICES };
      return Response.json(detail);
    }
    if (match[2] && req.method === "POST") {
      let overrides: Overrides;
      let modelKey: string | null;
      try {
        const body = (await req.json()) as { overrides?: unknown; modelKey?: unknown };
        overrides = parseOverrides(body.overrides);
        if (body.modelKey !== undefined && body.modelKey !== null && typeof body.modelKey !== "string") throw new BadRequest("modelKey must be a string");
        modelKey = (body.modelKey as string | undefined)?.trim() || null;
      } catch (error) {
        return Response.json({ error: error instanceof BadRequest ? error.message : "the body must be JSON" }, { status: 400 });
      }
      return sse(async (send) => {
        const result = await run(m, overrides, modelKey, (p) => send("progress", p));
        send("result", result);
      });
    }
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  return { fetch, prs };
}
