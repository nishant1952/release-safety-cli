// W 1c item 1, appendix Reversibility rank 1: "can the change be undone by a revert, or does it
// leave external side effects that a redeploy cannot undo?" Extracted from the diff: "persisted
// writes (the gate 3 detector), outbound side effects (payment, email, SMS, webhook, push),
// queue publishes, external API clients". Persisted writes are gate 3's destructive hits.
import { Node, SyntaxKind, type Identifier, type SourceFile } from "ts-morph";
import { loadProject } from "../ast";
import { ref, type Diff } from "../diff";
import { CODE_FILE, dataWrites } from "../gates";
import type { Signal } from "../types";

const RULES: { kind: string; patterns: RegExp[] }[] = [
  {
    kind: "outbound side effect",
    patterns: [
      /\b(stripe|paypal|braintree|twilio|sendgrid|mailgun|nodemailer|postmark|resend)\b/i,
      /\b(send(Email|Mail|Sms|SMS|Push|Notification)|charge|refund|createPayment|createCharge|webhook\w*)\s*\(/,
      /\b(webpush|fcm|apns)\b/i,
    ],
  },
  {
    kind: "queue publish",
    patterns: [
      /\.(publish|enqueue|sendMessage|produce|sendToQueue)\s*\(/,
      /\b(SQSClient|SNSClient|kafkajs|amqplib|bullmq|PubSub)\b/,
    ],
  },
  { kind: "external API client", patterns: [/\bnew\s+[A-Z]\w*(Client|SDK)\s*\(/] },
];

// An HTTP call whose target is not a same-origin path literal; its target is classified below.
const HTTP_CALL = /\b(fetch|axios(\.\w+)?|got|ky|https?\.request)\s*\(\s*(?!["'`]\/)(?!\))\S/;
const HTTP_CALLEE = /^(fetch|axios(\.\w+)?|got|ky|https?\.request)$/;
const EXTERNAL = "external API client";
const UNRESOLVED = "HTTP call, target not resolved";

type Target = "internal" | "external" | "unresolved";
const ofText = (t: string): Target => (/^\/api(\/|$)/.test(t) ? "internal" : /^https?:\/\//i.test(t) ? "external" : "unresolved");

/** A literal, or a template's static head; null when the node is neither or the head is empty. */
function staticText(n: Node): string | null {
  if (Node.isStringLiteral(n) || Node.isNoSubstitutionTemplateLiteral(n)) return n.getLiteralValue();
  if (Node.isTemplateExpression(n)) return n.getHead().getLiteralText() || null;
  return null;
}

/** One hop: an identifier's variable declaration whose initializer is a literal or template. */
function resolveOneHop(id: Identifier): Target {
  for (const d of id.getDefinitionNodes()) {
    const init = Node.isVariableDeclaration(d) ? d.getInitializer() : undefined;
    const text = init ? staticText(init) : null;
    if (text !== null) return ofText(text);
  }
  return "unresolved";
}

function targetOf(arg: Node | undefined): Target {
  if (!arg) return "unresolved";
  const text = staticText(arg);
  if (text !== null) return ofText(text);
  if (Node.isIdentifier(arg)) return resolveOneHop(arg);
  // `${BASE}/path`: resolve the leading identifier.
  const first = Node.isTemplateExpression(arg) ? arg.getTemplateSpans()[0]?.getExpression() : undefined;
  return first && Node.isIdentifier(first) ? resolveOneHop(first) : "unresolved";
}

/** Targets of the HTTP calls that start on a line of a parsed file. */
export function httpTargetsOnLine(sf: SourceFile, line: number): Target[] {
  return sf
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((c) => c.getStartLineNumber() === line && HTTP_CALLEE.test(c.getExpression().getText()))
    .map((c) => targetOf(c.getArguments()[0]));
}

export function reversibility(diff: Diff): Signal<"reversible" | "irreversible"> {
  const persisted = new Set(dataWrites(diff).destructive);
  const tsFiles = diff.files.filter((f) => /\.(tsx?|jsx?|mjs|cjs)$/.test(f.path) && f.status !== "deleted").map((f) => f.path);
  const project = diff.repo && tsFiles.length ? loadProject(diff.repo, diff.head, tsFiles) : null;
  const hits: { kind: string; at: string }[] = [];
  for (const l of diff.added) {
    if (persisted.has(ref(l))) {
      hits.push({ kind: "persisted write", at: ref(l) });
      continue;
    }
    // Docs and config files do not run, so they cannot send anything.
    if (!CODE_FILE.test(l.file)) continue;
    if (HTTP_CALL.test(l.text)) {
      const sf = project?.getSourceFile(`/${l.file}`);
      const targets = sf ? httpTargetsOnLine(sf, l.line) : [/\(\s*["'`]https?:\/\//i.test(l.text) ? "external" : "unresolved"];
      if (targets.includes("external")) hits.push({ kind: EXTERNAL, at: ref(l) });
      else if (targets.includes("unresolved") || !targets.length) hits.push({ kind: UNRESOLVED, at: ref(l) });
      continue;
    }
    const rule = RULES.find((r) => r.patterns.some((p) => p.test(l.text)));
    if (rule) hits.push({ kind: rule.kind, at: ref(l) });
  }
  for (const at of persisted) if (at.includes("@")) hits.push({ kind: "persisted write", at });
  const kinds = [...new Set(hits.map((h) => h.kind))];
  return {
    name: "Reversible or irreversible",
    value: hits.length ? "irreversible" : "reversible",
    source: "measured",
    evidence: hits.map((h) => h.at),
    note: hits.length
      ? [
          ...(kinds.some((k) => k !== UNRESOLVED) ? [`${kinds.filter((k) => k !== UNRESOLVED).join(", ")} in the diff: a redeploy cannot undo these`] : []),
          ...(kinds.includes(UNRESOLVED)
            ? [`${UNRESOLVED} one hop in the diff: treated as irreversible because it may leave effects a redeploy cannot undo`]
            : []),
        ].join(". ")
      : `no persisted write, outbound side effect, queue publish or external API client in ${diff.added.length} added lines`,
  };
}
