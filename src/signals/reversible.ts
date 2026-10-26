// W 1c item 1, appendix Reversibility rank 1: "can the change be undone by a revert, or does it
// leave external side effects that a redeploy cannot undo?" Extracted from the diff: "persisted
// writes (the gate 3 detector), outbound side effects (payment, email, SMS, webhook, push),
// queue publishes, external API clients".
import { ref, type Diff } from "../diff";
import { PERSISTED_WRITE_PATTERNS } from "../gates";
import type { Signal } from "../types";

const RULES: { kind: string; patterns: RegExp[] }[] = [
  { kind: "persisted write", patterns: PERSISTED_WRITE_PATTERNS },
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
  {
    kind: "external API client",
    patterns: [
      // Any HTTP call whose target is not a same-origin path literal ("/api/...").
      /\b(fetch|axios(\.\w+)?|got|ky|https?\.request)\s*\(\s*(?!["'`]\/)(?!\))\S/,
      /\bnew\s+[A-Z]\w*(Client|SDK)\s*\(/,
    ],
  },
];

export function reversibility(diff: Diff): Signal<"reversible" | "irreversible"> {
  const hits: { kind: string; at: string }[] = [];
  for (const l of diff.added) {
    const rule = RULES.find((r) => r.patterns.some((p) => p.test(l.text)));
    if (rule) hits.push({ kind: rule.kind, at: ref(l) });
  }
  const kinds = [...new Set(hits.map((h) => h.kind))];
  return {
    name: "Reversible or irreversible",
    value: hits.length ? "irreversible" : "reversible",
    source: "measured",
    evidence: hits.map((h) => h.at),
    note: hits.length
      ? `${kinds.join(", ")} in the diff: a redeploy cannot undo these`
      : `no persisted write, outbound side effect, queue publish or external API client in ${diff.added.length} added lines`,
  };
}
