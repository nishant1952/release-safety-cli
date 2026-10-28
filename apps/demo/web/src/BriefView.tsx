// The verdict: the mode, the grid cell it came from, and four numbers from the brief. The rest of the brief is
// shown as the CLI writes it (Markdown.tsx).
import type { ReactNode } from "react";
import type { RunResult } from "./api";
import { Caution } from "./parts";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const modeClass = (mode: string | null) => `mode-${(mode ?? "").toLowerCase()}`;

/** W 3 grid: "Low damage | Auto | Staged", "High damage | Staged | Human" (src/decide.ts). */
const GRID = { low: { short: "Auto", long: "Staged" }, high: { short: "Staged", long: "Human" } } as const;

const MODES = ["Auto", "Staged", "Human", "Block"];
/** Signals the grid cell is read from (src/decide.ts). */
const GRID_INPUTS = ["Reversible or irreversible", "Feature flag", "Path", "Reach", "Detection apparatus", "Time to revert"];

/** Each step from the grid cell to the mode, with what took it: low confidence, the model's task check, a gate. */
function trail(r: RunResult): { mode: string; why: string; caution: boolean }[] {
  const { cell, brief: b } = r;
  const contested = new Set((b.contested ?? []).map((c) => c.name));
  const steps: { mode: string; why: string; caution: boolean }[] = [{ mode: cell.gridMode, why: "", caution: GRID_INPUTS.some((n) => contested.has(n)) }];
  let mode: string = cell.gridMode;
  const next = () => (mode = MODES[MODES.indexOf(mode) + 1]);
  if (cell.shifted) steps.push({ mode: next(), why: "low confidence", caution: contested.has("Confidence") });
  if (cell.llmStep) steps.push({ mode: next(), why: "the model found the diff does not match the task", caution: false });
  if (b.mode && b.mode !== mode) {
    const gates = b.gates.filter((g) => g.route !== "none");
    steps.push({
      mode: b.mode,
      why: `gate${gates.length > 1 ? "s" : ""} ${gates.map((g) => g.gate).join(", ")}`,
      caution: gates.some((g) => g.checks.some((c) => c.source === "declared by owner")),
    });
  }
  return steps;
}

/** The chosen row and column labels are set in ink and bold. */
const on = (chosen: boolean, base: string) => (chosen ? `${base} chosen` : base);

function Grid({ r }: { r: RunResult }) {
  const cell = (damage: "low" | "high", window: "short" | "long", pos: string) => {
    const on = r.cell.damage === damage && r.cell.window === window;
    return (
      <div className={`grid-cell ${pos}${on ? ` on ${modeClass(r.cell.gridMode)}` : ""}`} aria-current={on || undefined}>
        {GRID[damage][window]}
      </div>
    );
  };
  return (
    <div className="grid" role="img" aria-label={`Grid: ${r.cell.damage} damage, ${r.cell.window} window, ${r.cell.gridMode}`}>
      <div />
      <div className={on(r.cell.window === "short", "grid-col")}>short window</div>
      <div className={on(r.cell.window === "long", "grid-col")}>long window</div>
      <div className={on(r.cell.damage === "low", "grid-row")}>low damage</div>
      {cell("low", "short", "tl")}
      {cell("low", "long", "tr")}
      <div className={on(r.cell.damage === "high", "grid-row")}>high damage</div>
      {cell("high", "short", "bl")}
      {cell("high", "long", "br")}
    </div>
  );
}

export function Verdict({ r }: { r: RunResult }) {
  const b = r.brief;
  const steps = trail(r);
  const pass = b.gates.filter((g) => g.status === "pass").length;
  const trip = b.gates.filter((g) => g.status === "trip").length;
  const unverifiable = b.gates.length - pass - trip;
  const assumed = b.signals.filter((s) => s.source === "assumed").length;
  const added = b.files.reduce((n, f) => n + f.added, 0);
  const removed = b.files.reduce((n, f) => n + f.removed, 0);
  const stats: [string, ReactNode][] = [
    [
      "Gates",
      <>
        {pass}/{b.gates.length} <small className={trip ? "hot" : unverifiable ? "amb" : "ok"}>{trip ? `${trip} trip` : unverifiable ? `${unverifiable} unverifiable` : "pass"}</small>
      </>,
    ],
    [
      "Confidence",
      <>
        {cap(b.confidence?.level ?? "not computed")}
        {b.contested?.some((c) => c.name === "Confidence") && <Caution />}
      </>,
    ],
    [
      "Assumed inputs",
      <>
        {assumed} <small>of {b.signals.length}</small>
      </>,
    ],
    [
      `Diff · ${b.files.length} file${b.files.length === 1 ? "" : "s"}`,
      <>
        +{added} <small>−{removed}</small>
      </>,
    ],
  ];
  return (
    <>
      <div className="verdict">
        <div className="verdict-main">
          <div className="verdict-kicker">Release mode</div>
          <div className={`mode-word ${modeClass(b.mode)}`}>{b.mode ?? "Not computed"}</div>
          <div className="verdict-cell">
            {r.cell.damage} damage × {r.cell.window} window
            {steps[0].caution && <Caution />}
          </div>
          {steps.length > 1 && (
            <div className="trail" aria-label="How the mode was reached">
              {steps.map((s, i) => (
                <span className="trail-step" key={i}>
                  {i > 0 && (
                    <span className="trail-why">
                      → {s.why}
                      {s.caution && <Caution />} →
                    </span>
                  )}
                  <span className={`trail-mode ${modeClass(s.mode)}`}>{s.mode}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <Grid r={r} />
      </div>
      <div className="stats">
        {stats.map(([k, v], i) => (
          <div className="stat" key={k} style={{ animationDelay: `${0.5 + i * 0.08}s` }}>
            <div className="stat-k">{k}</div>
            <div className="stat-v">{v}</div>
          </div>
        ))}
      </div>
    </>
  );
}
