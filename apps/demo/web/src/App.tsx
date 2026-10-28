// Pick a PR, click Next: the server measures it from the stored repo and export and decides the brief, stage by
// stage. The owner panel then asks only for what the measurement could not find; Re-run redoes the decision with
// those answers. Everything a viewer enters lives in this component's state and is gone on reload; the model key
// is sent with a run and kept nowhere else.
import { useEffect, useMemo, useState } from "react";
import { listPrs, runPr, type Asks, type Overrides, type PrSummary, type Progress, type RunResult } from "./api";
import { DiffView } from "./DiffView";
import { Markdown } from "./Markdown";

interface Panel {
  /** signal name -> value as typed; a value equal to the measured one is not sent */
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

/** One PR's runs: only the latest and the one before it are kept. */
interface Session {
  panel: Panel;
  latest: Run | null;
  previous: Run | null;
  viewing: "latest" | "previous";
}

const EMPTY: Panel = { values: {}, model: false, advisoryAsRequired: false, stylesheetsCovered: false, revertMinutes: "" };
const NEW_SESSION: Session = { panel: EMPTY, latest: null, previous: null, viewing: "latest" };

export function overridesOf(panel: Panel, asks: Asks | null): Overrides {
  const o: Overrides = {};
  const signals: Record<string, string> = {};
  for (const a of asks?.signals ?? []) {
    const v = panel.values[a.name]?.trim();
    if (v && v !== a.value) signals[a.name] = v;
  }
  if (Object.keys(signals).length) o.signals = signals;
  if (panel.model) o.model = true;
  if (panel.advisoryAsRequired && asks?.advisory.length) o.advisoryAsRequired = true;
  if (panel.stylesheetsCovered && asks?.stylesheets) o.stylesheetsCovered = true;
  if (panel.revertMinutes.trim() !== "" && asks?.revertMinutes) o.revertMinutes = Number(panel.revertMinutes);
  return o;
}

const cellLine = (r: RunResult) => `${r.cell.damage} damage × ${r.cell.window} window = ${r.cell.gridMode}`;

function progressLine(p: Progress): string {
  if (p.phase === "start") return `model, ${p.purpose}: calling…`;
  const cost = p.usd === null ? "" : `, est. $${p.usd.toFixed(4)}`;
  const tokens = p.tokens === null ? "" : `, ${p.tokens.toLocaleString("en-US")} tokens`;
  return `model, ${p.purpose}: ${p.outcome} in ${(p.latency_ms / 1000).toFixed(1)} s${tokens}${cost}${p.error ? ` (${p.error})` : ""}`;
}

export function App() {
  const [prs, setPrs] = useState<PrSummary[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [sessions, setSessions] = useState<Record<number, Session>>({});
  const [modelKey, setModelKey] = useState("");
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPrs()
      .then(setPrs)
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  const session = active === null ? NEW_SESSION : (sessions[active] ?? NEW_SESSION);
  const shownRun = session.viewing === "previous" && session.previous ? session.previous : session.latest;
  const asks = session.latest?.result.asks ?? null;
  const update = (n: number, s: Partial<Session>) => setSessions((all) => ({ ...all, [n]: { ...(all[n] ?? NEW_SESSION), ...s } }));

  async function go(n: number, overrides: Overrides) {
    if (running) return;
    const key = overrides.model && modelKey.trim() ? modelKey.trim() : null;
    setActive(n);
    setRunning(true);
    setSteps(["sent to the server"]);
    setError(null);
    try {
      const result = await runPr(
        n,
        overrides,
        key,
        (stage, ms) =>
          setSteps((l) => [
            ...l,
            stage === "measurement in memory reused" ? "measurement from the first run reused" : stage.startsWith("waiting") ? stage : `measured: ${stage} (${ms} ms)`,
          ]),
        (p) => setSteps((l) => [...l, progressLine(p)]),
      );
      setSessions((all) => {
        const s = all[n] ?? NEW_SESSION;
        const id = (s.latest?.id ?? 0) + 1;
        return { ...all, [n]: { ...s, previous: s.latest, latest: { id, at: new Date().toLocaleTimeString(), result }, viewing: "latest" } };
      });
      setSteps((l) => [...l, `decided in ${result.ms} ms`]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  const next = () => {
    if (picked === null) return;
    const s = sessions[picked] ?? NEW_SESSION;
    go(picked, overridesOf(s.panel, s.latest?.result.asks ?? null));
  };

  return (
    <div className="page">
      <header className="topbar">
        <h1>Release brief</h1>
        <select value={picked ?? ""} onChange={(e) => setPicked(e.target.value ? Number(e.target.value) : null)} aria-label="Pull request" disabled={running}>
          <option value="">Choose one of the 21 arcade PRs…</option>
          {prs.map((p) => (
            <option key={p.n} value={p.n}>
              #{p.n} — {p.title}
            </option>
          ))}
        </select>
        <button className="primary" onClick={next} disabled={picked === null || running}>
          {running && active === picked ? "Running…" : "Next"}
        </button>
        <span className="muted small">Runs on the server from the stored repo and PR export. Nothing is precomputed.</span>
      </header>
      <div className="layout">
        <main className="brief">
          {error && <div className="error">{error}</div>}
          {(running || steps.length > 0) && <Steps steps={steps} running={running} />}
          {active === null && !running && <p className="muted placeholder">Choose a PR above and click Next to run its brief.</p>}
          {shownRun && (
            <div className={running ? "dim" : ""}>
              {session.previous && (
                <div className="viewing">
                  <button className={session.viewing === "latest" ? "tab active" : "tab"} onClick={() => update(active!, { viewing: "latest" })}>
                    Latest run ({session.latest!.at})
                  </button>
                  <button className={session.viewing === "previous" ? "tab active" : "tab"} onClick={() => update(active!, { viewing: "previous" })}>
                    Run before it ({session.previous.at})
                  </button>
                </div>
              )}
              <HeaderCard run={shownRun} />
              {session.viewing === "latest" && session.previous && <DiffView before={session.previous.result} after={session.latest!.result} />}
              <Markdown text={shownRun.result.markdown} />
            </div>
          )}
        </main>
        {active !== null && asks && session.latest && (
          <OwnerPanel
            asks={asks}
            latest={session.latest.result}
            panel={session.panel}
            setPanel={(p) => update(active, { panel: { ...session.panel, ...p } })}
            modelKey={modelKey}
            setModelKey={setModelKey}
            running={running}
            onRun={() => go(active, overridesOf(session.panel, asks))}
            onReset={() => update(active, { panel: EMPTY })}
          />
        )}
      </div>
    </div>
  );
}

function Steps({ steps, running }: { steps: string[]; running: boolean }) {
  return (
    <section className="card steps">
      <h2>{running ? "Running on the server…" : "Last run"}</h2>
      <ol>
        {steps.map((s, i) => (
          <li key={i}>
            <span className="tick">✓</span> {s}
          </li>
        ))}
        {running && <li className="muted">…</li>}
      </ol>
    </section>
  );
}

function HeaderCard({ run }: { run: Run }) {
  const r = run.result;
  const b = r.brief;
  return (
    <section className="card header">
      <div className="card-top">
        <span className={`mode big mode-${(b.mode ?? "").toLowerCase()}`}>{b.mode}</span>
        <span className="muted small">
          run {run.id}, {run.at} · {r.measureMs === null ? "measurement reused" : `measured in ${r.measureMs} ms`} · decided in {r.ms} ms · model {r.model ? "on" : "off"}
        </span>
      </div>
      <dl>
        <dt>Grid</dt>
        <dd>
          {cellLine(r)}
          {r.cell.shifted && <> · low measured confidence moves it one step</>}
          {r.cell.llmStep && <> · the model's coherence read moves it one step</>}
          {r.cell.gateMode && <> · gates route to {r.cell.gateMode}</>}
        </dd>
        <dt>Gates</dt>
        <dd className="gates">
          {b.gates.map((g) => (
            <span key={g.gate} className={`gate gate-${g.status}`} title={g.checks.map((c) => `${c.name}: ${c.status}`).join("\n")}>
              {g.gate}. {g.name}: {g.status}
              {g.route !== "none" ? `, routes to ${g.route}` : ""}
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
  asks: Asks;
  latest: RunResult;
  panel: Panel;
  setPanel: (p: Partial<Panel>) => void;
  modelKey: string;
  setModelKey: (k: string) => void;
  running: boolean;
  onRun: () => void;
  onReset: () => void;
}

function OwnerPanel({ asks, latest, panel, setPanel, modelKey, setModelKey, running, onRun, onReset }: PanelProps) {
  const current = useMemo(() => new Map(latest.brief.signals.map((s) => [s.name, s])), [latest]);
  const hasKey = modelKey.trim() !== "";
  const nothing = !asks.signals.length && !asks.advisory.length && !asks.stylesheets;
  return (
    <aside className="panel">
      <h2>Owner panel</h2>
      <p className="muted small">
        Only what the analysis could not find for this PR. Each value you enter is declared by the owner and replaces the assumed one; Re-run redoes the
        decision on the server.
      </p>
      {nothing && <p>Everything the decision needs was measured or declared for this PR.</p>}
      {asks.signals.length > 0 && (
        <table className="signals">
          <thead>
            <tr>
              <th>Unknown</th>
              <th>Your value</th>
              <th>Now</th>
            </tr>
          </thead>
          <tbody>
            {asks.signals.map((a) => {
              const now = current.get(a.name);
              const typed = panel.values[a.name];
              const edited = typed !== undefined && typed.trim() !== "" && typed.trim() !== a.value;
              const list = `choices-${a.name.replace(/\W+/g, "-")}`;
              return (
                <tr key={a.name} className={edited ? "edited" : ""}>
                  <td className="name" title={a.note}>{a.name}</td>
                  <td>
                    <input
                      value={typed ?? ""}
                      placeholder={a.value}
                      list={a.choices ? list : undefined}
                      onChange={(e) => setPanel({ values: { ...panel.values, [a.name]: e.target.value } })}
                      aria-label={a.name}
                    />
                    {a.choices && (
                      <datalist id={list}>
                        {a.choices.map((c) => <option key={c} value={c} />)}
                      </datalist>
                    )}
                    {a.name === "Time to revert" && asks.revertMinutes && (
                      <label className="minutes-row">
                        or measured pipeline
                        <input className="minutes" type="number" min={0} value={panel.revertMinutes} onChange={(e) => setPanel({ revertMinutes: e.target.value })} aria-label="revert minutes" />
                        min
                      </label>
                    )}
                  </td>
                  <td>
                    <span className="now">{now?.value}</span> <span className={`src src-${(now?.source ?? "").replace(/\W+/g, "-")}`}>{now?.source}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {asks.advisory.length > 0 && (
        <label className="switch">
          <input type="checkbox" checked={panel.advisoryAsRequired} onChange={(e) => setPanel({ advisoryAsRequired: e.target.checked })} />
          <span>CI: {asks.advisory.join(", ")} is red but not required by the base branch. Treat it as required.</span>
        </label>
      )}
      {asks.stylesheets > 0 && (
        <label className="switch">
          <input type="checkbox" checked={panel.stylesheetsCovered} onChange={(e) => setPanel({ stylesheetsCovered: e.target.checked })} />
          <span>Flag: count the {asks.stylesheets} added stylesheet lines as covered by the flag.</span>
        </label>
      )}

      <h3>Model (optional)</h3>
      <label className="key">
        Key, kept in this page's memory only
        <input type="password" autoComplete="off" placeholder="sk-ant-…" value={modelKey} onChange={(e) => setModelKey(e.target.value)} />
      </label>
      <label className={hasKey ? "switch" : "switch disabled"}>
        <input type="checkbox" disabled={!hasKey} checked={panel.model && hasKey} onChange={(e) => setPanel({ model: e.target.checked })} />
        Model on
      </label>

      <div className="actions">
        <button className="primary" onClick={onRun} disabled={running}>
          {running ? "Running…" : "Re-run"}
        </button>
        <button onClick={onReset} disabled={running}>
          Clear answers
        </button>
      </div>
    </aside>
  );
}
