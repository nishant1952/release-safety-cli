// Pick a PR, run it: the server measures it from the stored repo and export and decides the brief, stage by stage,
// ticked off as each one ends. The page shows the verdict and the brief as the CLI writes it. The owner panel then asks only for what the measurement could not find; Re-run redoes
// the decision with those answers. Everything a viewer enters lives in this component's state and is gone on
// reload; the model key is sent with a run and kept nowhere else.
import { useEffect, useMemo, useState } from "react";
import { listPrs, runPr, type Asks, type Overrides, type PrSummary, type Progress, type RunResult } from "./api";
import { Verdict } from "./BriefView";
import { Markdown } from "./Markdown";
import { Caution, Section, Src } from "./parts";
import { onError, onModel, onResult, onStage, RunChecklist, startTimeline, type Timeline } from "./Timeline";

interface Panel {
  /** signal name -> value as typed; a value equal to the measured one is not sent */
  values: Record<string, string>;
  model: boolean;
  advisoryAsRequired: boolean;
  stylesheetsCovered: boolean;
  revertMinutes: string;
  /** the owner's confidence level in place of the measured one; "" for none */
  confidence: string;
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

const EMPTY: Panel = { values: {}, model: false, advisoryAsRequired: false, stylesheetsCovered: false, revertMinutes: "", confidence: "" };
const NEW_SESSION: Session = { panel: EMPTY, latest: null, previous: null, viewing: "latest" };

export function overridesOf(panel: Panel, asks: Asks | null): Overrides {
  const o: Overrides = {};
  const signals: Record<string, string> = {};
  for (const a of [...(asks?.signals ?? []), ...(asks?.measured ?? [])]) {
    const v = panel.values[a.name]?.trim();
    if (v && v !== a.value) signals[a.name] = v;
  }
  if (Object.keys(signals).length) o.signals = signals;
  if (panel.model) o.model = true;
  if (panel.advisoryAsRequired && asks?.advisory.length) o.advisoryAsRequired = true;
  if (panel.stylesheetsCovered && asks?.stylesheets) o.stylesheetsCovered = true;
  if (panel.revertMinutes.trim() !== "" && asks?.revertMinutes) o.revertMinutes = Number(panel.revertMinutes);
  if (panel.confidence && asks && panel.confidence !== asks.confidence) o.confidence = panel.confidence as Overrides["confidence"];
  return o;
}

/** A model call's outcome, as its row in the run shows it: never the prompt, never the key. */
function progressDetail(p: Extract<Progress, { phase: "end" }>): string {
  const cost = p.usd === null ? "" : `, est. $${p.usd.toFixed(4)}`;
  const tokens = p.tokens === null ? "" : `, ${p.tokens.toLocaleString("en-US")} tokens`;
  return `${p.outcome} in ${(p.latency_ms / 1000).toFixed(1)} s${tokens}${cost}${p.error ? ` (${p.error})` : ""}`;
}

export function App() {
  const [prs, setPrs] = useState<PrSummary[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [sessions, setSessions] = useState<Record<number, Session>>({});
  const [modelKey, setModelKey] = useState("");
  const [running, setRunning] = useState(false);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Light unless the viewer switches; the system setting is not followed.
  const [theme, setTheme] = useState<"light" | "dark">("light");
  // The brief's layout: short by default, the full one (the CLI's --full) on request. Kept across PRs and runs.
  const [verbose, setVerbose] = useState(false);

  useEffect(() => {
    listPrs()
      .then(setPrs)
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
  };

  const session = active === null ? NEW_SESSION : (sessions[active] ?? NEW_SESSION);
  const shownRun = session.viewing === "previous" && session.previous ? session.previous : session.latest;
  const asks = session.latest?.result.asks ?? null;
  const update = (n: number, s: Partial<Session>) => setSessions((all) => ({ ...all, [n]: { ...(all[n] ?? NEW_SESSION), ...s } }));

  async function go(n: number, overrides: Overrides) {
    if (running) return;
    const key = overrides.model && modelKey.trim() ? modelKey.trim() : null;
    setActive(n);
    setRunning(true);
    // A PR run before in this page was measured then; the server reuses that measurement unless it restarted.
    setTimeline(startTimeline(Boolean(sessions[n]?.latest)));
    setError(null);
    try {
      const result = await runPr(
        n,
        overrides,
        key,
        (stage) => setTimeline((t) => t && onStage(t, stage)),
        (p) => setTimeline((t) => t && onModel(t, p.purpose, p.phase === "start" ? null : { detail: progressDetail(p), failed: p.outcome !== "ok" })),
      );
      setTimeline((t) => t && onResult(t, result.ms));
      setSessions((all) => {
        const s = all[n] ?? NEW_SESSION;
        const id = (s.latest?.id ?? 0) + 1;
        return { ...all, [n]: { ...s, previous: s.latest, latest: { id, at: new Date().toLocaleTimeString(), result }, viewing: "latest" } };
      });
    } catch (e) {
      const message = (e as Error).message;
      setTimeline((t) => t && onError(t, message));
      setError(message);
    } finally {
      setRunning(false);
    }
  }

  const runPicked = () => {
    if (picked === null) return;
    const s = sessions[picked] ?? NEW_SESSION;
    go(picked, overridesOf(s.panel, s.latest?.result.asks ?? null));
  };
  const pickedRan = picked !== null && Boolean(sessions[picked]?.latest);

  const r = shownRun?.result;

  return (
    <>
      <header className="topbar">
        <h1>Release brief</h1>
        <div className="picker">
          <select value={picked ?? ""} onChange={(e) => setPicked(e.target.value ? Number(e.target.value) : null)} aria-label="Pull request" disabled={running}>
            <option value="">Choose one of the {prs.length || 21} arcade PRs…</option>
            {prs.map((p) => (
              <option key={p.n} value={p.n}>
                #{p.n} — {p.title}
              </option>
            ))}
          </select>
        </div>
        <button className="btn" onClick={runPicked} disabled={picked === null || running}>
          {running ? "Running…" : pickedRan ? "Run again" : "Run brief"}
        </button>
        <button className="textbtn theme" onClick={toggleTheme}>
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
      </header>

      <div className="layout">
        <main className="brief">
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <section>
            <RunChecklist t={timeline} running={running} />
            {!running && picked !== active && (
              <div className="run-cta">
                <span>
                  {picked === null ? "Choose a PR above. " : ""}Each stage is ticked as the server finishes it. The verdict appears when the last one lands.
                </span>
              </div>
            )}
          </section>

          {shownRun && r && (
            <div className={running ? "sections dim" : "sections"} key={`${active}-${shownRun.id}-${session.viewing}`}>
              <Section
                n={2}
                title="Verdict"
                aside={
                  <span className="sec-aside mono">
                    #{active} · run {shownRun.id} · {shownRun.at} · {r.measureMs === null ? "measurement reused" : `measured ${r.measureMs.toLocaleString("en-US")} ms`} · decided{" "}
                    {r.ms} ms · model {r.model ? "on" : "off"}
                  </span>
                }
              >
                {session.previous && (
                  <div className="views">
                    <span className="muted">Showing</span>
                    <button className={session.viewing === "latest" ? "textbtn on" : "textbtn"} onClick={() => update(active!, { viewing: "latest" })}>
                      latest run, {session.latest!.at}
                    </button>
                    <button className={session.viewing === "previous" ? "textbtn on" : "textbtn"} onClick={() => update(active!, { viewing: "previous" })}>
                      the run before it, {session.previous.at}
                    </button>
                  </div>
                )}
                <Verdict r={r} />
              </Section>
              <Section
                n={3}
                title="Brief"
                aside={
                  <span className="sec-aside brief-toggle">
                    <span className="muted">As the CLI writes it for this run:</span>
                    <button className={verbose ? "textbtn" : "textbtn on"} aria-pressed={!verbose} onClick={() => setVerbose(false)}>
                      short
                    </button>
                    <button className={verbose ? "textbtn on" : "textbtn"} aria-pressed={verbose} onClick={() => setVerbose(true)}>
                      full (verbose)
                    </button>
                  </span>
                }
                delay={0.3}
              >
                <Markdown text={verbose ? r.fullMarkdown : r.markdown} />
              </Section>
            </div>
          )}
        </main>

        {active !== null && asks && session.latest ? (
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
        ) : (
          <aside className="panel">
            <div>
              <div className="panel-title">Owner panel</div>
              <p className="panel-intro">After a run, this lists only what the analysis could not find for that PR, for the release owner to answer.</p>
            </div>
          </aside>
        )}
      </div>
    </>
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
  // Only signals with a fixed set of values are asked for; the others (History) only lower confidence.
  const answerable = asks.signals.filter((a) => a.choices);
  const nothing = !answerable.length && !asks.advisory.length && !asks.stylesheets;
  // The answers differ from the ones the latest run used.
  const dirty = JSON.stringify(overridesOf(panel, asks)) !== JSON.stringify(latest.overrides);
  return (
    <aside className="panel" aria-label="Owner panel">
      <div>
        <div className="panel-title">Owner panel</div>
        <p className="panel-intro">
          Only what the analysis could not find for this PR. Each value you enter is declared by the owner and replaces the assumed one; Re-run redoes the
          decision on the server.
        </p>
      </div>
      {nothing && <p className="panel-intro">Everything the decision needs was measured or declared for this PR.</p>}

      {answerable.map((a) => {
        const now = current.get(a.name);
        const chosen = panel.values[a.name] ?? "";
        const minutes = a.name === "Time to revert" && asks.revertMinutes;
        return (
          <div className="ask" key={a.name}>
            <div className="ask-top">
              <span className="ask-name" title={a.note}>
                {a.name}
              </span>
              {now && <Src source={now.source} />}
            </div>
            <div className="ask-now">
              Now: <span>{now?.value}</span>
            </div>
            <div className="choices" role="group" aria-label={a.name}>
              {a.choices!.map((c) => (
                <button
                  key={c}
                  className={chosen === c ? "choice on" : "choice"}
                  aria-pressed={chosen === c}
                  onClick={() => setPanel({ values: { ...panel.values, [a.name]: chosen === c ? "" : c }, ...(minutes ? { revertMinutes: "" } : {}) })}
                >
                  {c}
                </button>
              ))}
            </div>
            {minutes && (
              <label className="minutes">
                or measured pipeline
                <input
                  className="field"
                  type="number"
                  min={0}
                  placeholder="—"
                  value={panel.revertMinutes}
                  onChange={(e) => setPanel({ revertMinutes: e.target.value, values: { ...panel.values, [a.name]: "" } })}
                  aria-label="revert minutes"
                />
                min
              </label>
            )}
          </div>
        );
      })}

      {asks.advisory.length > 0 && (
        <label className="switch">
          <input type="checkbox" checked={panel.advisoryAsRequired} onChange={(e) => setPanel({ advisoryAsRequired: e.target.checked })} />
          <span>
            <b>
              Treat the failing CI {asks.advisory.length === 1 ? "check" : "checks"} {asks.advisory.join(", ")} as required
            </b>
            <span className="switch-note">
              The base branch does not require {asks.advisory.length === 1 ? "it" : "them"}, so the failure is not counted now. Tick this if the release should not ship
              while {asks.advisory.length === 1 ? "it fails" : "they fail"}: gate 1 then counts {asks.advisory.length === 1 ? "it" : "them"}, and a failing required check blocks the
              release.
            </span>
          </span>
        </label>
      )}
      {asks.stylesheets > 0 && (
        <label className="switch">
          <input type="checkbox" checked={panel.stylesheetsCovered} onChange={(e) => setPanel({ stylesheetsCovered: e.target.checked })} />
          <span>
            <b>Count the {asks.stylesheets} new CSS lines as behind the feature flag</b>
            <span className="switch-note">
              CSS cannot check a flag, so these lines are counted as outside it, one reason the flag reads partial. Tick this if they only style what the
              flag shows: with the flag off they have no effect.
            </span>
          </span>
        </label>
      )}

      <div className="measured">
        <div className="measured-title">
          <Caution title="Changing these replaces a measurement" /> Measured from the repo
        </div>
        <p className="panel-intro">
          Read from the code, not guessed. A value you set here replaces the measurement and is tagged declared by owner with ⚠: the verdict then rests on
          your word, not the repo.
        </p>
      </div>
      {[
        ...asks.measured.map((a) => ({ ...a, now: current.get(a.name)?.value, chosen: panel.values[a.name] ?? "", set: (v: string) => setPanel({ values: { ...panel.values, [a.name]: v } }) })),
        {
          name: "Confidence",
          value: asks.confidence,
          source: "measured",
          note: "From test coverage and author familiarity. Low moves the mode one step toward caution.",
          choices: ["high", "medium", "low"],
          now: latest.brief.confidence?.measuredLevel,
          chosen: panel.confidence,
          set: (v: string) => setPanel({ confidence: v }),
        },
      ].map((a) => (
        <div className="ask" key={a.name}>
          <div className="ask-top">
            <span className="ask-name" title={a.note}>
              {a.name}
            </span>
            <Src source={a.source} />
          </div>
          <div className="ask-now">
            Measured: <span>{a.value}</span>
            {a.now !== undefined && a.now !== a.value && (
              <>
                {" "}
                · now: <span>{a.now}</span> <Caution />
              </>
            )}
          </div>
          <div className="choices" role="group" aria-label={a.name}>
            {a.choices.map((c) => (
              <button key={c} className={a.chosen === c ? "choice on" : "choice"} aria-pressed={a.chosen === c} onClick={() => a.set(a.chosen === c ? "" : c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="model">
        <div className="model-title">
          Model <span>(optional)</span>
        </div>
        <label className="ask-now" htmlFor="model-key">
          Key, kept in this page's memory only
        </label>
        <input id="model-key" className="field key" type="password" autoComplete="off" placeholder="sk-ant-…" value={modelKey} onChange={(e) => setModelKey(e.target.value)} />
        <label className={hasKey ? "switch plain" : "switch plain disabled"}>
          <input type="checkbox" disabled={!hasKey} checked={panel.model && hasKey} onChange={(e) => setPanel({ model: e.target.checked })} />
          <span>Model on</span>
        </label>
      </div>

      <div className="actions">
        <button className="btn" onClick={onRun} disabled={running}>
          {running ? "Running…" : "Re-run"}
        </button>
        <button className="textbtn" onClick={onReset} disabled={running}>
          Clear answers
        </button>
      </div>
      {dirty && !running && (
        <div className="dirty" role="status">
          <i />
          Answers changed. Re-run to redo the decision.
        </div>
      )}
    </aside>
  );
}
