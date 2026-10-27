// Section 1a and the appendix "Gates (1a)" table. Gates are not scored: each returns
// pass / trip / unverifiable with evidence. Section 2: "if a condition cannot be verified,
// route to a human, do not block."
import { posix } from "node:path";
import { ref, type Diff, type Line } from "./diff";
import { Git } from "./git";
import { POLICY } from "./policy";
import type { PrMeta } from "./pr";
import type { GateCheck, GateResult, GateRoute, GateStatus, Signal } from "./types";

const worst = (statuses: GateStatus[]): GateStatus =>
  statuses.includes("trip") ? "trip" : statuses.includes("unverifiable") ? "unverifiable" : "pass";

// ── Gate 1: table stakes ─────────────────────────────────────────────────────

// Each pattern's `value` group is the part a redaction replaces; without one the whole match is.
const SECRET_PATTERNS: { kind: string; test: RegExp }[] = [
  { kind: "private key", test: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { kind: "AWS key", test: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "GitHub token", test: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { kind: "Slack token", test: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { kind: "API key", test: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { kind: "JWT", test: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { kind: "URL credentials", test: /[a-z][a-z0-9+.-]*:\/\/(?<value>[^\s:@/]+:[^\s@/]+)@/gi },
];
// A credential-named key assigned a value, quoted or bare (`KEY_PASSWORD=...` in env files); the value
// must also look like a secret. A bare value ends at whitespace, a comma or a semicolon, so a call
// such as `password: hash(x)` is not a value.
const CREDENTIAL_ASSIGNMENT =
  /(?:secret|passw(?:or)?d|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)["']?\s*[:=]\s*(?:["'](?<quoted>[^"'\s]{8,})["']|(?<bare>[^\s"'`,;(){}[\]<>]{8,})(?=$|[\s,;]))/gi;
// A bare value that names another value: `$VAR`, `%VAR%`, or a property path such as `process.env.KEY!`.
const REFERENCE = /^(\$\w+|%\w+%|[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+[!?]?)$/;

/** Not a placeholder, not plain words (e.g. "unknown_user"), and mixes at least two character classes. */
export function looksLikeSecret(v: string): boolean {
  if (/^(\$\{.*\}|<.*>|\{\{.*\}\}|x+|\*+|changeme|example\w*|your[_-]\w+|dummy\w*|placeholder\w*)$/i.test(v)) return false;
  if (/^[A-Za-z]+([_.-][A-Za-z]+)*$/.test(v)) return false;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((c) => c.test(v)).length;
  return classes >= 2;
}

const PII_PATTERNS: { kind: string; test: RegExp }[] = [
  { kind: "email", test: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: "SSN", test: /\b\d{3}-\d{2}-\d{4}\b/g },
  { kind: "card number", test: /\b(?:\d{4}[ -]){3}\d{4}\b/g },
];

export interface Sensitive {
  scanner: "secret" | "PII";
  kind: string;
  start: number;
  end: number;
}

/** Every secret and PII value in one line: the gate 1 scanners, with the span a redaction replaces. */
export function sensitiveSpans(text: string): Sensitive[] {
  const out: Sensitive[] = [];
  const span = (scanner: Sensitive["scanner"], kind: string, m: RegExpMatchArray, value?: string) => {
    const start = value === undefined ? m.index! : m.index! + m[0].indexOf(value);
    out.push({ scanner, kind, start, end: start + (value ?? m[0]).length });
  };
  for (const p of SECRET_PATTERNS) for (const m of text.matchAll(p.test)) span("secret", p.kind, m, m.groups?.value);
  for (const m of text.matchAll(CREDENTIAL_ASSIGNMENT)) {
    const value = m.groups!.quoted ?? m.groups!.bare;
    if (looksLikeSecret(value) && !(m.groups!.bare && REFERENCE.test(value))) span("secret", "credential", m, value);
  }
  for (const p of PII_PATTERNS) for (const m of text.matchAll(p.test)) span("PII", p.kind, m);
  return out;
}

export const isSecretLine = (text: string) => sensitiveSpans(text).some((s) => s.scanner === "secret");
const isPiiLine = (text: string) => sensitiveSpans(text).some((s) => s.scanner === "PII");

/** Files never sent to the model: env files and files named secrets or credentials. */
export const SENSITIVE_FILE = /(^|\/)(\.env[^/]*|(secrets?|credentials?)(\.[^/]*)?)$/i;

const KEY_END = /-----END [A-Z ]*PRIVATE KEY-----/;

/** Replaces each secret or PII value with [REDACTED:<kind>], line by line; a private key block is redacted to its END line. */
export function redact(text: string): { text: string; kinds: string[] } {
  const kinds: string[] = [];
  let inKey = false;
  const lines = text.split("\n").map((line) => {
    if (inKey) {
      if (KEY_END.test(line)) inKey = false;
      return line.replace(/[A-Za-z0-9+/=]{16,}/g, "[REDACTED:private key]");
    }
    // Later spans first, so earlier offsets stay valid; an overlapping span is already covered.
    let out = line;
    let floor = Infinity;
    for (const s of sensitiveSpans(line).sort((a, b) => b.start - a.start)) {
      if (s.end > floor) continue;
      out = `${out.slice(0, s.start)}[REDACTED:${s.kind}]${out.slice(s.end)}`;
      floor = s.start;
      kinds.push(s.kind);
      if (s.kind === "private key" && !KEY_END.test(line)) inKey = true;
    }
    return out;
  });
  return { text: lines.join("\n"), kinds };
}

/** The diff text without the sections of files that are never sent to the model. */
export function withoutSensitiveFiles(diffText: string): { text: string; dropped: string[] } {
  const dropped: string[] = [];
  const sections = diffText.split(/(?=^diff --git )/m).filter((s) => {
    const path = s.match(/^diff --git a\/(.+?) b\/(.+)$/m);
    if (!path || !(SENSITIVE_FILE.test(path[1]) || SENSITIVE_FILE.test(path[2]))) return true;
    dropped.push(path[2]);
    return false;
  });
  return { text: sections.join(""), dropped };
}

/**
 * Secret and PII values already in the repo: on the diff's context and removed lines, which the PR did not add.
 * They are not a gate trip; they are redacted from the model payload and listed under Confidence.
 */
export function secretsAtBase(diff: Diff, context: Line[]): Signal | null {
  const hits = [...context, ...diff.removed]
    .map((l) => ({ l, kinds: [...new Set(sensitiveSpans(l.text).map((s) => s.kind))] }))
    .filter((h) => h.kinds.length);
  if (!hits.length) return null;
  const refs = hits.map((h) => ref(h.l, diff.base));
  return {
    name: SECRETS_AT_BASE,
    value: "observed",
    source: "measured",
    evidence: refs,
    note: `${hits.map((h, i) => `${refs[i]} (${h.kinds.join(", ")})`).join(", ")}: present in the repo before this change, not added by it. Redacted from the model payload; files matching .env* or named secrets or credentials are not sent at all. Not a gate trip, does not lower confidence`,
  };
}
export const SECRETS_AT_BASE = "Secrets present at base";

const HARDCODED_ENV_PATTERNS = [
  /\bhttps?:\/\/[A-Za-z0-9.-]+(:\d+)?/,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
  /\blocalhost:\d+\b/,
];
// Hardcoded URLs and IPs matter in code that runs; docs, config files and comments are skipped.
export const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|html|py|go|rb|java|kt|rs|php|cs|swift|sh)$/;
const COMMENT_LINE = /^\s*(\/\/|#|\*|\/\*|<!--)/;
const HARDCODED = "hardcoded environment values";

export const ADVISORY_CI = "advisory CI checks";
// GitHub counts a successful, neutral or skipped required check as passing.
const GREEN = /^(SUCCESS|NEUTRAL|SKIPPED)$/;
const PENDING = /^(PENDING|EXPECTED|QUEUED|IN_PROGRESS|WAITING|REQUESTED)$/;
const listChecks = (cs: { name: string; conclusion: string }[]) => cs.map((c) => `${c.name} (${c.conclusion})`).join(", ");

/** Red checks in the rollup that the measured required set does not name. Empty without a required set. */
export function redAdvisory(pr: PrMeta | null): { name: string; conclusion: string }[] {
  if (!pr?.checks || !pr.required) return [];
  const required = new Set(pr.required.checks);
  return pr.checks.filter((c) => !required.has(c.name) && !GREEN.test(c.conclusion) && !PENDING.test(c.conclusion));
}

/** The CI part of gate 1: required checks decide; red checks nothing requires are advisory. */
function ciChecks(pr: PrMeta | null): GateCheck[] {
  const NAME = "required CI checks";
  if (!pr?.checks)
    return [
      {
        name: NAME,
        status: "unverifiable",
        source: "assumed",
        evidence: [],
        note: pr ? "the PR export has no statusCheckRollup, so CI status is unknown" : "no PR export was found for this range, so CI status is unknown",
      },
    ];
  const rollup = pr.checks;
  if (!pr.required) {
    // No required-check set in the export: every rollup check is treated as required, as before Round 3.
    const notGreen = rollup.filter((c) => !GREEN.test(c.conclusion));
    return [
      {
        name: NAME,
        status: notGreen.length ? "trip" : "pass",
        source: "assumed",
        evidence: [],
        note:
          (notGreen.length
            ? `not green in the PR export's rollup: ${listChecks(notGreen)}`
            : rollup.length
              ? `${rollup.length} checks in the PR export's rollup, all green or neutral`
              : "the PR export's rollup lists no checks") + ". The export has no required-checks.json, so every rollup check is assumed required",
      },
    ];
  }
  const required = new Set(pr.required.checks);
  const advisory = redAdvisory(pr);
  const out: GateCheck[] = [];
  if (!required.size)
    out.push({ name: NAME, status: "pass", source: "measured", evidence: [], note: `no required checks configured on the base branch when the PR was exported (${pr.required.source}), so the gate cannot block on CI` });
  else {
    const runs = [...required].map((name) => ({ name, run: rollup.find((c) => c.name === name) }));
    const failed = runs.filter((r) => r.run && !GREEN.test(r.run.conclusion) && !PENDING.test(r.run.conclusion));
    const unknown = runs.filter((r) => !r.run || PENDING.test(r.run.conclusion));
    out.push({
      name: NAME,
      status: failed.length ? "trip" : unknown.length ? "unverifiable" : "pass",
      source: "measured",
      evidence: [],
      note: [
        failed.length ? `required and not green: ${listChecks(failed.map((r) => r.run!))}` : "",
        unknown.length ? `required but ${unknown.map((r) => `${r.name} ${r.run ? "is still pending" : "is absent from the rollup"}`).join(", ")}` : "",
        !failed.length && !unknown.length ? `${required.size} required check(s), all green` : "",
      ]
        .filter(Boolean)
        .join("; ") + ` (required set as configured when the PR was exported: ${pr.required.source})`,
    });
  }
  if (advisory.length)
    out.push({
      name: ADVISORY_CI,
      status: "pass",
      source: "declared",
      evidence: [],
      note: `red advisory check${advisory.length > 1 ? "s" : ""}, ${required.size ? "not required on the repo" : "no required checks on the repo"}: ${listChecks(advisory)}. Not required, so it cannot block; each lowers confidence one notch`,
    });
  return out;
}

function tableStakes(diff: Diff, pr: PrMeta | null): GateResult {
  const lines = diff.added;
  const check = (name: string, scope: Line[], hit: (text: string) => boolean, scopeText: string): GateCheck => {
    const hits = scope.filter((l) => hit(l.text)).map((l) => ref(l, diff.base));
    return {
      name,
      status: hits.length ? "trip" : "pass",
      source: "measured",
      evidence: hits,
      note: hits.length ? `${hits.length} added line(s) match` : `no match in ${scope.length} ${scopeText}`,
    };
  };
  const codeLines = lines.filter((l) => CODE_FILE.test(l.file) && !COMMENT_LINE.test(l.text));
  const checks: GateCheck[] = [
    check("secrets", lines, isSecretLine, "added lines"),
    check("PII", lines, isPiiLine, "added lines"),
    check(HARDCODED, codeLines, (t) => HARDCODED_ENV_PATTERNS.some((p) => p.test(t)), "added code lines (docs, config and comments skipped)"),
  ];
  checks.push(...ciChecks(pr));
  const status = worst(checks.map((c) => c.status));
  // Secrets, PII and red CI block; a hardcoded value or an unverifiable check routes to a human.
  const blocks = checks.some((c) => c.status === "trip" && c.name !== HARDCODED);
  const route: GateRoute = blocks ? "block" : status === "pass" ? "none" : "human";
  return { gate: 1, name: "Table stakes", status, route, checks };
}

// ── Moves: removed in one place, added verbatim in another ───────────────────
// A statement that is removed and re-added (whitespace normalised, in any file) moved; it is not a
// drop or a breaking change. The statement is the SQL statement from its keyword to its end, the
// route line, or the export's signature.

const SQL_KEYWORD = /\b(CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+[A-Z]+|TRUNCATE|ADD\s+COLUMN|DELETE\s+FROM|UPDATE\s+[A-Za-z_"])/i;
const norm = (t: string) => t.replace(/\s+/g, " ").trim();

export interface Move {
  kind: "SQL statement" | "route" | "export";
  from: string;
  to: string;
}

/** Whole-file lines at a revision, or (without a repo) the diff's own lines at their numbers. */
function fileLines(diff: Diff, rev: string, path: string, own: Line[]): string[] {
  const text = diff.repo ? new Git(diff.repo).show(rev, path) : null;
  if (text !== null) return text.split("\n");
  const lines: string[] = [];
  for (const l of own) lines[l.line - 1] = l.text;
  return Array.from(lines, (t) => t ?? "");
}

/** Keys a line can move under: its SQL statement, its route line, its export signature. */
function moveKeys(l: Line, lines: () => string[]): { kind: Move["kind"]; key: string }[] {
  const keys: { kind: Move["kind"]; key: string }[] = [];
  const sql = l.text.match(SQL_KEYWORD);
  if (sql) keys.push({ kind: "SQL statement", key: norm(statementAt(lines(), l.line - 1, sql.index ?? 0)) });
  if (routeOf(l.text)) keys.push({ kind: "route", key: norm(l.text) });
  if (EXPORT_DECL.test(l.text)) keys.push({ kind: "export", key: signature(l.text) });
  return keys;
}

/** Finds, for a removed (or added) line, the same statement on the other side of the diff. */
export function moveIndex(diff: Diff) {
  const files = new Map<string, string[]>();
  const linesOf = (rev: string, path: string, own: Line[]) => {
    const k = `${rev}:${path}`;
    if (!files.has(k)) files.set(k, fileLines(diff, rev, path, own));
    return files.get(k)!;
  };
  const index = (side: "added" | "removed") => {
    const map = new Map<string, Line>();
    for (const f of diff.files) {
      const own = side === "added" ? f.added : f.removed;
      const path = side === "added" ? f.path : f.oldPath;
      if (!path || !own.length) continue;
      const lines = () => linesOf(side === "added" ? diff.head : diff.base, path, own);
      for (const l of own) for (const k of moveKeys(l, lines)) if (!map.has(`${k.kind}\0${k.key}`)) map.set(`${k.kind}\0${k.key}`, l);
    }
    return map;
  };
  let added: Map<string, Line> | null = null;
  let removed: Map<string, Line> | null = null;
  const find = (l: Line, kind: Move["kind"]): Move | null => {
    const other = l.side === "base" ? (added ??= index("added")) : (removed ??= index("removed"));
    const f = diff.files.find((f) => (l.side === "base" ? f.oldPath : f.path) === l.file)!;
    const own = l.side === "base" ? f.removed : f.added;
    const lines = () => linesOf(l.side === "base" ? diff.base : diff.head, l.file, own);
    const key = moveKeys(l, lines).find((k) => k.kind === kind);
    const hit = key && other.get(`${kind}\0${key.key}`);
    if (!hit) return null;
    const [from, to] = l.side === "base" ? [l, hit] : [hit, l];
    return { kind, from: ref(from, diff.base), to: ref(to) };
  };
  return { find };
}

/** "moved from a.ts to b.ts (2 routes)", one entry per pair of files. */
export function moveText(moves: Move[]): string {
  const groups = new Map<string, Move[]>();
  for (const m of moves) {
    const k = `${m.from.replace(/@[0-9a-f]+:\d+$|:\d+$/, "")}\0${m.to.replace(/:\d+$/, "")}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(m);
  }
  return [...groups]
    .map(([k, ms]) => {
      const [from, to] = k.split("\0");
      const kinds = [...new Set(ms.map((m) => m.kind))].map((kind) => `${ms.filter((m) => m.kind === kind).length} ${kind}(s)`);
      return `moved from ${from} to ${to} (${kinds.join(", ")})`;
    })
    .join("; ");
}

// ── Public modules ───────────────────────────────────────────────────────────
// A module is reachable from outside the repo when it is a schema file, or it is in a published
// package (package.json without "private": true) and is that package's entry ("exports", "main",
// "module", "types"), a file an entry re-exports, or any file when the package has no "exports" map
// (then every path can be deep-imported). Everything else is internal to the repo.

const BUILD_DIR = /^(dist|build|lib|out|esm|cjs)\//;
const stem = (p: string) => posix.normalize(p).replace(/^\.\//, "").replace(/(\.d)?\.[cm]?[jt]sx?$/, "");
const RE_EXPORT = /export\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+["'](\.[^"']+)["']/g;

/** Strings anywhere in an "exports" value (conditions and subpaths flattened). */
function targets(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(targets);
  if (v && typeof v === "object") return Object.values(v).flatMap(targets);
  return [];
}

/** public: true / false, or null when it cannot be read (no repo, an unparsable manifest, no manifest at all). */
export type Reachability = { public: boolean | null; why: string };

export function publicModules(diff: Diff, rev: string): (path: string) => Reachability {
  const git = diff.repo ? new Git(diff.repo) : null;
  const files = git ? git.listFiles(rev) : [];
  const fileSet = new Set(files);
  const manifests = new Map<string, any>();
  for (const m of files.filter((f) => /(^|\/)package\.json$/.test(f) && !f.includes("node_modules/"))) {
    try {
      manifests.set(posix.dirname(m), JSON.parse(git!.show(rev, m) ?? "{}"));
    } catch {
      manifests.set(posix.dirname(m), null);
    }
  }
  const ownerOf = (path: string) => {
    for (let d = posix.dirname(path); ; d = posix.dirname(d)) {
      if (manifests.has(d)) return { dir: d, pkg: manifests.get(d) };
      if (d === "." || d === "/") return null;
    }
  };
  const entries = new Map<string, { stems: Set<string>; patterns: RegExp[] }>();
  /** Entry stems of a published package with an "exports" map, plus what they re-export (stems relative to the repo).
   * Wildcard subpaths ("./*": "./src/*.ts") become patterns. */
  const entriesOf = (dir: string, pkg: any) => {
    if (entries.has(dir)) return entries.get(dir)!;
    const rel = [...targets(pkg.exports), pkg.main, pkg.module, pkg.types, pkg.typings].filter((t): t is string => typeof t === "string");
    // A build output path stands for its source: dist/x.js <- src/x.ts.
    const all = rel.flatMap((t) => [stem(t), stem(t).replace(BUILD_DIR, "src/")]).map((s) => posix.join(dir, s));
    const stems = new Set(all.filter((s) => !s.includes("*")));
    const patterns = all
      .filter((s) => s.includes("*"))
      .map((s) => new RegExp(`^${s.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".+")}$`));
    const queue = [...stems];
    while (queue.length) {
      const s = queue.shift()!;
      const file = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.js"].map((e) => s + e).find((f) => fileSet.has(f));
      for (const m of (file ? git!.show(rev, file) ?? "" : "").matchAll(RE_EXPORT)) {
        const next = stem(posix.join(posix.dirname(file!), m[1]));
        if (!stems.has(next)) stems.add(next), queue.push(next);
      }
    }
    entries.set(dir, { stems, patterns });
    return entries.get(dir)!;
  };
  return (path) => {
    if (SCHEMA_FILE.test(path)) return { public: true, why: "schema file" };
    if (!git) return { public: null, why: "no repo to read package manifests from" };
    if (!manifests.size) return { public: null, why: "the repo has no package.json, so whether it is published is unknown" };
    const owner = ownerOf(path);
    // Other packages exist, so a module outside all of them is not part of any published package.
    if (!owner) return { public: false, why: "no package.json owns it" };
    if (owner.pkg === null) return { public: null, why: `${owner.dir}/package.json does not parse` };
    const name = owner.pkg.name ?? `${owner.dir}/package.json`;
    if (owner.pkg.private === true) return { public: false, why: `${name} is private` };
    if (owner.pkg.exports === undefined) return { public: true, why: `${name} is published with no "exports" map, so every file can be imported` };
    const s = stem(path);
    const e = entriesOf(owner.dir, owner.pkg);
    return [s, s.replace(/\/index$/, "")].some((x) => e.stems.has(x) || e.patterns.some((p) => p.test(x)))
      ? { public: true, why: `entry of published package ${name}` }
      : { public: false, why: `not an entry of published package ${name}` };
  };
}

// ── Gate 2: API contract ─────────────────────────────────────────────────────

export const INTERNAL_SIGNATURES = "internal signature changes";

const SCHEMA_FILE = /(schema|catalog|openapi|swagger)[^/]*$|\.(proto|graphql|avsc)$/i;
const EXPORT_DECL = /^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(function\*?|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;
const API_ROUTE = [
  /path\s*===\s*["'`](\/[^"'`]*)["'`]/,
  /\.(?:get|post|put|patch|delete|route)\(\s*["'`](\/[^"'`]*)["'`]/,
  /<Route\b[^>]*\bpath=["'{`]+([^"'}`]+)/,
];

/** Public signature of an exported declaration, without its value or body. */
function signature(text: string): string {
  const t = text.trim();
  const kind = t.match(EXPORT_DECL)![1];
  if (["const", "let", "var"].includes(kind)) {
    const arrow = t.match(/^(.*?=\s*(?:async\s*)?\(.*?\)\s*(?::[^=]+)?=>)/);
    if (arrow) return arrow[1].replace(/\s+/g, " ");
    return t.split(/\s=\s|\s=$/)[0].replace(/\s+/g, " ");
  }
  if (kind === "type") return t.split(/\s=\s|\s=$/)[0].replace(/\s+/g, " ");
  return t.replace(/\s*\{\s*\}?\s*;?$/, "").replace(/\s+/g, " ");
}

/** A route or handler definition: a path comparison, a router call or a JSX route. */
export const isRouteLine = (text: string) => routeOf(text) !== null;

function routeOf(text: string): string | null {
  for (const p of API_ROUTE) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

function apiContract(diff: Diff): GateResult {
  const breaking: string[] = [];
  const additive: string[] = [];
  const moved: Move[] = [];
  const internal: { at: string; why: string }[] = [];
  const unknown: { at: string; why: string }[] = [];
  const moves = moveIndex(diff);
  const reachable = publicModules(diff, diff.base);
  // Whether an export's verdict was read from package.json; routes and schema lines are read from code.
  let readManifests = false;
  /** A removed route is breaking unless it moved; a removed export also only when its module is public. */
  const broken = (l: Line, kind: Move["kind"]) => {
    const m = moves.find(l, kind);
    if (m) return void moved.push(m);
    const pub: Reachability = kind === "export" ? reachable(l.file) : { public: true, why: "" };
    // An export whose manifest could not be read goes to "export reachability" (assumed), not this verdict.
    if (kind === "export" && pub.public !== null) readManifests = true;
    const entry = { at: ref(l, diff.base), why: `${l.file}: ${pub.why}` };
    if (pub.public === true) breaking.push(entry.at);
    else if (pub.public === false) internal.push(entry);
    else unknown.push(entry);
  };
  for (const f of diff.files) {
    const addedSigs = new Map<string, Line[]>();
    const addedRoutes = new Set<string>();
    for (const l of f.added) {
      const m = l.text.match(EXPORT_DECL);
      if (m) (addedSigs.get(m[2]) ?? addedSigs.set(m[2], []).get(m[2])!).push(l);
      const r = routeOf(l.text);
      if (r) addedRoutes.add(r);
    }
    const removedNames = new Set<string>();
    const removedRoutes = new Set<string>();
    for (const l of f.removed) {
      const m = l.text.match(EXPORT_DECL);
      if (m) {
        removedNames.add(m[2]);
        const again = addedSigs.get(m[2]) ?? [];
        if (!again.some((a) => signature(a.text) === signature(l.text))) broken(l, "export");
      }
      const r = routeOf(l.text);
      if (r) {
        removedRoutes.add(r);
        if (!addedRoutes.has(r)) broken(l, "route");
      }
    }
    for (const [name, ls] of addedSigs) if (!removedNames.has(name)) additive.push(...ls.map((l) => ref(l)));
    for (const l of f.added) {
      const r = routeOf(l.text);
      if (r && !removedRoutes.has(r)) additive.push(ref(l));
    }
    if (SCHEMA_FILE.test(f.path)) {
      const addedText = new Set(f.added.map((l) => l.text.trim()));
      for (const l of f.removed) if (l.text.trim() && !addedText.has(l.text.trim())) breaking.push(ref(l, diff.base));
      const entryLines = f.added.filter((l) => /^\s*["']?name["']?\s*:/.test(l.text));
      additive.push(...(entryLines.length ? entryLines : f.added.filter((l) => l.text.trim())).map((l) => ref(l)));
    }
  }
  // A moved export or route lands as an added line; it adds no surface.
  const landed = new Set(moved.map((m) => m.to));
  const surface = [...new Set(additive)].filter((r) => !landed.has(r));
  const checks: GateCheck[] = [
    {
      name: "breaking change to route, schema or public signature",
      status: breaking.length ? "trip" : "pass",
      // The verdict on a removed export rests on package.json (which modules are published), a declared input.
      source: readManifests ? "declared" : "measured",
      evidence: [...new Set(breaking)],
      note:
        (breaking.length ? "removed or changed API surface" : "no route, schema or exported signature removed or changed") +
        (readManifests ? "; whether a removed or changed export is public is read from package.json (declared)" : ""),
    },
  ];
  if (unknown.length)
    checks.push({
      name: "export reachability",
      status: "unverifiable",
      source: "assumed",
      evidence: unknown.map((i) => i.at),
      note: `removed or changed exports whose reach outside the repo cannot be read (${[...new Set(unknown.map((i) => i.why))].join("; ")})`,
    });
  if (moved.length) checks.push(movedCheck(moved, "routes and exports"));
  if (internal.length)
    checks.push({
      name: INTERNAL_SIGNATURES,
      status: "pass",
      // Whether a module is published is read from package.json: declared config.
      source: "declared",
      evidence: internal.map((i) => i.at),
      note: `removed or changed exports in modules not reachable from outside the repo (${[...new Set(internal.map((i) => i.why))].join("; ")}): an internal refactor, not a contract break; lowers confidence one notch`,
    });
  if (surface.length)
    checks.push({
      name: "additive API surface",
      status: "pass",
      source: "measured",
      evidence: surface,
      note: "added routes, schema entries or exports only",
    });
  const status = worst(checks.map((c) => c.status));
  return { gate: 2, name: "API contract", status, route: routeFor(status), checks };
}

// ── Gate 3: destructive schema or data change ────────────────────────────────

const MIGRATION_FILE = /(^|\/)(migrations?|migrate)\/|\.sql$/i;
// Schema drops and alters cannot be row-scoped: destructive wherever they appear.
const SCHEMA_DESTRUCTIVE = [
  /\bDROP\s+(TABLE|COLUMN|INDEX|SCHEMA|DATABASE|VIEW|TYPE)\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\s+TABLE\b.*\b(DROP|ALTER\s+COLUMN|RENAME|TYPE)\b/i,
];
// Row writes are destructive in a migration or SQL file (they run once, at release, over existing
// data), or when the statement has no WHERE clause. Parameterised, row-scoped CRUD in app code is not.
const ROW_WRITES = [/\bDELETE\s+FROM\b/i, /\bUPDATE\s+[A-Za-z_"][\w".]*\s*(SET\b|$)/];
const ORM_BULK = /\.(updateMany|deleteMany|bulkWrite|bulkCreate|bulkUpdate|destroy|truncate)\s*\(/;
const ADDITIVE_DDL = /\b(CREATE\s+(TABLE|INDEX|VIEW)|ADD\s+COLUMN)\b/i;
const INSERT = /\bINSERT\s+INTO\b/i;

// A line that starts another statement ends the one being read.
const NEXT_STATEMENT = /^\s*(await\b|const\b|let\b|return\b|}|SELECT\b|INSERT\b|UPDATE\b|DELETE\b|WITH\b)/i;

/** The statement from a match: up to its closing backtick or semicolon, or the next statement; at most 12 lines. */
export function statementAt(lines: string[], index: number, from: number): string {
  const window = [lines[index].slice(from)];
  for (const l of lines.slice(index + 1, index + 12)) {
    if (NEXT_STATEMENT.test(l)) break;
    window.push(l);
  }
  const text = window.join("\n");
  const end = text.search(/[`;]/);
  return end === -1 ? text : text.slice(0, end);
}

export interface DataWrites {
  destructive: string[];
  additive: string[];
  migrations: string[];
  /** destructive-looking statements that were removed in one place and added verbatim in another */
  moved: Move[];
}

function movedCheck(moved: Move[], what: string): GateCheck {
  return {
    name: `moved ${what}`,
    status: "pass",
    source: "measured",
    evidence: [...new Set(moved.flatMap((m) => [m.from, m.to]))],
    note: `removed and re-added in the diff (whitespace normalised; SQL by whole statement, routes by their line, exports by signature, so a changed handler or body is not seen), so not a drop: ${moveText(moved)}`,
  };
}

/** The gate 3 detector. The reversibility signal reuses its destructive hits as "persisted writes". */
export function dataWrites(diff: Diff): DataWrites {
  const git = diff.repo ? new Git(diff.repo) : null;
  const destructive: string[] = [];
  const additive: string[] = [];
  const moved: Move[] = [];
  const moves = moveIndex(diff);
  for (const f of diff.files) {
    const migration = MIGRATION_FILE.test(f.path);
    // Only code, SQL and migration files run; SQL quoted in docs or config does not.
    if (!migration && !CODE_FILE.test(f.path)) continue;
    let lines = git?.show(diff.head, f.path)?.split("\n");
    if (!lines) {
      lines = [];
      for (const l of f.added) lines[l.line - 1] = l.text;
      lines = Array.from(lines, (t) => t ?? "");
    }
    for (const l of f.added) {
      const scoped = (m: RegExpMatchArray | null) =>
        m !== null && !migration && /\bWHERE\b/i.test(statementAt(lines!, l.line - 1, m.index ?? 0));
      const row = ROW_WRITES.map((p) => l.text.match(p)).find((m) => m) ?? null;
      const bulk = l.text.match(ORM_BULK);
      if (SCHEMA_DESTRUCTIVE.some((p) => p.test(l.text)) || (row && !scoped(row)) || (bulk && !scoped(bulk))) {
        // A statement moved from elsewhere already ran there; in a migration or SQL file it may run again under its new name.
        const m = migration ? null : moves.find(l, "SQL statement");
        if (m) moved.push(m);
        else destructive.push(ref(l));
      } else if (ADDITIVE_DDL.test(l.text) || (migration && INSERT.test(l.text))) additive.push(ref(l));
    }
    // Removing a table or column definition is a destructive schema change.
    for (const l of f.removed)
      if (/\bCREATE\s+TABLE\b|\bADD\s+COLUMN\b/i.test(l.text)) {
        const m = moves.find(l, "SQL statement");
        if (m) moved.push(m);
        else destructive.push(ref(l, diff.base));
      }
  }
  return { destructive, additive, migrations: diff.files.filter((f) => MIGRATION_FILE.test(f.path)).map((f) => f.path), moved };
}

function destructiveData(diff: Diff): GateResult {
  const { destructive, additive, migrations, moved } = dataWrites(diff);
  const checks: GateCheck[] = [
    {
      name: "destructive schema change or mutation of existing data",
      status: destructive.length ? "trip" : "pass",
      source: "measured",
      evidence: destructive,
      note: destructive.length
        ? "schema drop/alter, or UPDATE/DELETE/ORM bulk write without a WHERE clause or in a migration/SQL file"
        : `no schema drop/alter and no unscoped or migration UPDATE/DELETE/ORM bulk write in ${diff.added.length} added lines`,
    },
  ];
  if (migrations.length || additive.length)
    checks.push({
      name: "additive schema change",
      status: "pass",
      source: "measured",
      evidence: additive,
      note: migrations.length ? `migrations touched: ${migrations.join(", ")}` : "additive DDL only",
    });
  if (moved.length) checks.push(movedCheck(moved, "schema statements"));
  const status = worst(checks.map((c) => c.status));
  return { gate: 3, name: "Destructive schema or data change", status, route: routeFor(status), checks };
}

// Gates 2 and 3 raise to a human (section 1a items 2 and 3); gate 1 routes itself above.
// Unverifiable routes to a human, never blocks (section 2).
function routeFor(status: GateStatus): GateRoute {
  if (status === "pass") return "none";
  if (status === "unverifiable") return POLICY.gates.unverifiable as GateRoute;
  return "human";
}

export function runGates(diff: Diff, pr: PrMeta | null): GateResult[] {
  return [tableStakes(diff, pr), apiContract(diff), destructiveData(diff)];
}
