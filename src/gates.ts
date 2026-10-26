// Section 1a and the appendix "Gates (1a)" table. Gates are not scored: each returns
// pass / trip / unverifiable with evidence. Section 2: "if a condition cannot be verified,
// route to a human, do not block."
import { ref, type Diff, type Line } from "./diff";
import { Git } from "./git";
import { POLICY } from "./policy";
import type { PrMeta } from "./pr";
import type { GateCheck, GateResult, GateRoute, GateStatus } from "./types";

const worst = (statuses: GateStatus[]): GateStatus =>
  statuses.includes("trip") ? "trip" : statuses.includes("unverifiable") ? "unverifiable" : "pass";

// ── Gate 1: table stakes ─────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/i,
];
// A credential-named key assigned a quoted value; the value must also look like a secret.
const CREDENTIAL_ASSIGNMENT = /(?:secret|passw(?:or)?d|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)["']?\s*[:=]\s*["']([^"'\s]{8,})["']/gi;

/** Not a placeholder, not plain words (e.g. "unknown_user"), and mixes at least two character classes. */
export function looksLikeSecret(v: string): boolean {
  if (/^(\$\{.*\}|<.*>|\{\{.*\}\}|x+|\*+|changeme|example\w*|your[_-]\w+|dummy\w*|placeholder\w*)$/i.test(v)) return false;
  if (/^[A-Za-z]+([_.-][A-Za-z]+)*$/.test(v)) return false;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((c) => c.test(v)).length;
  return classes >= 2;
}

const isSecretLine = (text: string) =>
  SECRET_PATTERNS.some((p) => p.test(text)) || [...text.matchAll(CREDENTIAL_ASSIGNMENT)].some((m) => looksLikeSecret(m[1]));

const PII_PATTERNS = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b(?:\d{4}[ -]){3}\d{4}\b/,
];

const HARDCODED_ENV_PATTERNS = [
  /\bhttps?:\/\/[A-Za-z0-9.-]+(:\d+)?/,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
  /\blocalhost:\d+\b/,
];
// Hardcoded URLs and IPs matter in code that runs; docs, config files and comments are skipped.
export const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|html|py|go|rb|java|kt|rs|php|cs|swift|sh)$/;
const COMMENT_LINE = /^\s*(\/\/|#|\*|\/\*|<!--)/;
const HARDCODED = "hardcoded environment values";

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
    check("PII", lines, (t) => PII_PATTERNS.some((p) => p.test(t)), "added lines"),
    check(HARDCODED, codeLines, (t) => HARDCODED_ENV_PATTERNS.some((p) => p.test(t)), "added code lines (docs, config and comments skipped)"),
  ];
  if (pr?.checks && pr.checks.length) {
    const red = pr.checks.filter((c) => !/^(SUCCESS|NEUTRAL|SKIPPED)$/i.test(c.conclusion));
    checks.push({
      name: "required CI checks",
      status: red.length ? "trip" : "pass",
      source: "declared",
      evidence: [],
      note: red.length ? `not green: ${red.map((c) => c.name).join(", ")}` : `${pr.checks.length} checks green`,
    });
  } else {
    checks.push({
      name: "required CI checks",
      status: "unverifiable",
      source: "assumed",
      evidence: [],
      note: pr ? "the PR export has no CI check results" : "no PR export was found for this range, so CI status is unknown",
    });
  }
  const status = worst(checks.map((c) => c.status));
  // Secrets, PII and red CI block; a hardcoded value or an unverifiable check routes to a human.
  const blocks = checks.some((c) => c.status === "trip" && c.name !== HARDCODED);
  const route: GateRoute = blocks ? "block" : status === "pass" ? "none" : "human";
  return { gate: 1, name: "Table stakes", status, route, checks };
}

// ── Gate 2: API contract ─────────────────────────────────────────────────────

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
        if (!again.some((a) => signature(a.text) === signature(l.text))) breaking.push(ref(l, diff.base));
      }
      const r = routeOf(l.text);
      if (r) {
        removedRoutes.add(r);
        if (!addedRoutes.has(r)) breaking.push(ref(l, diff.base));
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
  const checks: GateCheck[] = [
    {
      name: "breaking change to route, schema or public signature",
      status: breaking.length ? "trip" : "pass",
      source: "measured",
      evidence: [...new Set(breaking)],
      note: breaking.length ? "removed or changed API surface" : "no route, schema or exported signature removed or changed",
    },
  ];
  if (additive.length)
    checks.push({
      name: "additive API surface",
      status: "pass",
      source: "measured",
      evidence: [...new Set(additive)],
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
}

/** The gate 3 detector. The reversibility signal reuses its destructive hits as "persisted writes". */
export function dataWrites(diff: Diff): DataWrites {
  const git = diff.repo ? new Git(diff.repo) : null;
  const destructive: string[] = [];
  const additive: string[] = [];
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
      if (SCHEMA_DESTRUCTIVE.some((p) => p.test(l.text)) || (row && !scoped(row)) || (bulk && !scoped(bulk))) destructive.push(ref(l));
      else if (ADDITIVE_DDL.test(l.text) || (migration && INSERT.test(l.text))) additive.push(ref(l));
    }
    // Removing a table or column definition is a destructive schema change.
    for (const l of f.removed) if (/\bCREATE\s+TABLE\b|\bADD\s+COLUMN\b/i.test(l.text)) destructive.push(ref(l, diff.base));
  }
  return { destructive, additive, migrations: diff.files.filter((f) => MIGRATION_FILE.test(f.path)).map((f) => f.path) };
}

function destructiveData(diff: Diff): GateResult {
  const { destructive, additive, migrations } = dataWrites(diff);
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
