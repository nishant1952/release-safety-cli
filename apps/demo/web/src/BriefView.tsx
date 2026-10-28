// The verdict: the mode, the grid cell it came from, and four numbers from the brief. The rest of the brief is
// shown as the CLI writes it (Markdown.tsx).
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { RunResult } from "./api";
import { Caution, toneOf } from "./parts";

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

type Pos = "tl" | "tr" | "bl" | "br";
const CELLS: { damage: "low" | "high"; window: "short" | "long"; pos: Pos }[] = [
  { damage: "low", window: "short", pos: "tl" },
  { damage: "low", window: "long", pos: "tr" },
  { damage: "high", window: "short", pos: "bl" },
  { damage: "high", window: "long", pos: "br" },
];

/**
 * Where each step after the grid cell lands: the nearest cell holding that step's mode (same row first, from the
 * cell the step started at), or "block", a box under the grid, since no cell holds Block.
 */
function landings(r: RunResult, steps: ReturnType<typeof trail>): { pos: Pos | "block"; mode: string; why: string; caution: boolean }[] {
  let from = CELLS.find((c) => c.damage === r.cell.damage && c.window === r.cell.window)!;
  return steps.slice(1).map((s) => {
    if (s.mode === "Block") return { pos: "block" as const, ...s };
    const holding = CELLS.filter((c) => GRID[c.damage][c.window] === s.mode).sort((a, b) => Number(b.damage === from.damage) - Number(a.damage === from.damage));
    from = holding[0] ?? from;
    return { pos: from.pos, ...s };
  });
}

type Arrow = { x1: number; y1: number; x2: number; y2: number };

/** The grid cell is filled; each step that moved the mode outlines the cell it lands on, with an arrow from the one before. */
function Grid({ r, steps }: { r: RunResult; steps: ReturnType<typeof trail> }) {
  const box = useRef<HTMLDivElement>(null);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const lands = landings(r, steps);
  const at = (pos: Pos | "block") => lands.find((l) => l.pos === pos);

  useLayoutEffect(() => {
    const measure = () => {
      const g = box.current;
      if (!g) return;
      // Layout offsets inside the grid, not bounding boxes: the cells animate in with transforms.
      const el = (sel: string) => g.querySelector<HTMLElement>(sel);
      const chain = [el(".grid-cell.on"), ...lands.map((l) => el(`.grid-to[data-pos="${l.pos}"]`))];
      const out: Arrow[] = [];
      for (let i = 1; i < chain.length; i++) {
        const [a, b] = [chain[i - 1], chain[i]];
        if (!a || !b) continue;
        // Labels sit at each cell's bottom left, so the arrows keep to the right-hand side (vertical steps) or
        // the top (horizontal ones), from inside the source to just inside the target.
        const box = (e: HTMLElement) => ({ l: e.offsetLeft, t: e.offsetTop, r: e.offsetLeft + e.offsetWidth, b: e.offsetTop + e.offsetHeight });
        const [p, q] = [box(a), box(b)];
        const vertical = Math.abs((q.t + q.b) / 2 - (p.t + p.b) / 2) >= Math.abs((q.l + q.r) / 2 - (p.l + p.r) / 2);
        const down = q.t > p.t;
        out.push(
          vertical
            ? { x1: p.r - 14, y1: (p.t + p.b) / 2, x2: q.r - 14, y2: down ? q.t + 10 : q.b - 10 }
            : { x1: q.l > p.l ? p.r - 40 : p.l + 40, y1: p.t + 7, x2: q.l > p.l ? q.l + 2 : q.r - 2, y2: q.t + 7 },
        );
      }
      setArrows(out);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [r, steps.length]);

  const label = (l: { why: string; caution: boolean }) => (
    <span className="grid-why">
      {l.why}
      {l.caution && <Caution />}
    </span>
  );
  const cell = (damage: "low" | "high", window: "short" | "long", pos: Pos) => {
    const on = r.cell.damage === damage && r.cell.window === window;
    const to = !on ? at(pos) : undefined;
    const cls = on ? ` on ${modeClass(r.cell.gridMode)}` : to ? ` grid-to ${modeClass(to.mode)}` : "";
    return (
      <div className={`grid-cell ${pos}${cls}`} data-pos={pos} aria-current={on || undefined}>
        {to && label(to)}
        {GRID[damage][window]}
      </div>
    );
  };
  const block = at("block");
  return (
    <div
      className="grid"
      ref={box}
      role="img"
      aria-label={`Grid: ${r.cell.damage} damage, ${r.cell.window} window, ${r.cell.gridMode}${lands.map((l) => `; ${l.why} moves it to ${l.mode}`).join("")}`}
    >
      <div />
      <div className={on(r.cell.window === "short", "grid-col")}>short window</div>
      <div className={on(r.cell.window === "long", "grid-col")}>long window</div>
      <div className={on(r.cell.damage === "low", "grid-row")}>low damage</div>
      {cell("low", "short", "tl")}
      {cell("low", "long", "tr")}
      <div className={on(r.cell.damage === "high", "grid-row")}>high damage</div>
      {cell("high", "short", "bl")}
      {cell("high", "long", "br")}
      {block && (
        <>
          <div />
          <div className={`grid-cell grid-block grid-to ${modeClass("Block")}`} data-pos="block">
            {label(block)}
            Block
          </div>
        </>
      )}
      {arrows.length > 0 && (
        <svg className="grid-arrow" aria-hidden="true">
          <defs>
            <marker id="grid-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" />
            </marker>
          </defs>
          {arrows.map((a, i) => (
            <line key={i} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} markerEnd="url(#grid-head)" />
          ))}
        </svg>
      )}
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
        <span className={toneOf("Confidence", b.confidence?.level)}>{cap(b.confidence?.level ?? "not computed")}</span>
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
        <Grid r={r} steps={steps} />
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
