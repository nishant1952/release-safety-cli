// 01 Run: the server's stages as a checklist, ticked as each event arrives. Model calls are listed as they start and
// ticked with their outcome when they end.

/** The stages measure reports, in order (src/run.ts), then the decision. */
export const MEASURE_STAGES = ["diff", "gates", "feature flag", "path", "reach", "detection", "confidence", "reversibility", "revert and history"];
export const DECIDE = "decide";

export interface Step {
  label: string;
  done: boolean;
  detail?: string;
  failed?: boolean;
}

export interface Timeline {
  steps: Step[];
  /** stages not reached yet; the first is the one running while the run is on */
  pending: string[];
  /** decide's time in ms once the run ended, or null */
  decidedMs: number | null;
  error: string | null;
}

export const startTimeline = (reused: boolean): Timeline => ({
  steps: [],
  pending: reused ? [DECIDE] : [...MEASURE_STAGES, DECIDE],
  decidedMs: null,
  error: null,
});

const WAITING = "waiting for measurement";
const notMeasuring = (p: string[]) => p.filter((s) => !MEASURE_STAGES.includes(s));

/** A stage event: measure ended one, or the server reused or is waiting for a measurement. */
export function onStage(t: Timeline, stage: string): Timeline {
  const steps = t.steps.map((s) => (s.label === WAITING ? { ...s, done: true } : s));
  if (stage === "measurement in memory reused") return { ...t, steps: [...steps, { label: "measurement reused", done: true }], pending: notMeasuring(t.pending) };
  if (stage.startsWith("waiting")) return { ...t, steps: [...steps, { label: WAITING, done: false, detail: stage }], pending: notMeasuring(t.pending) };
  return { ...t, steps: [...steps, { label: stage, done: true }], pending: t.pending.filter((s) => s !== stage) };
}

/** A model call: a row when it starts, ticked with its outcome when it ends. */
export function onModel(t: Timeline, purpose: string, done: { detail: string; failed: boolean } | null): Timeline {
  if (!done) return { ...t, steps: [...t.steps, { label: purpose, done: false }] };
  const i = t.steps.findLastIndex((s) => s.label === purpose && !s.done);
  if (i === -1) return t;
  const steps = [...t.steps];
  steps[i] = { ...steps[i], done: true, ...done };
  return { ...t, steps };
}

export function onResult(t: Timeline, decidedMs: number): Timeline {
  return { ...t, steps: [...t.steps.map((s) => ({ ...s, done: true })), { label: DECIDE, done: true }], pending: [], decidedMs };
}

export function onError(t: Timeline, message: string): Timeline {
  const steps = t.steps.map((s) => (s.done ? s : { ...s, done: true, failed: true }));
  const [stopped, ...rest] = t.pending;
  return { ...t, steps: [...steps, ...(stopped ? [{ label: stopped, done: true, failed: true }] : [])], pending: rest, error: message };
}

/** The rows of a page that has not run anything yet. */
const IDLE: Timeline = startTimeline(false);

export function RunChecklist({ t, running }: { t: Timeline | null; running: boolean }) {
  const tl = t ?? IDLE;
  const live = running ? tl.pending[0] : undefined;
  const status =
    t === null
      ? "Not run yet"
      : tl.error
        ? "Stopped"
        : running
          ? live === DECIDE
            ? tl.steps.some((s) => !s.done && s.label !== WAITING)
              ? "Waiting for the model"
              : "Deciding"
            : live
              ? `Measuring ${live}`
              : "Running"
          : `Complete · decided in ${tl.decidedMs} ms`;
  type Row = { label: string; state: "done" | "running" | "failed" | "pending"; detail?: string };
  const rows: Row[] = [
    ...tl.steps.map((s): Row => ({ label: s.label, state: s.failed ? "failed" : s.done ? "done" : "running", detail: s.detail })),
    ...tl.pending.map((label, i): Row => ({ label, state: i === 0 && running ? "running" : "pending" })),
  ];
  return (
    <>
      <div className="run-head">
        <span className="sec-label">01 Run</span>
        <span className="sec-aside">{status}</span>
      </div>
      <div role="list" aria-label="Server stages" className="checklist">
        {rows.map((r, i) => (
          <div role="listitem" className={`step ${t === null ? "pending" : r.state}`} key={i}>
            <span className="step-mark">{r.state === "done" ? "✓" : r.state === "running" ? "›" : r.state === "failed" ? "✕" : "·"}</span>
            <span className="step-label">{r.label}</span>
            {r.detail && <span className="step-detail">{r.detail}</span>}
          </div>
        ))}
      </div>
    </>
  );
}
