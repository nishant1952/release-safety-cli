// W 1b item 1, appendix Damage rank 1: "Path: who actually reaches this code"; extracted from the
// "Call graph, plus a search for shared route ... names". Here: the import graph from each changed
// file up to an entry point, then, inside TSX files, which component renders which up to a <Route>.
import { posix } from "node:path";
import { Node, SyntaxKind, type SourceFile } from "ts-morph";
import { loadProject, repoPath } from "../ast";
import type { Diff } from "../diff";
import { Git } from "../git";
import type { Signal } from "../types";

const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs)$/;
const RESOLVE_EXT = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", "/index.ts", "/index.tsx", "/index.js"];
const SCRIPT_RUNNER = /\b(?:bun|node|tsx|ts-node)\b(?:\s+--?[\w-]+)*\s+([\w./-]+\.(?:ts|tsx|js|mjs))/g;

export interface Hop {
  /** importer file */
  file: string;
  /** line of the import statement in the importer */
  line: number;
}

export interface RouteReach {
  /** component chain from the changed component up to the routed one, e.g. ProfileMenu < Shell */
  chain: string[];
  /** JSX usage lines along the chain and the <Route> line */
  evidence: string[];
  routePath: string;
  childPaths: string[];
  wrappers: string[];
}

export interface PathFacts {
  entries: string[];
  /** changed file -> importer chain up to an entry point (empty if it is an entry), null if unreached */
  chains: Map<string, Hop[] | null>;
  routes: RouteReach[];
}

function resolveSpec(from: string, spec: string, files: Set<string>, pkgs: Map<string, string>): string | null {
  let base: string | null = null;
  if (spec.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(from), spec));
  else {
    for (const [name, dir] of pkgs)
      if (spec === name || spec.startsWith(name + "/")) {
        const rest = spec.slice(name.length).replace(/^\//, "");
        base = rest ? posix.join(dir, rest) : posix.join(dir, "src/index");
      }
  }
  if (base === null) return null;
  for (const ext of RESOLVE_EXT) if (files.has(base + ext)) return base + ext;
  return null;
}

function entryPoints(git: Git, rev: string, files: string[]): string[] {
  const set = new Set(files);
  const entries = new Set<string>();
  for (const manifest of files.filter((f) => /^(apps|packages)\/[^/]+\/package\.json$/.test(f))) {
    const dir = posix.dirname(manifest);
    const pkg = JSON.parse(git.show(rev, manifest) ?? "{}");
    for (const script of Object.values<string>(pkg.scripts ?? {}))
      for (const m of script.matchAll(SCRIPT_RUNNER)) {
        const p = posix.join(dir, m[1]);
        if (set.has(p)) entries.add(p);
      }
    const html = git.show(rev, posix.join(dir, "index.html"));
    for (const m of html?.matchAll(/<script[^>]*\bsrc=["']\/?([^"']+)["']/g) ?? []) {
      const p = posix.join(dir, m[1]);
      if (set.has(p)) entries.add(p);
    }
  }
  return [...entries].sort();
}

function workspacePackages(git: Git, rev: string, files: string[]): Map<string, string> {
  const pkgs = new Map<string, string>();
  for (const manifest of files.filter((f) => /^(apps|packages)\/[^/]+\/package\.json$/.test(f))) {
    const name = JSON.parse(git.show(rev, manifest) ?? "{}").name;
    if (name) pkgs.set(name, posix.dirname(manifest));
  }
  return pkgs;
}

/** importer -> imported edges, with the line of each import statement. */
function importEdges(sources: SourceFile[], files: Set<string>, pkgs: Map<string, string>) {
  const importers = new Map<string, Hop[]>();
  for (const sf of sources) {
    const from = repoPath(sf);
    const specs: { spec: string; line: number }[] = [];
    for (const d of [...sf.getImportDeclarations(), ...sf.getExportDeclarations()]) {
      const spec = d.getModuleSpecifierValue();
      // Cite the line holding the module specifier, so multi-line imports quote the `from` line.
      if (spec) specs.push({ spec, line: d.getModuleSpecifier()!.getStartLineNumber() });
    }
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const arg = call.getArguments()[0];
      if (call.getExpression().getKind() === SyntaxKind.ImportKeyword && arg && Node.isStringLiteral(arg))
        specs.push({ spec: arg.getLiteralValue(), line: call.getStartLineNumber() });
    }
    for (const { spec, line } of specs) {
      const to = resolveSpec(from, spec, files, pkgs);
      if (to) (importers.get(to) ?? importers.set(to, []).get(to)!).push({ file: from, line });
    }
  }
  return importers;
}

/** Shortest importer chain from a file up to any entry point (BFS, deterministic order). */
function chainToEntry(file: string, entries: Set<string>, importers: Map<string, Hop[]>): Hop[] | null {
  if (entries.has(file)) return [];
  const prev = new Map<string, Hop & { to: string }>();
  const queue = [file];
  const seen = new Set([file]);
  while (queue.length) {
    const cur = queue.shift()!;
    const hops = [...(importers.get(cur) ?? [])].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
    for (const h of hops) {
      if (seen.has(h.file)) continue;
      seen.add(h.file);
      prev.set(h.file, { ...h, to: cur });
      if (entries.has(h.file)) {
        const chain: Hop[] = [];
        for (let at = h.file; at !== file; at = prev.get(at)!.to) chain.unshift({ file: prev.get(at)!.file, line: prev.get(at)!.line });
        return chain;
      }
      queue.push(h.file);
    }
  }
  return null;
}

/** Top-level components (function declarations or const arrows) in a file, with line spans. */
function components(sf: SourceFile) {
  const out: { name: string; node: Node; start: number; end: number }[] = [];
  for (const f of sf.getFunctions()) {
    const name = f.getName();
    if (name) out.push({ name, node: f, start: f.getStartLineNumber(), end: f.getEndLineNumber() });
  }
  for (const v of sf.getVariableDeclarations()) {
    const init = v.getInitializer();
    if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init)))
      out.push({ name: v.getName(), node: v, start: v.getStartLineNumber(), end: v.getEndLineNumber() });
  }
  return out;
}

/** From each changed component, follow "rendered by" up to a <Route element={...}> in the same file. */
function routeReach(sf: SourceFile, changedLines: number[]): RouteReach[] {
  const path = repoPath(sf);
  const comps = components(sf);
  const changed = comps.filter((c) => changedLines.some((l) => l >= c.start && l <= c.end));
  const out: RouteReach[] = [];
  const seenRoute = new Set<string>();
  for (const start of changed) {
    // BFS upward through JSX usages: <Name ...> inside another component, or inside a Route's element.
    const queue: { name: string; chain: string[]; evidence: string[] }[] = [{ name: start.name, chain: [start.name], evidence: [] }];
    const visited = new Set([start.name]);
    while (queue.length) {
      const cur = queue.shift()!;
      const usages = sf
        .getDescendants()
        .filter((n) => (Node.isJsxSelfClosingElement(n) || Node.isJsxOpeningElement(n)) && n.getTagNameNode().getText() === cur.name);
      for (const use of usages) {
        const usageRef = `${path}:${use.getStartLineNumber()}`;
        const elementAttr = use.getFirstAncestor((a) => Node.isJsxAttribute(a) && a.getNameNode().getText() === "element");
        const route = elementAttr?.getFirstAncestor((a) => Node.isJsxOpeningElement(a) || Node.isJsxSelfClosingElement(a));
        if (route && (Node.isJsxOpeningElement(route) || Node.isJsxSelfClosingElement(route)) && route.getTagNameNode().getText() === "Route") {
          const key = `${route.getStartLineNumber()}`;
          if (seenRoute.has(key)) continue;
          seenRoute.add(key);
          const attr = (n: string) => {
            const a = route.getAttribute(n);
            return a && Node.isJsxAttribute(a) ? a.getInitializer()?.getText().replace(/^["'{]|["'}]$/g, "") ?? "" : null;
          };
          const routeEl = Node.isJsxOpeningElement(route) ? route.getParent() : null;
          const childPaths = routeEl && Node.isJsxElement(routeEl)
            ? routeEl.getJsxChildren().flatMap((ch) => {
                const el = Node.isJsxElement(ch) ? ch.getOpeningElement() : Node.isJsxSelfClosingElement(ch) ? ch : null;
                if (!el || el.getTagNameNode().getText() !== "Route") return [];
                const p = el.getAttribute("path");
                if (p && Node.isJsxAttribute(p)) return [p.getInitializer()?.getText().replace(/^["'{]|["'}]$/g, "") ?? ""];
                return el.getAttribute("index") ? ["(index)"] : [];
              })
            : [];
          const wrappers = elementAttr!
            .getDescendants()
            .filter((n) => Node.isJsxOpeningElement(n) || Node.isJsxSelfClosingElement(n))
            .map((n) => (n as any).getTagNameNode().getText() as string)
            .filter((t) => t !== cur.name && /^[A-Z]/.test(t));
          out.push({
            chain: cur.chain,
            evidence: [...cur.evidence, usageRef, `${path}:${route.getStartLineNumber()}`],
            routePath: attr("path") ?? (attr("index") !== null ? "(index)" : "(layout)"),
            childPaths,
            wrappers: [...new Set(wrappers)],
          });
          continue;
        }
        const owner = comps.find((c) => use.getStartLineNumber() >= c.start && use.getEndLineNumber() <= c.end && c.name !== cur.name);
        if (owner && !visited.has(owner.name)) {
          visited.add(owner.name);
          queue.push({ name: owner.name, chain: [...cur.chain, owner.name], evidence: [...cur.evidence, usageRef] });
        }
      }
    }
  }
  return out;
}

export function pathFacts(diff: Diff, ignoreDeclared = false): PathFacts {
  const git = new Git(diff.repo);
  const all = git.listFiles(diff.head);
  const files = new Set(all);
  const sources = all.filter((f) => /^(apps|packages)\//.test(f) && SOURCE.test(f) && !f.endsWith(".d.ts"));
  const project = loadProject(diff.repo, diff.head, sources);
  const pkgs = workspacePackages(git, diff.head, all);
  const importers = importEdges(project.getSourceFiles(), files, pkgs);
  // Entry points are read from package.json scripts and index.html: declared config.
  const entries = ignoreDeclared ? [] : entryPoints(git, diff.head, all);
  const entrySet = new Set(entries);
  const chains = new Map<string, Hop[] | null>();
  const routes: RouteReach[] = [];
  for (const f of diff.files.filter((f) => f.status !== "deleted")) {
    chains.set(f.path, chainToEntry(f.path, entrySet, importers));
    const sf = project.getSourceFile(`/${f.path}`);
    if (sf && /\.(tsx|jsx)$/.test(f.path)) routes.push(...routeReach(sf, f.added.map((l) => l.line)));
  }
  return { entries, chains, routes };
}

export function pathSignal(facts: PathFacts): Signal<"live" | "unreached"> {
  const routeText = facts.routes.map((r) => {
    const children = r.childPaths.length ? ` with child routes ${r.childPaths.join(", ")}` : "";
    const wrap = r.wrappers.length ? ` behind ${r.wrappers.join(", ")}` : "";
    return `${r.chain.join(" < ")} is mounted by route ${r.routePath}${children}${wrap}`;
  });
  const routeEvidence = facts.routes.flatMap((r) => r.evidence);
  // W 2: "Damage (1b): missing data rounds up. Assume the path is live".
  if (!facts.entries.length)
    return {
      name: "Path",
      value: "live",
      source: "assumed",
      evidence: [...new Set(routeEvidence)],
      note: `no entry points known (package.json scripts and index.html not read), so the path is assumed live` +
        (routeText.length ? `; measured in code: ${routeText.join("; ")}` : ""),
    };
  const live = [...facts.chains].filter(([, c]) => c !== null);
  const unreached = [...facts.chains].filter(([, c]) => c === null).map(([f]) => f);
  const evidence: string[] = [];
  const parts: string[] = [];
  for (const [file, chain] of live) {
    const entry = chain!.length ? chain![chain!.length - 1].file : file;
    evidence.push(...chain!.map((h) => `${h.file}:${h.line}`));
    parts.push(`${file} reaches ${entry}${chain!.length ? ` in ${chain!.length} import(s)` : ""}`);
  }
  evidence.push(...routeEvidence);
  parts.push(...routeText);
  if (unreached.length) parts.push(`not imported from any entry point: ${unreached.join(", ")}`);
  return {
    name: "Path",
    value: live.length ? "live" : "unreached",
    source: "declared",
    evidence: [...new Set(evidence)],
    note: `${parts.join("; ")}. Import graph and routes measured; entry points declared by package.json scripts and index.html: ${facts.entries.join(", ")}`,
  };
}
