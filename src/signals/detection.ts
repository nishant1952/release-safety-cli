// W 1c item 3, appendix Reversibility rank 3: "Whether the changed path emits anything an alert
// watches, not whether dashboards exist"; extracted from "Alert and dashboard config, SLO
// definitions, metric and infra baselines". W 1 note: "Failure mode and detection decide how long
// the window really is." Resolution in DECISIONS.md: detection is fast when a detector matching
// each failure mode exists on the changed path (infra: deploy health check, error rate or latency;
// domain: a business-level check, W 4.3; security: an auth-error alert). Unknown rounds to slow (W 2).
import { ref, type Diff } from "../diff";
import { Git } from "../git";
import type { Signal } from "../types";
import { importsFile, TEST_FILE } from "./confidence";
import type { FailureModeFacts, Mode } from "./failureMode";
import { CATALOG } from "./reach";

const OBS_MODULE = /(^|[/.-])(observability|telemetry|metrics?|log|logger|logging|monitor(ing)?|tracing|otel|openobserve)([/.-]|$)/i;
const GENERIC_EMIT = /\b(logger|log)\.(debug|info|warn|error|fatal)\s*\(|\bconsole\.(error|warn)\s*\(/;
const ALERT_FILE = /(^|\/)(alerts?|alerting|alertmanager|slos?|monitors?|prometheus|grafana|pagerduty|datadog)([/._-]|$)/i;
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const HEALTH_LINE = /^\s*(healthcheck:|HEALTHCHECK\b)|curl\b.*\/health\b/i;
const DATABASE = /postgres|mysql|mariadb|redis|mongo/i;
const indentOf = (l: string) => l.match(/^\s*/)![0].length;

/** A compose `healthcheck:` under a database service watches the database, not the deploy. */
export function underDatabase(lines: string[], i: number): boolean {
  if (!/^\s*healthcheck:/.test(lines[i])) return false;
  const h = indentOf(lines[i]);
  let s = i - 1;
  while (s >= 0 && !(lines[s].trim() && indentOf(lines[s]) < h && /^\s*[\w.-]+:\s*$/.test(lines[s]))) s--;
  if (s < 0) return false;
  let end = s + 1;
  while (end < lines.length && (!lines[end].trim() || indentOf(lines[end]) > indentOf(lines[s]))) end++;
  const image = lines.slice(s, end).find((l) => /^\s*image:/.test(l)) ?? "";
  return DATABASE.test(lines[s]) || DATABASE.test(image);
}
const ERROR_NAME = /error|fail/i;
const LATENCY_NAME = /_ms\b|_seconds\b|duration|latency/i;
const TIMING_VALUE = /elapsed|duration|latency|_?ms\b|millis|seconds|time/i;
const AUTH_ALERT = /auth[\w.-]*(error|fail)/i;

export type EmitKind = "error rate" | "latency" | "value" | "count" | "log";

export interface Emit {
  at: string;
  via: string;
  name: string | null;
  kind: EmitKind;
}

export interface DetectionFacts {
  modes: Mode[];
  emits: Emit[];
  /** deploy health check lines (declared config) */
  healthChecks: string[];
  /** alert, SLO or dashboard config files */
  alertFiles: string[];
  /** alert files that name an emitted metric */
  watched: string[];
  /** alert files that watch auth errors */
  authAlerts: string[];
  /** tests that import a changed domain file */
  domainTests: string[];
  /** emitted metric names vs the metrics catalog; null when the catalog file is not in the repo */
  catalog: { missing: string[]; declaredOnly: string[] } | null;
}

/** Deploy config: CI workflows, and repo files they execute (`./x.sh`, `bash x.sh`) or load as compose
 * files (`-f x.yml`), two levels deep (workflow -> script -> compose file). */
function deployFiles(git: Git, rev: string, files: string[]): string[] {
  const found = new Set(files.filter((p) => WORKFLOW.test(p)));
  let frontier = [...found];
  for (let depth = 0; depth < 2; depth++) {
    const next: string[] = [];
    for (const p of frontier) {
      const t = git.show(rev, p) ?? "";
      // Teardown lines (`compose ... down`) do not deploy anything.
      const live = t.split("\n").filter((l) => !/\bdown\b/.test(l)).join("\n");
      for (const m of live.matchAll(/(?:\.\/|(?:^|\s)(?:bash|sh)\s+|\s-f\s+)([\w./-]+)/gm)) {
        const f = m[1].replace(/^\.\//, "");
        if (files.includes(f) && !found.has(f) && !next.includes(f)) next.push(f);
      }
    }
    for (const f of next) found.add(f);
    frontier = next;
  }
  return [...found].sort();
}

function kindOf(name: string | null, value: string | null, via: string): EmitKind {
  if (name === null) return /console|log/.test(via) ? "log" : "count";
  if (ERROR_NAME.test(name)) return "error rate";
  if (LATENCY_NAME.test(name) || (value !== null && TIMING_VALUE.test(value))) return "latency";
  if (value !== null && !/^\d+(\.\d+)?$/.test(value)) return "value";
  return "count";
}

export function detectionFacts(diff: Diff, failure: FailureModeFacts): DetectionFacts {
  const git = new Git(diff.repo);
  const emits: Emit[] = [];
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
      // The call's first two arguments: the metric name, then the value. Read a few lines on.
      const call = lines.slice(l.line - 1, l.line + 3).join(" ");
      const m = call.match(/\(\s*["'`]([\w.:-]+)["'`]\s*(?:,\s*([^,)]+?)\s*[,)])?/);
      const name = m?.[1] ?? null;
      const value = m?.[2]?.trim() ?? null;
      const via = hit.replace(/\s*\($/, "");
      emits.push({ at: ref(l), via, name, kind: kindOf(name, value, via) });
    }
  }
  const emitted = [...new Set(emits.map((e) => e.name).filter((n): n is string => !!n))].sort();
  const files = git.listFiles(diff.head);

  const healthChecks = deployFiles(git, diff.head, files)
    .flatMap((p) => {
      const lines = (git.show(diff.head, p) ?? "").split("\n");
      return lines.flatMap((l, i) => (HEALTH_LINE.test(l) && !underDatabase(lines, i) ? [`${p}:${i + 1}`] : []));
    });
  // Prose (Markdown, editor rules) describes alerts but configures none, so it is not alert config.
  const alertFiles = files.filter((p) => ALERT_FILE.test(p) && !/\.(md|mdc)$/.test(p));
  const watched: string[] = [];
  const authAlerts: string[] = [];
  for (const p of alertFiles) {
    const t = git.show(diff.head, p) ?? "";
    if (emitted.some((n) => t.includes(n))) watched.push(p);
    if (AUTH_ALERT.test(t)) authAlerts.push(p);
  }
  let catalog: DetectionFacts["catalog"] = null;
  const catalogText = git.show(diff.head, CATALOG);
  if (catalogText) {
    const declared = [...catalogText.matchAll(/name:\s*["']([^"']+)["']/g)].map((m) => m[1]);
    const fromDiff = new Set(diff.added.filter((l) => l.file === CATALOG).flatMap((l) => l.text.match(/name:\s*["']([^"']+)["']/)?.[1] ?? []));
    catalog = {
      missing: emitted.filter((n) => !declared.includes(n)),
      declaredOnly: [...fromDiff].filter((n) => !emitted.includes(n)).sort(),
    };
  }

  const domainFiles = failure.perFile.filter((p) => p.mode === "domain").map((p) => p.path);
  const domainTests = files
    .filter((p) => TEST_FILE.test(p))
    .filter((t) => domainFiles.some((f) => importsFile(t, git.show(diff.head, t) ?? "", f)));

  return { modes: failure.modes, emits, healthChecks, alertFiles, watched, authAlerts, domainTests, catalog };
}

export interface ModeResult {
  mode: Mode;
  detectors: { what: string; at: string; source: "measured" | "declared" }[];
  /** true when the absence was checked against measured inputs only */
  absenceMeasured: boolean;
}

export function perMode(f: DetectionFacts): ModeResult[] {
  return f.modes.map((mode) => {
    const d: ModeResult["detectors"] = [];
    if (mode === "infra") {
      for (const e of f.emits.filter((e) => e.kind === "error rate" || e.kind === "latency"))
        d.push({ what: `${e.kind} metric ${e.name}`, at: e.at, source: "measured" });
      for (const h of f.healthChecks) d.push({ what: "deploy health check", at: h, source: "declared" });
      for (const w of f.watched) d.push({ what: "alert on an emitted metric", at: `${w}:1`, source: "declared" });
      return { mode, detectors: d, absenceMeasured: false };
    }
    if (mode === "domain") {
      for (const e of f.emits.filter((e) => e.kind === "value")) d.push({ what: `value metric ${e.name}`, at: e.at, source: "measured" });
      for (const t of f.domainTests) d.push({ what: "test of a changed domain file", at: `${t}:1`, source: "measured" });
      return { mode, detectors: d, absenceMeasured: true };
    }
    for (const a of f.authAlerts) d.push({ what: "auth-error alert", at: `${a}:1`, source: "declared" });
    return { mode, detectors: d, absenceMeasured: false };
  });
}

export function detectionSignal(f: DetectionFacts): Signal<"fast" | "slow"> {
  const results = perMode(f);
  const missing = results.filter((r) => !r.detectors.length);
  const describe = (r: ModeResult) =>
    r.detectors.length
      ? `${r.mode}: ${[...new Set(r.detectors.map((d) => d.what))].join(", ")}`
      : `${r.mode}: no ${r.mode === "domain" ? "business-level check (no value metric, no test of the changed domain files)" : r.mode === "infra" ? "health check, error-rate or latency detector" : "auth-error alert"}`;
  const emitText = f.emits.length
    ? `${f.emits.length} metric/log calls on changed lines (${f.emits.map((e) => `${e.name ?? e.via}: ${e.kind}`).filter((v, i, a) => a.indexOf(v) === i).join(", ")})`
    : "no metric or log call on changed lines";
  const evidence = [...new Set(results.flatMap((r) => r.detectors.map((d) => d.at)))];
  if (!results.length)
    return { name: "Detection apparatus", value: "fast", source: "measured", evidence, note: "no failure mode (docs- or test-only change)" };
  if (missing.length)
    return {
      name: "Detection apparatus",
      value: "slow",
      source: missing.every((r) => r.absenceMeasured) ? "measured" : "assumed",
      evidence,
      note: `${results.map(describe).join("; ")}. Every failure mode needs its detector, so detection is slow. ${emitText}. Checked in the repo only; alert config outside the repo (OpenObserve) is not an input`,
    };
  const declaredOnly = results.some((r) => r.detectors.every((d) => d.source === "declared"));
  return {
    name: "Detection apparatus",
    value: "fast",
    source: declaredOnly ? "declared" : "measured",
    evidence,
    note: `${results.map(describe).join("; ")}. ${emitText}`,
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
