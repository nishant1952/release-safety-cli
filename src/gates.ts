// Section 1a and the appendix "Gates (1a)" table. Gates are not scored: each returns
// pass / trip / unverifiable with evidence. Section 2: "if a condition cannot be verified,
// route to a human, do not block."
import { ref, type Diff, type Line } from "./diff";
import { POLICY } from "./policy";
import type { PrMeta } from "./pr";
import type { GateCheck, GateResult, GateRoute, GateStatus } from "./types";

const worst = (statuses: GateStatus[]): GateStatus =>
  statuses.includes("trip") ? "trip" : statuses.includes("unverifiable") ? "unverifiable" : "pass";

function scan(lines: Line[], patterns: RegExp[], base: string): string[] {
  return lines.filter((l) => patterns.some((p) => p.test(l.text))).map((l) => ref(l, base));
}

// ── Gate 1: table stakes ─────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /(secret|passw(or)?d|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i,
  /[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/i,
];

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

function tableStakes(diff: Diff, pr: PrMeta | null): GateResult {
  const lines = diff.added;
  const regexCheck = (name: string, patterns: RegExp[]): GateCheck => {
    const hits = scan(lines, patterns, diff.base);
    return {
      name,
      status: hits.length ? "trip" : "pass",
      source: "measured",
      evidence: hits,
      note: hits.length ? `${hits.length} added line(s) match` : `no match in ${lines.length} added lines`,
    };
  };
  const checks: GateCheck[] = [
    regexCheck("secrets", SECRET_PATTERNS),
    regexCheck("PII", PII_PATTERNS),
    regexCheck("hardcoded environment values", HARDCODED_ENV_PATTERNS),
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
  return { gate: 1, name: "Table stakes", status, route: routeFor(1, status), checks };
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
  return { gate: 2, name: "API contract", status, route: routeFor(2, status), checks };
}

// ── Gate 3: destructive schema or data change ────────────────────────────────

const MIGRATION_FILE = /(^|\/)(migrations?|migrate)\/|\.sql$/i;
const DESTRUCTIVE_SQL = [
  /\bDROP\s+(TABLE|COLUMN|INDEX|SCHEMA|DATABASE|VIEW|TYPE)\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\s+TABLE\b.*\b(DROP|ALTER\s+COLUMN|RENAME|TYPE)\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bUPDATE\s+[A-Za-z_"][\w".]*\s*(SET\b|$)/,
];
const ORM_BULK = /\.(updateMany|deleteMany|bulkWrite|bulkCreate|bulkUpdate|destroy|truncate)\s*\(/;
const ADDITIVE_SQL = /\b(CREATE\s+(TABLE|INDEX|VIEW)|ADD\s+COLUMN|INSERT\s+INTO)\b/i;
/** The gate 3 detector, reused by the reversibility signal for "persisted writes". */
export const PERSISTED_WRITE_PATTERNS = [...DESTRUCTIVE_SQL, ORM_BULK, ADDITIVE_SQL];

function destructiveData(diff: Diff): GateResult {
  const destructive = scan(diff.added, [...DESTRUCTIVE_SQL, ORM_BULK], diff.base);
  // Removing a table or column definition is a destructive schema change.
  destructive.push(...scan(diff.removed, [/\bCREATE\s+TABLE\b/i, /\bADD\s+COLUMN\b/i], diff.base));
  const migrations = diff.files.filter((f) => MIGRATION_FILE.test(f.path)).map((f) => f.path);
  const additive = scan(diff.added, [ADDITIVE_SQL], diff.base);
  const checks: GateCheck[] = [
    {
      name: "destructive schema change or mutation of existing data",
      status: destructive.length ? "trip" : "pass",
      source: "measured",
      evidence: destructive,
      note: destructive.length
        ? "raw UPDATE/DELETE, DDL drop/alter, or ORM bulk write in the diff"
        : `no raw UPDATE/DELETE, DDL drop/alter or ORM bulk write in ${diff.added.length} added lines`,
    },
  ];
  if (migrations.length || additive.length)
    checks.push({
      name: "additive schema change",
      status: "pass",
      source: "measured",
      evidence: additive,
      note: migrations.length ? `migrations touched: ${migrations.join(", ")}` : "additive DDL or inserts only",
    });
  const status = worst(checks.map((c) => c.status));
  return { gate: 3, name: "Destructive schema or data change", status, route: routeFor(3, status), checks };
}

// Gate 1 failures block the release; gates 2 and 3 raise to a human (section 1a items 2 and 3).
// Unverifiable routes to a human, never blocks (section 2).
function routeFor(gate: 1 | 2 | 3, status: GateStatus): GateRoute {
  if (status === "pass") return "none";
  if (status === "unverifiable") return POLICY.gates.unverifiable as GateRoute;
  return gate === 1 ? "block" : "human";
}

export function runGates(diff: Diff, pr: PrMeta | null): GateResult[] {
  return [tableStakes(diff, pr), apiContract(diff), destructiveData(diff)];
}
