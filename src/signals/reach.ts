// W 1b item 2, appendix Damage rank 2: "Reach: which systems break, and what they are worth."
// Measured part: calls on added lines are followed through their definitions to the /api/...
// endpoints they hit, then to the apps/api handler for that path and what the handler calls.
// Worth: tiers in the metrics catalog are a declared input; without them, W 2 says "Assume ...
// the reach is wide".
import { Node, SyntaxKind } from "ts-morph";
import { loadProject, repoPath } from "../ast";
import type { Diff } from "../diff";
import { Git } from "../git";
import type { Signal } from "../types";

export const CATALOG = "apps/api/src/infrastructure/observability/metrics-catalog.ts";
const MAX_DEPTH = 4;
const API_PATH = /^\/api\//;

export interface Endpoint {
  path: string;
  /** added call line -> definition line holding the /api literal */
  via: string[];
}

export interface Handler {
  path: string;
  method: string;
  at: string;
  calls: string[];
}

export interface ReachFacts {
  endpoints: Endpoint[];
  handlers: Handler[];
  /** catalog entries and how many declare a tier; null when the catalog file is not in the repo */
  catalog: { entries: number; tiers: { name: string; tier: string; source: string }[] } | null;
}

/** /api/... literals in a node (template literals keep their static head), with their line. */
function apiLiterals(node: Node): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  for (const n of node.getDescendants()) {
    let text: string | null = null;
    if (Node.isStringLiteral(n) || Node.isNoSubstitutionTemplateLiteral(n)) text = n.getLiteralValue();
    else if (Node.isTemplateExpression(n)) text = n.getHead().getLiteralText() + "*";
    if (text && API_PATH.test(text)) out.push({ text, line: n.getStartLineNumber() });
  }
  return out;
}

function followCalls(diff: Diff): Endpoint[] {
  const git = new Git(diff.repo);
  const changedTs = diff.files.filter((f) => /\.(tsx?)$/.test(f.path) && !f.path.startsWith("apps/api/")).map((f) => f.path);
  if (!changedTs.length) return [];
  const roots = [...new Set(changedTs.map((p) => p.split("/").slice(0, 2).join("/")))];
  const files = git.listFiles(diff.head).filter((f) => roots.some((r) => f.startsWith(r + "/")));
  const project = loadProject(diff.repo, diff.head, files);
  const found = new Map<string, Set<string>>();

  const visit = (body: Node, chain: string[], depth: number, seen: Set<Node>) => {
    const lits = apiLiterals(body);
    if (lits.length) {
      const file = repoPath(body.getSourceFile());
      for (const l of lits) {
        const hops = [...chain.slice(0, -1), `${file}:${l.line}`];
        (found.get(l.text) ?? found.set(l.text, new Set()).get(l.text)!).add(hops.join(" -> "));
      }
      return;
    }
    if (depth >= MAX_DEPTH) return;
    for (const call of body.getDescendantsOfKind(SyntaxKind.CallExpression)) step(call, chain, depth + 1, seen);
  };
  const step = (call: Node, chain: string[], depth: number, seen: Set<Node>) => {
    if (!Node.isCallExpression(call)) return;
    const e = call.getExpression();
    const id = Node.isPropertyAccessExpression(e) ? e.getNameNode() : Node.isIdentifier(e) ? e : null;
    if (!id) return;
    for (const def of id.getDefinitionNodes()) {
      const file = def.getSourceFile().getFilePath();
      if (file.includes("/node_modules/") || seen.has(def)) continue;
      seen.add(def);
      const at = `${repoPath(def.getSourceFile())}:${def.getStartLineNumber()}`;
      visit(def, [...chain, at], depth, seen);
    }
  };

  for (const f of diff.files) {
    const sf = project.getSourceFile(`/${f.path}`);
    if (!sf) continue;
    const added = new Set(f.added.map((l) => l.line));
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression))
      if (added.has(call.getStartLineNumber()) && !Node.isCallExpression(call.getExpression()))
        step(call, [`${f.path}:${call.getStartLineNumber()}`], 0, new Set());
  }
  return [...found.keys()].sort().map((path) => ({ path, via: [...found.get(path)!].sort() }));
}

/** Handlers in apps/api matching `path === "<endpoint>"`, and the services or imports they call. */
function findHandlers(diff: Diff, endpoints: Endpoint[]): Handler[] {
  const git = new Git(diff.repo);
  const out: Handler[] = [];
  const apiFiles = git.listFiles(diff.head).filter((f) => f.startsWith("apps/api/") && /\.ts$/.test(f));
  for (const file of apiFiles) {
    const text = git.show(diff.head, file);
    if (!text || !text.includes("path ===")) continue;
    const lines = text.split("\n");
    const imported = [...text.matchAll(/import\s*\{([^}]+)\}\s*from\s*["'][^"']+["']/g)]
      .flatMap((m) => m[1].split(",").map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()!))
      .filter((n) => n && /^[a-z]/.test(n));
    for (const ep of endpoints) {
      const exact = ep.path.endsWith("*") ? null : ep.path;
      lines.forEach((line, i) => {
        const m = line.match(/path\s*===\s*["'`]([^"'`]+)["'`](?:.*req\.method\s*===\s*["'](\w+)["'])?/);
        if (!m || (exact ? m[1] !== exact : !m[1].startsWith(ep.path.slice(0, -1)))) return;
        let end = i + 1;
        while (end < lines.length && !/\bif\s*\(\s*path\b|path\.(startsWith|match)\(/.test(lines[end])) end++;
        const block = lines.slice(i, end).join("\n");
        const calls = new Set<string>();
        for (const c of block.matchAll(/\b(services\.\w+\.\w+)\s*\(/g)) calls.add(c[1]);
        for (const n of imported) if (new RegExp(`\\b${n}\\s*\\(`).test(block)) calls.add(n);
        out.push({ path: m[1], method: m[2] ?? "ANY", at: `${file}:${i + 1}`, calls: [...calls].sort() });
      });
    }
  }
  const key = (h: Handler) => [h.at.replace(/:\d+$/, ""), Number(h.at.match(/:(\d+)$/)![1])] as const;
  return out.sort((a, b) => {
    const [fa, la] = key(a);
    const [fb, lb] = key(b);
    return fa < fb ? -1 : fa > fb ? 1 : la - lb;
  });
}

function readCatalog(diff: Diff): ReachFacts["catalog"] {
  const text = new Git(diff.repo).show(diff.head, CATALOG);
  if (!text) return null;
  const entries = text.split(/\n\s*\{\s*\n/).slice(1);
  const tiers = entries
    .map((e) => ({
      name: e.match(/name:\s*["']([^"']+)/)?.[1] ?? "?",
      tier: e.match(/tier:\s*["']?([\w-]+)/)?.[1] ?? null,
      source: e.match(/source:\s*["']([^"']+)/)?.[1] ?? "",
    }))
    .filter((e): e is { name: string; tier: string; source: string } => e.tier !== null);
  return { entries: entries.length, tiers };
}

export function reachFacts(diff: Diff): ReachFacts {
  const endpoints = followCalls(diff);
  return {
    endpoints,
    handlers: findHandlers(diff, endpoints),
    catalog: readCatalog(diff),
  };
}

export function reachSignal(facts: ReachFacts): Signal<"high" | "low"> {
  const systems = facts.handlers.map((h) => `${h.method} ${h.path}${h.calls.length ? ` (${h.calls.join(", ")})` : ""}`);
  const evidence = [
    ...new Set([...facts.endpoints.flatMap((e) => e.via.flatMap((v) => v.split(" -> "))), ...facts.handlers.map((h) => h.at)]),
  ];
  const reached = systems.length ? `measured: calls reach ${systems.join("; ")}` : "measured: no calls from changed code reach an apps/api handler";
  // Tiers apply to a reached system when a tiered catalog entry's source names one of its calls.
  const matched = (facts.catalog?.tiers ?? []).filter((t) =>
    facts.handlers.some((h) => h.calls.some((c) => t.source.includes(c.replace(/^services\./, "")))),
  );
  if (!facts.catalog || !matched.length) {
    const why = !facts.catalog
      ? `the metrics catalog (${CATALOG}) is not in the repo`
      : facts.catalog.tiers.length
        ? "no catalog tier matches the reached systems"
        : `the metrics catalog declares no tier for any of its ${facts.catalog.entries} entries`;
    return {
      name: "Reach",
      value: "high",
      source: "assumed",
      evidence,
      note: `${reached}. Worth unknown because ${why}, so reach is assumed wide`,
    };
  }
  const value = matched.every((t) => t.tier === "low") ? "low" : "high";
  return {
    name: "Reach",
    value,
    source: "declared",
    evidence,
    note: `${reached}. Catalog tiers: ${matched.map((t) => `${t.name}=${t.tier}`).join(", ")}`,
  };
}
