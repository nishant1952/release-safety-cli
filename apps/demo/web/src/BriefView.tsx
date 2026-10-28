// The verdict: the mode, the grid cell it came from, and four numbers from the brief. The rest of the brief is
// shown as the CLI writes it (Markdown.tsx).
import type { ReactNode } from "react";
import type { RunResult } from "./api";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const modeClass = (mode: string | null) => `mode-${(mode ?? "").toLowerCase()}`;

/** W 3 grid: "Low damage | Auto | Staged", "High damage | Staged | Human" (src/decide.ts). */
const GRID = { low: { short: "Auto", long: "Staged" }, high: { short: "Staged", long: "Human" } } as const;

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
    ["Confidence", cap(b.confidence?.level ?? "not computed")],
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
          </div>
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
