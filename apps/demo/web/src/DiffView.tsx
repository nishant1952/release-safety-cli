// What moved between the latest run and the one before it.
import type { Reason } from "../../../../src/brief";
import type { RunResult } from "./api";
import { diffRuns, type Change, type Row } from "./compare";
import { inline } from "./Markdown";

function Moved({ label, c }: { label: string; c: Change<string> }) {
  return (
    <div className={c.changed ? "moved changed" : "moved"}>
      <span className="label">{label}</span>
      {c.changed ? (
        <span>
          <span className="before">{c.before}</span> → <span className="after">{c.after}</span>
        </span>
      ) : (
        <span>{c.after} (unchanged)</span>
      )}
    </div>
  );
}

function ReasonItem({ r, kind }: { r: Reason; kind: "added" | "removed" | "reworded" }) {
  return (
    <li className={kind}>
      <span className="sign">{kind === "added" ? "+" : kind === "removed" ? "−" : "~"}</span> {inline(r.text)}
      {r.model?.map((m) => (
        <div key={m.signal} className="model-ev">
          the model's citation for {m.signal} (was {m.was}, assumed): <code>{m.cite}</code>. {m.reasoning}
        </div>
      ))}
      {r.prose && <div className="model-ev"><em>{r.prose}</em> (LLM wording)</div>}
    </li>
  );
}

const val = (v: Row["before"]) => (v ? `${v.value} (${v.source})` : "absent");

export function DiffView({ before, after }: { before: RunResult; after: RunResult }) {
  const d = diffRuns(before, after);
  const gateChanges = d.gates.filter((g) => g.changed);
  return (
    <section className="card diff">
      <div className="card-top">
        <h2>What moved</h2>
        <span className="muted small">against the run before it</span>
      </div>
      <Moved label="Mode" c={d.mode} />
      <Moved label="Grid cell" c={d.cell} />
      {gateChanges.map((g, i) => <Moved key={i} label="Gate" c={g} />)}
      <Moved label="Confidence" c={d.confidence} />

      <h3>Top reasons that changed</h3>
      {d.reasons.added.length + d.reasons.removed.length ? (
        <ul className="reasons">
          {d.reasons.removed.map((r, i) => <ReasonItem key={`r${i}`} r={r} kind="removed" />)}
          {d.reasons.added.map((r, i) => <ReasonItem key={`a${i}`} r={r} kind="added" />)}
        </ul>
      ) : (
        <p className="muted">None.</p>
      )}
      {d.reasons.reworded.length > 0 && (
        <>
          <h3>Same reasons, new model wording or evidence</h3>
          <ul className="reasons">
            {d.reasons.reworded.map((r, i) => <ReasonItem key={`w${i}`} r={r} kind="reworded" />)}
          </ul>
        </>
      )}
      {d.reasons.unchanged > 0 && <p className="muted small">{d.reasons.unchanged} reason(s) with unchanged text.</p>}

      {(d.disagreements.added.length > 0 || d.disagreements.removed.length > 0) && (
        <>
          <h3>Disagreements that changed</h3>
          <ul className="reasons">
            {d.disagreements.removed.map((t, i) => <li key={`r${i}`} className="removed"><span className="sign">−</span> {t}</li>)}
            {d.disagreements.added.map((t, i) => <li key={`a${i}`} className="added"><span className="sign">+</span> {t}</li>)}
          </ul>
        </>
      )}

      <h3>Provenance rows that changed</h3>
      {d.changedRows.length ? (
        <table>
          <thead>
            <tr><th>Signal</th><th>Before</th><th>After</th></tr>
          </thead>
          <tbody>
            {d.changedRows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="before">{val(r.before)}</td>
                <td className="after">
                  {val(r.after)}
                  {r.after && <div className="note">{r.after.note}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">None.</p>
      )}
      {d.unchangedRows.length > 0 && (
        <details>
          <summary>{d.unchangedRows.length} unchanged rows</summary>
          <table>
            <tbody>
              {d.unchangedRows.map((r) => (
                <tr key={r.name}><td>{r.name}</td><td>{val(r.after)}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
