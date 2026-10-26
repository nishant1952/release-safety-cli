// W 1c item 2, appendix Reversibility rank 2: "the change can be turned off without a redeploy";
// extracted from "Flag calls or config in the diff". Rank 4's ignore case ("Flag-wrapped changes
// with no edits outside the flag") is why every added line is classed inside or outside the flag.
import { Node, SyntaxKind, type Identifier } from "ts-morph";
import { loadProject, repoPath, TS_FILE } from "../ast";
import { ref, type Diff, type Line } from "../diff";
import type { Signal } from "../types";

export type LineClass = "control" | "inside" | "outside";

export interface FlagFacts {
  flags: { key: string; defaultValue: string; at: string }[];
  /** added line ref -> class; blank, comment and bracket-only lines are left out */
  lines: Map<string, LineClass>;
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

export function flagFacts(diff: Diff): FlagFacts {
  const changed = diff.files.filter((f) => f.status !== "deleted").map((f) => f.path);
  const project = loadProject(diff.repo, diff.head, changed);
  const flags: FlagFacts["flags"] = [];
  const ranges = new Map<string, Range[]>();
  const controls = new Map<string, Set<number>>();
  for (const sf of project.getSourceFiles()) {
    const path = repoPath(sf);
    const r: Range[] = [];
    const c = new Set<number>();
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      if (!(Node.isPropertyAccessExpression(callee) && callee.getName() === "getBooleanValue")) continue;
      const [keyArg, defArg] = call.getArguments();
      const key = Node.isStringLiteral(keyArg) ? keyArg.getLiteralValue() : keyArg?.getText() ?? "?";
      flags.push({ key, defaultValue: defArg?.getText() ?? "undefined", at: `${path}:${call.getStartLineNumber()}` });
      const decl = call.getParentIfKind(SyntaxKind.VariableDeclaration);
      const name = decl?.getNameNode();
      if (name && Node.isIdentifier(name)) {
        c.add(decl!.getStartLineNumber());
        for (const refNode of (name as Identifier).findReferencesAsNodes()) if (refNode !== name) controlledBy(refNode, r, c);
      } else controlledBy(call, r, c);
    }
    ranges.set(path, r);
    controls.set(path, c);
  }

  const keys = flags.map((f) => f.key);
  const lines = new Map<string, LineClass>();
  const classify = (l: Line): LineClass | null => {
    const anchor = l.text.match(ANCHOR);
    if (anchor || keys.some((k) => l.text.includes(`"${k}"`) || l.text.includes(`'${k}'`))) return "control";
    if (STRUCTURAL.test(l.text) || COMMENT.test(l.text)) return null;
    if (!TS_FILE.test(l.file)) return "outside";
    if (controls.get(l.file)?.has(l.line)) return "control";
    if ((ranges.get(l.file) ?? []).some(([a, b]) => l.line >= a && l.line <= b)) return "inside";
    return "outside";
  };
  for (const l of diff.added) {
    const c = classify(l);
    if (c) lines.set(ref(l), c);
  }
  return { flags: flags.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)), lines };
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
  return {
    name: "Feature flag",
    value: outside.length ? "partial" : "full",
    source: "measured",
    evidence: [...control, ...runStarts(outside)],
    note:
      `flag ${flagText}: ${inside.length} added lines inside the flag, ${control.length} control lines, ` +
      `${outside.length} outside it` +
      (outside.length ? ` (in ${outsideFiles.join(", ")})` : "") +
      ". Whether the flag exists in production and both states are tested is not checked",
  };
}
