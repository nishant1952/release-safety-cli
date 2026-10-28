// The demo's API. A PR is measured on the server when a viewer asks for it, from the stored bare clone and PR
// exports only: nothing is fetched or cloned, and nothing computed earlier is read. The measurement is kept in
// memory so a re-run with the owner's inputs only redoes the decision. Nothing a viewer sends is kept; the
// model key in a run request is used for that run's calls and dropped with the request.
import type { Brief } from "../../../src/brief";
import { nonCodeKind } from "../../../src/files";
import { redact, redAdvisory } from "../../../src/gates";
import type { CallProgress } from "../../../src/llm";
import { VALUES, type Overrides } from "../../../src/overrides";
import { applyPolicy } from "../../../src/policy";
import { makeQuoter } from "../../../src/render";
import { decide, type Decided, type Measured } from "../../../src/run";
import { listExports, PR_NUMBERS } from "./fixtures";

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
  /** time measure took, or null when the measurement in memory was reused */
  measureMs: number | null;
  /** what the owner panel asks for this PR */
  asks: Asks;
}

export interface PrSummary {
  n: number;
  title: string;
}

/**
 * What the owner panel asks: only what the measurement could not find. The signals that were assumed (with the
 * value the missing-data policy gave them), and the switches that apply to this PR.
 */
export interface Asks {
  signals: { name: string; value: string; note: string; choices: string[] | null }[];
  /** Time to revert is assumed, so a measured pipeline time is asked for */
  revertMinutes: boolean;
  /** red checks the base branch does not require */
  advisory: string[];
  /** added stylesheet lines outside the flag, when they are part of what keeps it partial */
  stylesheets: number;
}

/** One model call, as the page shows it: never the prompt, never the key. */
export type Progress =
  | { purpose: string; phase: "start" }
  | { purpose: string; phase: "end"; outcome: string; latency_ms: number; tokens: number | null; usd: number | null; error: string | null };

/** What the owner panel asks for one measured PR. */
export function asksOf(m: Measured): Asks {
  const all = [...m.early, ...m.late, ...(m.atBase ? [m.atBase] : [])];
  const rounded = applyPolicy(all, m.confidence.measuredLevel, []).signals;
  const flag = m.early.find((s) => s.name === "Feature flag")!;
  const cssOutside = m.flag.lines.filter(([ref, c]) => c === "outside" && nonCodeKind(ref.replace(/:\d+$/, "")) === "stylesheet").length;
  return {
    signals: rounded
      .filter((s) => s.source === "assumed")
      .map((s) => ({ name: s.name, value: s.value, note: s.note, choices: VALUES[s.name] ?? null })),
    revertMinutes: rounded.some((s) => s.name === "Time to revert" && s.source === "assumed"),
    advisory: redAdvisory(m.pr).map((c) => `${c.name} (${c.conclusion})`),
    stylesheets: flag.value === "partial" ? cssOutside : 0,
  };
}

/** The CLI's secret redaction, over every line quoted from the repo onto the screen. */
export function redactingQuoter(m: Measured) {
  const quote = makeQuoter(m.repo, m.base, m.head);
  return (ref: string) => {
    const text = quote(ref);
    return text === null ? null : redact(text).text;
  };
}

export async function run(m: Measured, overrides: Overrides, modelKey: string | null, progress?: (p: Progress) => void, measureMs: number | null = null): Promise<RunResult> {
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
  return { ...d, overrides, model: useModel, ms: Math.round(performance.now() - started), measureMs, asks: asksOf(m) };
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

/** measure() in a worker thread, reporting each stage as it ends. */
function measureInWorker(n: number, onStage: (stage: string, ms: number) => void): Promise<Measured> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./measure-worker.ts", import.meta.url).href);
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.stage) return onStage(e.data.stage, e.data.ms);
      worker.terminate();
      if (e.data.measured) resolve(e.data.measured);
      else reject(new Error(`measurement failed: ${e.data.error}`));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(`measurement failed: ${e.message}`));
    };
    worker.postMessage({ n });
  });
}

export function createApp(): App {
  const prs = listExports();
  // Measurements made in this process, by PR. A request that finds one in flight waits for it.
  const measured = new Map<number, Promise<Measured>>();

  async function fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (path === "/api/prs" && req.method === "GET") return Response.json(prs);
    const match = path.match(/^\/api\/prs\/(\d+)\/run$/);
    if (!match || !PR_NUMBERS.includes(Number(match[1]))) return Response.json({ error: "not found" }, { status: 404 });
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const n = Number(match[1]);
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
      let measureMs: number | null = null;
      let m = measured.get(n);
      if (!m) {
        const started = performance.now();
        m = measureInWorker(n, (stage, ms) => send("stage", { stage, ms }));
        measured.set(n, m);
        m.catch(() => measured.delete(n));
        await m;
        measureMs = Math.round(performance.now() - started);
      } else send("stage", { stage: "measurement in memory reused", ms: 0 });
      const result = await run(await m, overrides, modelKey, (p) => send("progress", p), measureMs);
      send("result", result);
    });
  }

  return { fetch, prs };
}
