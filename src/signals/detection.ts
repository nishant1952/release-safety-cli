// W 1c item 3, appendix Reversibility rank 3: "Whether the changed path emits anything an alert
// watches, not whether dashboards exist"; extracted from "Alert and dashboard config, SLO
// definitions, metric and infra baselines". W 2: "Assume ... no alert on the changed path".
import { ref, type Diff } from "../diff";
import { Git } from "../git";
import type { Signal } from "../types";
import { CATALOG } from "./reach";

const OBS_MODULE = /(^|[/.-])(observability|telemetry|metrics?|log|logger|logging|monitor(ing)?|tracing|otel|openobserve)([/.-]|$)/i;
const GENERIC_EMIT = /\b(logger|log)\.(debug|info|warn|error|fatal)\s*\(|\bconsole\.(error|warn)\s*\(/;
const ALERT_FILE = /(^|\/)(alerts?|alerting|alertmanager|slos?|monitors?|prometheus|grafana|pagerduty|datadog)([/._-]|$)/i;

export interface DetectionFacts {
  emits: { at: string; via: string; name: string | null }[];
  alertFiles: string[] | null;
  /** alert files that mention an emitted metric name */
  watched: string[];
  /** metric names emitted in code vs declared in the catalog; null when the catalog was not read */
  catalog: { missing: string[]; declaredOnly: string[] } | null;
}

export function detectionFacts(diff: Diff, ignoreDeclared = false): DetectionFacts {
  const git = new Git(diff.repo);
  const emits: DetectionFacts["emits"] = [];
  for (const f of diff.files.filter((f) => /\.(tsx?|jsx?)$/.test(f.path))) {
    const text = git.show(diff.head, f.path) ?? "";
    // Local names imported from observability/log/metric modules, e.g. `metric as record`.
    const names: string[] = [];
    for (const m of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g))
      if (OBS_MODULE.test(m[2]))
        names.push(...m[1].split(",").map((s) => s.trim().split(/\s+as\s+/).pop()!).filter((n) => /^[a-z]/.test(n)));
    const lines = text.split("\n");
    for (const l of f.added) {
      const hit = names.find((n) => new RegExp(`\\b${n}\\s*\\(`).test(l.text)) ?? l.text.match(GENERIC_EMIT)?.[0];
      if (!hit) continue;
      // The metric name is the first string literal of the call, on this line or the next.
      const name = (l.text + (lines[l.line] ?? "")).match(/\(\s*["'`]([\w.:-]+)["'`]/)?.[1] ?? null;
      emits.push({ at: ref(l), via: hit.replace(/\s*\($/, ""), name });
    }
  }
  const emitted = [...new Set(emits.map((e) => e.name).filter((n): n is string => !!n))].sort();

  let alertFiles: string[] | null = null;
  const watched: string[] = [];
  if (!ignoreDeclared) {
    // Prose (Markdown, editor rules) describes alerts but configures none, so it is not alert config.
    alertFiles = git.listFiles(diff.head).filter((p) => ALERT_FILE.test(p) && !/\.(md|mdc)$/.test(p));
    for (const p of alertFiles) {
      const t = git.show(diff.head, p) ?? "";
      if (emitted.some((n) => t.includes(n))) watched.push(p);
    }
  }

  let catalog: DetectionFacts["catalog"] = null;
  if (!ignoreDeclared) {
    const t = git.show(diff.head, CATALOG);
    if (t) {
      const declared = [...t.matchAll(/name:\s*["']([^"']+)["']/g)].map((m) => m[1]);
      const fromDiff = new Set(diff.added.filter((l) => l.file === CATALOG).flatMap((l) => l.text.match(/name:\s*["']([^"']+)["']/)?.[1] ?? []));
      catalog = {
        missing: emitted.filter((n) => !declared.includes(n)),
        declaredOnly: [...fromDiff].filter((n) => !emitted.includes(n)).sort(),
      };
    }
  }
  return { emits, alertFiles, watched, catalog };
}

export function detectionSignal(facts: DetectionFacts): Signal<"alerted" | "not alerted"> {
  const names = [...new Set(facts.emits.map((e) => e.name ?? e.via))];
  const emitText = facts.emits.length
    ? `measured: ${facts.emits.length} metric/log calls on changed lines (${names.join(", ")})`
    : "measured: no metric or log call on changed lines";
  const evidence = facts.emits.map((e) => e.at);
  if (facts.watched.length)
    return {
      name: "Detection apparatus",
      value: "alerted",
      source: "declared",
      evidence,
      note: `${emitText}; alert config watching them: ${facts.watched.join(", ")}`,
    };
  const why =
    facts.alertFiles === null
      ? "alert config not read"
      : facts.alertFiles.length
        ? `alert config (${facts.alertFiles.join(", ")}) does not mention them`
        : "no alert, SLO or dashboard config in the repo";
  return {
    name: "Detection apparatus",
    value: "not alerted",
    source: "assumed",
    evidence,
    note: `${emitText}; ${why}, so no alert on the changed path is assumed`,
  };
}

/** Declared (catalog) vs measured (code) metric names, for the brief's disagreements line. */
export function detectionDisagreements(facts: DetectionFacts): string[] {
  if (!facts.catalog) return [];
  const out: string[] = [];
  if (facts.catalog.missing.length)
    out.push(`metrics emitted in code but not declared in the metrics catalog: ${facts.catalog.missing.join(", ")}`);
  if (facts.catalog.declaredOnly.length)
    out.push(`metrics added to the catalog but not emitted by the changed code: ${facts.catalog.declaredOnly.join(", ")}`);
  return out;
}
