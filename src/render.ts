// Markdown brief. W 3: "They get the proposed plan and a short brief, not a score: the mode, the
// top reasons, the confidence, and the one missing fact that would most change the call."
// W 2: "Each signal is marked measured, declared or assumed, so the human knows what to distrust."
import type { Brief } from "./brief";
import { Git } from "./git";

const MAX_EVIDENCE = 4;

/** Returns the text of an evidence line: `path:line` at head, `path@sha7:line` at base. */
export function makeQuoter(repo: string, base: string, head: string) {
  const git = new Git(repo);
  const cache = new Map<string, string[] | null>();
  const fileAt = (rev: string, path: string) => {
    const key = `${rev}:${path}`;
    if (!cache.has(key)) cache.set(key, git.show(rev, path)?.split("\n") ?? null);
    return cache.get(key)!;
  };
  return (r: string): string | null => {
    const m = r.match(/^(.+?)(?:@([0-9a-f]{7}))?:(\d+)$/);
    if (!m) return null;
    const rev = m[2] ? base : head;
    return fileAt(rev, m[1])?.[Number(m[3]) - 1]?.trim() ?? null;
  };
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

function evidenceList(refs: string[], quote: (r: string) => string | null, indent: string): string[] {
  const out = refs.slice(0, MAX_EVIDENCE).map((r) => {
    const text = quote(r);
    return `${indent}- \`${r}\`${text ? ` \`${text.replace(/`/g, "'")}\`` : ""}`;
  });
  if (refs.length > MAX_EVIDENCE) out.push(`${indent}- and ${refs.length - MAX_EVIDENCE} more`);
  return out;
}

export function renderBrief(b: Brief, quote: (r: string) => string | null): string {
  const L: string[] = [];
  L.push(`# Release brief: ${b.title ?? "untitled change"}`);
  L.push("");
  L.push(`Range \`${b.base.slice(0, 7)}..${b.head.slice(0, 7)}\`, ${b.files.length} files changed. Title: ${b.titleSource}.`);
  L.push("");
  L.push(`**Mode: ${b.mode ?? "not computed"}.**${b.modeLine ? ` ${b.modeLine}` : ""}`);
  L.push("");

  L.push("## Plan");
  L.push("");
  if (b.plan) {
    L.push("| Step | Proposed |", "|---|---|");
    for (const p of b.plan) L.push(`| ${cell(p.row)} | ${cell(p.value)} |`);
  } else L.push("Not computed.");
  L.push("");

  L.push("## Top reasons");
  L.push("");
  if (b.reasons.length)
    b.reasons.forEach((r, i) => {
      L.push(`${i + 1}. ${r.text}`);
      if (r.prose) L.push(`   *${r.prose}* (LLM wording)`);
      if (r.evidence.length) L.push(...evidenceList(r.evidence, quote, "   "));
      else if (r.basis) L.push(`   - no line to cite: this reason rests on ${r.basis}`);
      else L.push("   - no line to cite: this reason rests on something missing from the input or the repo");
    });
  else L.push("None recorded.");
  L.push("");

  L.push("## Confidence");
  L.push("");
  if (b.confidence) {
    L.push(`**${b.confidence.level}**`);
    for (const w of b.confidence.why) L.push(`- ${w}`);
  } else L.push("Not computed.");
  L.push("");

  L.push("## The one unknown");
  L.push("");
  L.push(b.unknown ?? "Not computed.");
  L.push("");

  L.push("## Disagreements");
  L.push("");
  if (!b.disagreements) L.push("Not computed.");
  else if (!b.disagreements.length) L.push("Disagreements: none between sources.");
  else L.push(...b.disagreements.map((d) => `- Disagreement: ${d}`));
  L.push("");

  L.push("## Gates");
  L.push("");
  L.push("| Gate | Result | Route | Checks |", "|---|---|---|---|");
  for (const g of b.gates)
    L.push(`| ${g.gate}. ${g.name} | ${g.status} | ${g.route} | ${cell(g.checks.map((c) => `${c.name}: ${c.status} (${c.source})`).join("; "))} |`);
  for (const g of b.gates)
    for (const c of g.checks.filter((c) => c.evidence.length)) {
      L.push("", `Gate ${g.gate}, ${c.name}:`);
      L.push(...evidenceList(c.evidence, quote, ""));
    }
  L.push("");

  L.push("## Provenance");
  L.push("");
  L.push("| Signal | Value | Source | Evidence |", "|---|---|---|---|");
  for (const s of b.signals) {
    const ev = s.evidence.length
      ? s.evidence.slice(0, MAX_EVIDENCE).map((e) => `\`${e}\``).join(", ") + (s.evidence.length > MAX_EVIDENCE ? ` +${s.evidence.length - MAX_EVIDENCE}` : "")
      : "none";
    L.push(`| ${cell(s.name)} | ${cell(s.value)} | ${s.source} | ${ev}. ${cell(s.note)} |`);
  }
  L.push("");

  L.push("## Changed files");
  L.push("");
  for (const f of b.files) L.push(`- \`${f.path}\` (${f.status}, +${f.added} -${f.removed})`);
  L.push("");
  return L.join("\n");
}
