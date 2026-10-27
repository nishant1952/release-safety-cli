// W 1c item 2, appendix Reversibility rank 2: "the change can be turned off without a redeploy";
// extracted from "Flag calls or config in the diff". Rank 4's ignore case ("Flag-wrapped changes
// with no edits outside the flag") is why every added line is classed inside or outside the flag.
import { Node, Project, SyntaxKind, type Identifier, type Project as TsProject, type SourceFile } from "ts-morph";
import { loadProject, repoPath, TS_FILE } from "../ast";
import { ref, type Diff, type Line } from "../diff";
import { nonCodeKind } from "../files";
import { Git } from "../git";
import type { Signal } from "../types";

export type LineClass = "control" | "inside" | "outside";

export interface FlagFacts {
  flags: { key: string; defaultValue: string; at: string }[];
  /** added line ref -> class; blank, comment and bracket-only lines are left out */
  lines: Map<string, LineClass>;
  /** top-level declarations classed inside because every reference to them is inside the flag */
  byCallSite: { name: string; at: string; references: number; cls: LineClass }[];
}

const ANCHOR = /@fireweave-controlpoint\s+([\w.-]+)/;
const STRUCTURAL = /^[\s{}()[\];,<>/]*$/;
const COMMENT = /^\s*(\/\/|\/\*|\*)/;

type Range = [number, number];
const span = (n: Node): Range => [n.getStartLineNumber(), n.getEndLineNumber()];

/** Line ranges a flag value controls, and the lines that read it, starting from one reference. */
function controlledBy(refNode: Node, ranges: Range[], controls: Set<number>) {
  controls.add(refNode.getStartLineNumber());
  for (let child: Node = refNode, cur = refNode.getParent(); cur; child = cur, cur = cur.getParent()) {
    if (Node.isConditionalExpression(cur) && cur.getCondition() === child) {
      ranges.push(span(cur.getWhenTrue()), span(cur.getWhenFalse()));
      return;
    }
    if (Node.isIfStatement(cur) && cur.getExpression() === child) {
      ranges.push(span(cur.getThenStatement()));
      const els = cur.getElseStatement();
      if (els) ranges.push(span(els));
      // A guard `if (!flag) return ...` as a direct body statement controls everything after it.
      const body = cur.getParent();
      const then = cur.getThenStatement();
      const returns = Node.isReturnStatement(then) || (Node.isBlock(then) && then.getStatements().some((s) => Node.isReturnStatement(s)));
      if (returns && Node.isBlock(body)) {
        const end = cur.getEndLineNumber();
        const after = body.getStatements().filter((s) => s.getStartLineNumber() > end);
        if (after.length) ranges.push([after[0].getStartLineNumber(), after[after.length - 1].getEndLineNumber()]);
      }
      return;
    }
    if (Node.isBinaryExpression(cur) && cur.getOperatorToken().getKind() === SyntaxKind.AmpersandAmpersandToken && cur.getLeft() === child) {
      ranges.push(span(cur.getRight()));
      return;
    }
    if (Node.isJsxAttribute(cur)) {
      followProp(cur, ranges, controls);
      return;
    }
    // Keep climbing through negation, grouping and || / && chains in a condition.
    if (!(Node.isPrefixUnaryExpression(cur) || Node.isParenthesizedExpression(cur) || Node.isBinaryExpression(cur) || Node.isJsxExpression(cur)))
      return;
  }
}

/** `<Comp prop={flag} />`: follow the prop into a component declared in the same file. */
function followProp(attr: Node, ranges: Range[], controls: Set<number>) {
  if (!Node.isJsxAttribute(attr)) return;
  const propName = attr.getNameNode().getText();
  const el = attr.getFirstAncestor((a) => Node.isJsxSelfClosingElement(a) || Node.isJsxOpeningElement(a));
  if (!el || !(Node.isJsxSelfClosingElement(el) || Node.isJsxOpeningElement(el))) return;
  const fn = el.getSourceFile().getFunction(el.getTagNameNode().getText());
  const binding = fn?.getParameters()[0]?.getNameNode();
  if (!binding || !Node.isObjectBindingPattern(binding)) return;
  const element = binding.getElements().find((e) => (e.getPropertyNameNode()?.getText() ?? e.getName()) === propName);
  const local = element?.getNameNode();
  if (!local || !Node.isIdentifier(local)) return;
  const body = fn!.getBody();
  for (const r of local.findReferencesAsNodes()) if (body?.containsRange(r.getPos(), r.getEnd())) controlledBy(r, ranges, controls);
}

// ── Coverage by call site ────────────────────────────────────────────────────
// A top-level declaration whose every reference sits inside a flag range (or inside another
// declaration already classed inside) only runs when the flag is on, so its lines are inside too.

interface Candidate {
  name: string;
  file: string;
  span: Range;
  /** identifiers whose references decide the class */
  names: Identifier[];
  /** import bindings: only references in the same file count (other files have their own imports) */
  sameFileOnly: boolean;
  exported: boolean;
}

const deferredBoundary = (n: Node) =>
  Node.isFunctionDeclaration(n) || Node.isFunctionExpression(n) || Node.isArrowFunction(n) || Node.isMethodDeclaration(n) ||
  Node.isConstructorDeclaration(n) || Node.isGetAccessorDeclaration(n) || Node.isSetAccessorDeclaration(n) ||
  (Node.isPropertyDeclaration(n) && !n.isStatic());

/** A call, `new`, tagged template or decorator outside every function body runs when the module loads, flag or not. */
function runsAtLoad(decl: Node): boolean {
  return decl.getDescendants().some((n) => {
    if (!(Node.isCallExpression(n) || Node.isNewExpression(n) || Node.isTaggedTemplateExpression(n) || Node.isDecorator(n))) return false;
    for (let a = n.getParent(); a && a !== decl.getParent(); a = a.getParent()) if (deferredBoundary(a)) return false;
    return true;
  });
}

/** Local names an import declaration binds. */
function importBindings(sf: SourceFile): Map<Node, Identifier[]> {
  const out = new Map<Node, Identifier[]>();
  for (const d of sf.getImportDeclarations()) {
    const ids = [d.getDefaultImport(), d.getNamespaceImport(), ...d.getNamedImports().map((s) => s.getAliasNode() ?? s.getNameNode())];
    out.set(d, ids.filter((i): i is Identifier => i !== undefined && Node.isIdentifier(i)));
  }
  return out;
}

function candidates(sf: SourceFile, added: Set<number>, baseImports: Set<string>): Candidate[] {
  const file = repoPath(sf);
  const out: Candidate[] = [];
  const touched = ([a, b]: Range) => [...added].some((l) => l >= a && l <= b);
  const imports = importBindings(sf);
  for (const st of sf.getStatements()) {
    const exported = Node.isExportable(st) && (st.isExported() || st.isDefaultExport());
    if (Node.isImportDeclaration(st)) {
      // Only bindings new since base: the rest of the line ran before the change.
      const fresh = (imports.get(st) ?? []).filter((i) => !baseImports.has(i.getText()));
      if (fresh.length && touched(span(st)))
        out.push({ name: fresh.map((i) => i.getText()).join(", "), file, span: span(st), names: fresh, sameFileOnly: true, exported: false });
      continue;
    }
    if (runsAtLoad(st)) continue;
    const named = (n: Node | undefined) => (n && Node.isIdentifier(n) ? [n] : []);
    let names: Identifier[] = [];
    if (Node.isFunctionDeclaration(st) || Node.isClassDeclaration(st) || Node.isInterfaceDeclaration(st) || Node.isTypeAliasDeclaration(st) || Node.isEnumDeclaration(st))
      names = named(st.getNameNode());
    else if (Node.isVariableStatement(st)) names = st.getDeclarations().flatMap((d) => named(d.getNameNode()));
    if (names.length && touched(span(st)))
      out.push({ name: names.map((i) => i.getText()).join(", "), file, span: span(st), names, sameFileOnly: false, exported });
  }
  return out;
}

/** Declarations whose every reference is inside a flag range, on a flag-read line or in an inside declaration, to a
 * fixed point. A declaration referenced only from flag reads (e.g. the flag client's import) is flag plumbing: control.
 * Other control lines (a prop or guard that passes the flag on) do not count: they may also run code for everyone. */
function insideByCallSite(project: TsProject, cands: Candidate[], ranges: Map<string, Range[]>, reads: Map<string, Set<number>>, loadRest: () => void) {
  if (cands.some((c) => c.exported)) loadRest();
  const refs = new Map<Candidate, { file: string; line: number }[]>();
  for (const c of cands) {
    const found = c.names.flatMap((n) => n.findReferencesAsNodes());
    refs.set(
      c,
      found
        .map((r) => ({ node: r, file: repoPath(r.getSourceFile()), line: r.getStartLineNumber() }))
        // The declaration itself and recursion are not call sites; import specifiers only re-bind the name.
        .filter((r) => !(r.file === c.file && r.line >= c.span[0] && r.line <= c.span[1]))
        .filter((r) => !r.node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration))
        .filter((r) => !c.sameFileOnly || r.file === c.file)
        .map(({ file, line }) => ({ file, line })),
    );
  }
  const inside = new Set<Candidate>();
  const control = (file: string, line: number) => reads.get(file)?.has(line) ?? false;
  const within = (file: string, line: number) =>
    control(file, line) ||
    (ranges.get(file) ?? []).some(([a, b]) => line >= a && line <= b) ||
    [...inside].some((c) => c.file === file && line >= c.span[0] && line <= c.span[1]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const c of cands)
      // An exported declaration with no reference in the repo may still run (an entry point, a framework page, a
      // package export), so it needs at least one reference; an unexported one with none never runs.
      if (!inside.has(c) && (refs.get(c)!.length || !c.exported) && refs.get(c)!.every((r) => within(r.file, r.line))) {
        inside.add(c);
        grew = true;
      }
  }
  return cands
    .filter((c) => inside.has(c))
    .map((c) => {
      const r = refs.get(c)!;
      return { ...c, references: r.length, cls: (r.length && r.every((x) => control(x.file, x.line)) ? "control" : "inside") as LineClass };
    });
}

export function flagFacts(diff: Diff): FlagFacts {
  const changed = diff.files.filter((f) => f.status !== "deleted").map((f) => f.path);
  const project = loadProject(diff.repo, diff.head, changed);
  const flags: FlagFacts["flags"] = [];
  const ranges = new Map<string, Range[]>();
  const controls = new Map<string, Set<number>>();
  /** lines that read a flag: the getBooleanValue call and its declaration */
  const reads = new Map<string, Set<number>>();
  for (const sf of project.getSourceFiles()) {
    const path = repoPath(sf);
    const r: Range[] = [];
    const c = new Set<number>();
    const rd = new Set<number>();
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      if (!(Node.isPropertyAccessExpression(callee) && callee.getName() === "getBooleanValue")) continue;
      const [keyArg, defArg] = call.getArguments();
      const key = Node.isStringLiteral(keyArg) ? keyArg.getLiteralValue() : keyArg?.getText() ?? "?";
      flags.push({ key, defaultValue: defArg?.getText() ?? "undefined", at: `${path}:${call.getStartLineNumber()}` });
      rd.add(call.getStartLineNumber());
      const decl = call.getParentIfKind(SyntaxKind.VariableDeclaration);
      if (decl) rd.add(decl.getStartLineNumber());
      const name = decl?.getNameNode();
      if (name && Node.isIdentifier(name)) {
        c.add(decl!.getStartLineNumber());
        for (const refNode of (name as Identifier).findReferencesAsNodes()) if (refNode !== name) controlledBy(refNode, r, c);
      } else controlledBy(call, r, c);
    }
    ranges.set(path, r);
    controls.set(path, c);
    reads.set(path, rd);
  }

  const keys = flags.map((f) => f.key);
  const keyLine = (text: string) => ANCHOR.test(text) || keys.some((k) => text.includes(`"${k}"`) || text.includes(`'${k}'`));
  // Lines that name a flag key or anchor read the flag too, wherever they are.
  for (const l of diff.added.filter((l) => keyLine(l.text))) (reads.get(l.file) ?? reads.set(l.file, new Set()).get(l.file)!).add(l.line);

  let byCallSite: (Candidate & { references: number; cls: LineClass })[] = [];
  if (flags.length) {
    const git = new Git(diff.repo);
    const baseProject = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true, compilerOptions: { jsx: 4, allowJs: true } });
    const cands = diff.files.flatMap((f) => {
      const sf = project.getSourceFile(`/${f.path}`);
      if (!sf || f.status === "deleted") return [];
      const baseText = f.oldPath ? git.show(diff.base, f.oldPath) : null;
      const baseSf = baseText === null ? null : baseProject.createSourceFile(`/${f.oldPath}`, baseText, { overwrite: true });
      const baseImports = new Set(baseSf ? [...importBindings(baseSf).values()].flat().map((i) => i.getText()) : []);
      return candidates(sf, new Set(f.added.map((l) => l.line)), baseImports);
    });
    // Exported declarations may be referenced from any file at head, so the rest of the repo is loaded for them.
    const loadRest = () => {
      for (const p of git.listFiles(diff.head).filter((p) => TS_FILE.test(p) && !project.getSourceFile(`/${p}`))) {
        const text = git.show(diff.head, p);
        if (text !== null) project.createSourceFile(`/${p}`, text);
      }
    };
    byCallSite = insideByCallSite(project, cands, ranges, reads, loadRest);
  }

  const lines = new Map<string, LineClass>();
  const classify = (l: Line): LineClass | null => {
    // Docs and editor config never run, so they are neither inside nor outside a flag. Stylesheets,
    // CI, compose, scripts and lockfiles still count: no flag turns them off.
    const kind = nonCodeKind(l.file);
    if (kind === "docs" || kind === "editor config") return null;
    if (keyLine(l.text)) return "control";
    if (STRUCTURAL.test(l.text) || COMMENT.test(l.text)) return null;
    if (!TS_FILE.test(l.file)) return "outside";
    if (controls.get(l.file)?.has(l.line)) return "control";
    if ((ranges.get(l.file) ?? []).some(([a, b]) => l.line >= a && l.line <= b)) return "inside";
    return byCallSite.find((c) => c.file === l.file && l.line >= c.span[0] && l.line <= c.span[1])?.cls ?? "outside";
  };
  for (const l of diff.added) {
    const c = classify(l);
    if (c) lines.set(ref(l), c);
  }
  return {
    flags: flags.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)),
    lines,
    byCallSite: byCallSite.map((c) => ({ name: c.name, at: `${c.file}:${c.span[0]}`, references: c.references, cls: c.cls })),
  };
}

/** First line of each run of consecutive outside lines in a file. */
function runStarts(refs: string[]): string[] {
  const out: string[] = [];
  let prev: { file: string; line: number } | null = null;
  for (const r of refs) {
    const m = r.match(/^(.+):(\d+)$/)!;
    const cur = { file: m[1], line: Number(m[2]) };
    if (!prev || prev.file !== cur.file || cur.line > prev.line + 2) out.push(r);
    prev = cur;
  }
  return out;
}

export function featureFlag(diff: Diff, facts: FlagFacts): Signal<"none" | "partial" | "full"> {
  const byClass = (c: LineClass) => [...facts.lines].filter(([, v]) => v === c).map(([k]) => k);
  const control = byClass("control");
  const inside = byClass("inside");
  const outside = byClass("outside");
  if (!facts.flags.length)
    return {
      name: "Feature flag",
      value: "none",
      source: "measured",
      evidence: [],
      note: "no flag call (getBooleanValue) or control point anchor in the changed files",
    };
  const flagText = facts.flags.map((f) => `\`${f.key}\` (default ${f.defaultValue})`).join(", ");
  const outsideFiles = [...new Set(outside.map((r) => r.replace(/:\d+$/, "")))];
  const callSite = facts.byCallSite.map(
    (c) => `${c.name} at ${c.at} (${c.references ? `${c.references} reference(s), all ${c.cls === "control" ? "on flag reads" : "inside the flag"}` : "no references"}, so ${c.cls})`,
  );
  return {
    name: "Feature flag",
    value: outside.length ? "partial" : "full",
    source: "measured",
    evidence: [...control, ...runStarts(outside)],
    note:
      `flag ${flagText}: ${inside.length} added lines inside the flag, ${control.length} control lines, ` +
      `${outside.length} outside it (blank, comment, bracket-only, docs and editor config lines are not classed)` +
      (outside.length ? ` (in ${outsideFiles.join(", ")})` : "") +
      (callSite.length ? `. Classed by call site: ${callSite.join("; ")}` : "") +
      ". Whether the flag exists in production and both states are tested is not checked",
  };
}
