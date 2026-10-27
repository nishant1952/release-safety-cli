// Three columns: the 21 PRs, the selected brief, the owner panel. Everything a viewer enters lives in this
// component's state and is gone on reload; the model key is sent with a run and kept nowhere else.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getPr, listPrs, runPr, type Overrides, type PrDetail, type PrSummary, type Progress, type RunResult } from "./api";
import { DiffView, History, type Compare } from "./DiffView";
import { Markdown } from "./Markdown";

interface Panel {
  /** signal name -> value as typed; a value equal to the baseline is not sent */
  values: Record<string, string>;
  model: boolean;
  advisoryAsRequired: boolean;
  stylesheetsCovered: boolean;
  revertMinutes: string;
}

export interface Run {
  id: number;
  at: string;
  result: RunResult;
}

interface Session {
  panel: Panel;
  /** newest last, at most ten */
  runs: Run[];
  /** the run shown; null shows the baseline */
  shown: number | null;
}

const EMPTY: Panel = { values: {}, model: false, advisoryAsRequired: false, stylesheetsCovered: false, revertMinutes: "" };
const HISTORY = 10;

export function overridesOf(panel: Panel, baseline: RunResult, readOnly: string[]): Overrides {
  const o: Overrides = {};
  const signals: Record<string, string> = {};
  for (const s of baseline.brief.signals) {
    const v = panel.values[s.name]?.trim();
    if (v !== undefined && v !== "" && v !== s.value && !readOnly.includes(s.name)) signals[s.name] = v;
  }
  if (Object.keys(signals).length) o.signals = signals;
  if (panel.model) o.model = true;
  if (panel.advisoryAsRequired) o.advisoryAsRequired = true;
  if (panel.stylesheetsCovered) o.stylesheetsCovered = true;
  if (panel.revertMinutes.trim() !== "") o.revertMinutes = Number(panel.revertMinutes);
  return o;
}

/** The panel that would produce a run's overrides, so a run can be restored. */
export function panelOf(o: Overrides): Panel {
  return {
    values: { ...o.signals },
    model: o.model === true,
    advisoryAsRequired: o.advisoryAsRequired === true,
    stylesheetsCovered: o.stylesheetsCovered === true,
    revertMinutes: o.revertMinutes === undefined || o.revertMinutes === null ? "" : String(o.revertMinutes),
  };
}

const cellLine = (r: RunResult) => `${r.cell.damage} damage × ${r.cell.window} window = ${r.cell.gridMode}`;

function progressLine(p: Progress): string {
  if (p.phase === "start") return `${p.purpose}: calling the model…`;
  const cost = p.usd === null ? "" : `, est. $${p.usd.toFixed(4)}`;
  const tokens = p.tokens === null ? "" : `, ${p.tokens.toLocaleString("en-US")} tokens`;
  return `${p.purpose}: ${p.outcome} in ${(p.latency_ms / 1000).toFixed(1)} s${tokens}${cost}${p.error ? ` (${p.error})` : ""}`;
}

export function App() {
  const [prs, setPrs] = useState<PrSummary[]>([]);
  const [details, setDetails] = useState<Record<number, PrDetail>>({});
  const [selected, setSelected] = useState<number>(13);
  const [sessions, setSessions] = useState<Record<number, Session>>({});
  const [modelKey, setModelKey] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState<Compare>("previous");

  useEffect(() => {
    listPrs()
      .then(async (list) => {
        setPrs(list);
        // Load every PR's baseline up front, so selecting one shows its brief at once.
        for (const p of list) getPr(p.n).then((d) => setDetails((all) => ({ ...all, [p.n]: d })));
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  const detail = details[selected];
  const session: Session = sessions[selected] ?? { panel: EMPTY, runs: [], shown: null };
  const shownRun = session.shown === null ? null : (session.runs.find((r) => r.id === session.shown) ?? null);
  const shown = shownRun?.result ?? detail?.baseline ?? null;
  const update = (s: Partial<Session>) => setSessions((all) => ({ ...all, [selected]: { ...session, ...s } }));
  const setPanel = (p: Partial<Panel>) => update({ panel: { ...session.panel, ...p } });
  // "Before" is the run before the one shown (the baseline for the first run), or the baseline when asked.
  const at = shownRun ? session.runs.indexOf(shownRun) : -1;
  const previous = at > 0 ? session.runs[at - 1] : null;
  const before = compare === "baseline" || !previous ? null : previous;

  async function run() {
    if (!detail || running) return;
    const overrides = overridesOf(session.panel, detail.baseline, detail.readOnly);
    const key = overrides.model && modelKey.trim() ? modelKey.trim() : null;
    setRunning(true);
    setProgress(key ? ["sending the run with the model on…"] : []);
    setError(null);
    const n = selected;
    try {
      const result = await runPr(n, overrides, key, (p) => setProgress((lines) => [...lines, progressLine(p)]));
      setSessions((all) => {
        const s = all[n] ?? { panel: EMPTY, runs: [], shown: null };
        const id = (s.runs.at(-1)?.id ?? 0) + 1;
        const runs = [...s.runs, { id, at: new Date().toLocaleTimeString(), result }].slice(-HISTORY);
        return { ...all, [n]: { ...s, runs, shown: id } };
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="layout">
      <PrList prs={prs} selected={selected} onSelect={(n) => { setSelected(n); setProgress([]); setError(null); }} />
      <main className="brief">
        {error && <div className="error">{error}</div>}
        {shown ? (
          <>
            <HeaderCard result={shown} label={shownRun ? `run ${shownRun.id}, ${shownRun.at}` : "baked baseline"} />
            {shownRun && detail && (
              <DiffView
                before={before?.result ?? detail.baseline}
                after={shownRun.result}
                beforeLabel={before ? `run ${before.id}` : compare === "previous" ? "the baked baseline (no earlier run)" : "the baked baseline"}
                compare={compare}
                setCompare={setCompare}
              />
            )}
            <Markdown text={shown.markdown} />
          </>
        ) : (
          <p className="muted">Loading the baked brief…</p>
        )}
      </main>
      {detail && (
        <OwnerPanel
          detail={detail}
          shown={shown!}
          panel={session.panel}
          setPanel={setPanel}
          modelKey={modelKey}
          setModelKey={setModelKey}
          running={running}
          progress={progress}
          onRun={run}
          onReset={() => update({ panel: EMPTY })}
          history={
            <History
              runs={session.runs}
              shown={session.shown}
              onShow={(id) => update({ shown: id })}
              onRestore={(r) => update({ shown: r.id, panel: panelOf(r.result.overrides) })}
            />
          }
        />
      )}
    </div>
  );
}

function PrList({ prs, selected, onSelect }: { prs: PrSummary[]; selected: number; onSelect: (n: number) => void }) {
  return (
    <nav className="prs">
      <h1>Release briefs</h1>
      <p className="muted small">21 arcade PRs, baked. Mode and grid cell from the baseline run.</p>
      <ul>
        {prs.map((p) => (
          <li key={p.n}>
            <button className={p.n === selected ? "pr active" : "pr"} onClick={() => onSelect(p.n)}>
              <span className="pr-top">
                <span className="num">#{p.n}</span>
                <span className={`mode mode-${p.mode.toLowerCase()}`}>{p.mode}</span>
              </span>
              <span className="title">{p.title}</span>
              <span className="cell">{p.cell}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function HeaderCard({ result, label }: { result: RunResult; label: string }) {
  const b = result.brief;
  return (
    <section className="card header">
      <div className="card-top">
        <span className={`mode big mode-${(b.mode ?? "").toLowerCase()}`}>{b.mode}</span>
        <span className="muted small">
          {label} · decided in {result.ms} ms · model {result.model ? "on" : "off"}
        </span>
      </div>
      <dl>
        <dt>Grid</dt>
        <dd>
          {cellLine(result)}
          {result.cell.shifted && <> · low measured confidence moves it one step</>}
          {result.cell.llmStep && <> · the model's coherence read moves it one step</>}
          {result.cell.gateMode && <> · gates route to {result.cell.gateMode}</>}
        </dd>
        <dt>Gates</dt>
        <dd className="gates">
          {b.gates.map((g) => (
            <span key={g.gate} className={`gate gate-${g.status}`} title={g.checks.map((c) => `${c.name}: ${c.status}`).join("\n")}>
              {g.gate}. {g.name}: {g.status}
              {g.route !== "none" ? ` → ${g.route}` : ""}
            </span>
          ))}
        </dd>
        <dt>Confidence</dt>
        <dd>{b.confidence?.level ?? "not computed"}</dd>
      </dl>
    </section>
  );
}

interface PanelProps {
  detail: PrDetail;
  shown: RunResult;
  panel: Panel;
  setPanel: (p: Partial<Panel>) => void;
  modelKey: string;
  setModelKey: (k: string) => void;
  running: boolean;
  progress: string[];
  onRun: () => void;
  onReset: () => void;
  history: ReactNode;
}

function OwnerPanel({ detail, shown, panel, setPanel, modelKey, setModelKey, running, progress, onRun, onReset, history }: PanelProps) {
  const baseline = detail.baseline.brief.signals;
  const current = useMemo(() => new Map(shown.brief.signals.map((s) => [s.name, s])), [shown]);
  const hasKey = modelKey.trim() !== "";
  return (
    <aside className="panel">
      <h2>Owner panel</h2>
      <p className="muted small">
        Values you enter are declared by the owner. An assumed or declared signal takes your value; a measured one stands and your value is listed as a
        disagreement (measured beats declared).
      </p>
      <table className="signals">
        <thead>
          <tr>
            <th>Signal</th>
            <th>Value</th>
            <th>Provenance</th>
          </tr>
        </thead>
        <tbody>
          {baseline.map((s) => {
            const readOnly = detail.readOnly.includes(s.name);
            const now = current.get(s.name) ?? s;
            const typed = panel.values[s.name];
            const edited = typed !== undefined && typed.trim() !== "" && typed.trim() !== s.value;
            const list = `choices-${s.name.replace(/\W+/g, "-")}`;
            return (
              <tr key={s.name} className={edited ? "edited" : ""}>
                <td className="name" title={now.note}>{s.name}</td>
                <td>
                  {readOnly ? (
                    <span className="readonly" title="the model's answer; not editable">{now.value}</span>
                  ) : (
                    <>
                      <input
                        // The shown run's value; only a typed value is sent.
                        value={typed ?? now.value}
                        list={detail.choices[s.name] ? list : undefined}
                        onChange={(e) => setPanel({ values: { ...panel.values, [s.name]: e.target.value } })}
                        aria-label={s.name}
                      />
                      {detail.choices[s.name] && (
                        <datalist id={list}>
                          {detail.choices[s.name].map((c) => <option key={c} value={c} />)}
                        </datalist>
                      )}
                    </>
                  )}
                </td>
                <td>
                  <span className={`src src-${now.source.replace(/\W+/g, "-")}`}>{now.source}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3>Switches</h3>
      <label className="switch">
        <input type="checkbox" checked={panel.advisoryAsRequired} onChange={(e) => setPanel({ advisoryAsRequired: e.target.checked })} />
        Treat advisory checks as required
      </label>
      <label className="switch">
        <input type="checkbox" checked={panel.stylesheetsCovered} onChange={(e) => setPanel({ stylesheetsCovered: e.target.checked })} />
        Count stylesheet lines toward flag coverage
      </label>
      <label className="switch">
        Measured revert time
        <input className="minutes" type="number" min={0} placeholder="—" value={panel.revertMinutes} onChange={(e) => setPanel({ revertMinutes: e.target.value })} />
        minutes
      </label>
      <label className={hasKey ? "switch" : "switch disabled"}>
        <input type="checkbox" disabled={!hasKey} checked={panel.model && hasKey} onChange={(e) => setPanel({ model: e.target.checked })} />
        Model on
      </label>
      <label className="key">
        Model key (kept in this page's memory only)
        <input type="password" autoComplete="off" placeholder="sk-ant-…" value={modelKey} onChange={(e) => setModelKey(e.target.value)} />
      </label>

      <div className="actions">
        <button className="run" onClick={onRun} disabled={running}>
          {running ? "Running…" : "Run"}
        </button>
        <button onClick={onReset} disabled={running}>
          Reset panel
        </button>
      </div>
      {progress.length > 0 && (
        <ol className="progress">
          {progress.map((p, i) => <li key={i}>{p}</li>)}
        </ol>
      )}
      {history}
    </aside>
  );
}
