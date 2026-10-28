// Markdown brief. W 3: "They get the proposed plan and a short brief, not a score: the mode, the
// top reasons, the confidence, and the one missing fact that would most change the call."
// W 2: "Each signal is marked measured, declared or assumed, so the human knows what to distrust."
import type { Brief, Reason } from "./brief";
import { Git } from "./git";
import { MODEL } from "./llm";
import type { Signal } from "./types";

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

function evidenceLine(r: string, quote: (r: string) => string | null, indent: string, label = ""): string {
  const text = quote(r);
  return `${indent}- \`${r}\`${text ? ` \`${text.replace(/`/g, "'")}\`` : ""}${label ? ` (${label})` : ""}`;
}

function evidenceList(refs: string[], quote: (r: string) => string | null, indent: string): string[] {
  const out = refs.slice(0, MAX_EVIDENCE).map((r) => evidenceLine(r, quote, indent));
  if (refs.length > MAX_EVIDENCE) out.push(`${indent}- and ${refs.length - MAX_EVIDENCE} more`);
  return out;
}

/** A model (cited) signal under a reason: its citation first, then its sentence, then the lines the old value rested on. */
function modelLines(r: Reason, quote: (r: string) => string | null, indent: string): string[] {
  const out: string[] = [];
  for (const m of r.model ?? []) {
    out.push(evidenceLine(m.cite, quote, indent, `the model's citation for ${m.signal}, which was ${m.was} (assumed)`));
    out.push(`${indent}  Model's reasoning: ${m.reasoning}`);
    out.push(...m.prior.slice(0, MAX_EVIDENCE).map((p) => evidenceLine(p.ref, quote, `${indent}  `, p.label)));
    if (m.prior.length > MAX_EVIDENCE) out.push(`${indent}  - and ${m.prior.length - MAX_EVIDENCE} more`);
  }
  return out;
}

/** The gate table and each check's evidence lines. Both layouts show it in full when a gate does not pass. */
function gateLines(b: Brief, quote: (r: string) => string | null): string[] {
  const L: string[] = [];
  L.push("| Gate | Result | Route | Checks |", "|---|---|---|---|");
  for (const g of b.gates)
    L.push(`| ${g.gate}. ${g.name} | ${g.status} | ${g.route} | ${cell(g.checks.map((c) => `${c.name}: ${c.status} (${c.source})`).join("; "))} |`);
  for (const g of b.gates)
    for (const c of g.checks.filter((c) => c.evidence.length)) {
      L.push("", `Gate ${g.gate}, ${c.name}:`);
      L.push(...evidenceList(c.evidence, quote, ""));
    }
  return L;
}

/** The current layout: every section, full evidence lists, full paths. */
export function renderFull(b: Brief, quote: (r: string) => string | null): string {
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
      L.push(...modelLines(r, quote, "   "));
      const shown = new Set((r.model ?? []).flatMap((m) => [m.cite, ...m.prior.map((p) => p.ref)]));
      const rest = r.evidence.filter((e) => !shown.has(e));
      if (rest.length) L.push(...evidenceList(rest, quote, "   "));
      // With a model citation shown above, the reason has a line, so "no line to cite" would be false.
      else if (!r.model?.length)
        L.push(`   - no line to cite: this reason rests on ${r.basis ?? "something missing from the input or the repo"}`);
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
  L.push(...gateLines(b, quote));
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

// Short layout (Round 5), the default. It reads the same brief as renderFull, never renderFull's text, and drops
// what is not needed to defend the mode. Anything unfavourable (a gate that does not pass, a disagreement or
// refused proposal, a secret present at base) is shown in full here too, never only behind --full.

/** Why an assumed value is assumed, true for every way the signal comes out assumed. */
const ASSUMED_WHY: Record<string, string> = {
  Path: "no entry point found",
  Reach: "no declared tier applies",
  "Time to revert": "no rollback, pipeline time unmeasured",
  "Detection apparatus": "alert config is not an input",
  History: "too thin to read",
  "Confidence: review depth": "no review data in export",
};

const SHORT_NAME: Record<string, string> = {
  "Reversible or irreversible": "Reversible",
  "Detection apparatus": "Detection",
  "Confidence: test coverage": "Test coverage",
  "Confidence: review depth": "Reviews",
};
// Familiarity folds into Reviews; the two model reads fold into one Model row.
const FAMILIARITY = "Confidence: familiarity";
const LLM_READS = ["Failure mode (LLM second opinion)", "Confidence: diff vs task (LLM)"];
const AT_BASE = "Secrets present at base";

/** The clause of a signal's note the evidence cell shows: the first, unless a later one carries the value. */
const CLAUSE: Record<string, RegExp> = {
  Path: /^(entry points|no entry point|every changed file)/,
  Reach: /^(Worth unknown because|Catalog tiers)/,
  "Failure mode": /^Matched on/,
  "Detection apparatus": /: no /,
  History: /^Too thin/,
  "Confidence: test coverage": /covered/,
};

const NO_DETECTOR: Record<string, string> = {
  domain: "no business-level check",
  infra: "no health check, error-rate or latency detector",
  security: "no auth-error alert",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const andList = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** `apps/web/src/App.tsx:554` -> `App.tsx:554`; base-side and commit refs keep their suffix. */
const shortRef = (r: string) => r.replace(/^(?:[^\s:@/]+\/)+/, "");
const shortPaths = (s: string) => s.replace(/(?<![\w/.-])(?:[\w.@-]+\/)+([\w-]+(?:\.[\w-]+)*\.\w+)/g, "$1");
const noEmail = (s: string) => s.replace(/\s*<[^<>\s]+@[^<>\s]+>/g, "");
const noSpecRefs = (s: string) => s.replace(/\s*\(W [^)]*\)/g, "");
// confidence.measured also carries notes that lower nothing ("single-author repo: familiarity dropped"); a fact that
// lowered the measured level ends "(measured)".
const lowering = (facts: string[]) => facts.filter((f) => f.endsWith("(measured)"));

/** What lowered confidence below the measured level: assumed inputs, notches, disagreements, a model mismatch. */
function loweredBy(b: Brief): string[] {
  const c = b.confidence!;
  return c.why
    .filter((w) => !(c.measured ?? []).includes(w) && !w.startsWith(`${AT_BASE}:`))
    .map((w) => noSpecRefs(w).replace(/, lowers confidence(, does not raise risk| one notch)?$/, "").replace(/^disagreement lowers confidence: /, "disagreement: "));
}

function clause(s: Signal): string {
  const parts = s.note.split(/;\s|\.\s+(?=[A-Z])/);
  const pick = (CLAUSE[s.name] && parts.find((p) => CLAUSE[s.name].test(p))) || parts[0];
  // Drop parentheticals that are sentences, not labels: "(default false)" goes, "import(s)" stays.
  const text = pick.replace(/^measured: |^Worth unknown because /, "").replace(/\s*\([^()]*\s[^()]*\)/g, "").replace(/\.$/, "");
  return cell(noEmail(shortPaths(text)));
}

/** "high (assumed: no catalog tier covers it)" */
function valued(s: Signal): string {
  const why = s.source === "assumed" ? ASSUMED_WHY[s.name] : undefined;
  return `${s.value} (${s.source}${why ? `: ${why}` : ""})`;
}

/** Paths unique by their shortest tail: two `index.ts` keep a parent directory each. */
function shortNames(paths: string[]): string[] {
  const parts = paths.map((p) => p.split("/"));
  const depth = parts.map(() => 1);
  const tail = (i: number) => parts[i].slice(-depth[i]).join("/");
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < paths.length; i++)
      if (depth[i] < parts[i].length && paths.some((_, j) => j !== i && tail(j) === tail(i))) {
        depth[i]++;
        changed = true;
      }
  }
  return paths.map((_, i) => tail(i));
}

function gatesSentence(b: Brief): string {
  const by = (st: string) => b.gates.filter((g) => g.status === st).map((g) => String(g.gate));
  const trip = by("trip");
  const unverifiable = by("unverifiable");
  if (!trip.length && !unverifiable.length) return b.gates.length === 3 ? "All three gates pass." : `All ${b.gates.length} gates pass.`;
  const said = [
    trip.length ? `${trip.length > 1 ? "Gates" : "Gate"} ${andList(trip)} ${trip.length > 1 ? "trip" : "trips"}` : "",
    unverifiable.length ? `${unverifiable.length > 1 ? "gates" : "gate"} ${andList(unverifiable)} ${unverifiable.length > 1 ? "are" : "is"} unverifiable` : "",
  ].filter(Boolean);
  return `${cap(said.join("; "))}.`;
}

/** The plain sentence under the mode line: what the change is and why it landed in its cell, from the reasons' signals. */
function oneLine(b: Brief): string | null {
  const c = b.cell;
  const get = (n: string) => b.signals.find((s) => s.name === n);
  const [path, reach, flag, revert, rev] = ["Path", "Reach", "Feature flag", "Time to revert", "Reversible or irreversible"].map(get);
  if (!c || !path || !reach || !flag || !revert || !rev) return null;
  const irreversible = rev.value !== "reversible";
  const kind = flag.value === "full" ? "flagged" : flag.value === "partial" ? "partly flagged" : "unflagged";
  const what = `${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind}${irreversible ? ", irreversible" : ""} change`;
  const where: Record<string, string> = { live: "on a live path", unreached: "on an unreached path", "not a code path": "that touches no code path" };
  const at = (s: Signal) => `${where[s.value] ?? `on a path that is ${s.value}`} (${s.source})`;
  const damage = c.damage === "high" ? `${at(path)} with high reach (${reach.source})` : path.value !== "live" ? at(path) : `with ${reach.value} reach (${reach.source})`;
  const parts = [`${what} ${damage}`];
  if (c.window === "short") parts.push("quick to undo and to detect");
  else {
    if (!c.undoFast && !irreversible) parts.push(`undone by a ${revert.value} (${revert.source})${flag.value === "partial" ? " for the edits outside the flag" : ""}`);
    const blind = (b.detectors ?? []).filter((d) => !d.detectors.length).map((d) => d.mode);
    if (!c.detectFast && blind.length) parts.push(`with nothing found that detects ${/^[aeiou]/.test(blind[0]) ? "an" : "a"} ${blind.join(" or ")} failure`);
  }
  if (c.shifted) parts.push(`and low confidence moves it from ${c.gridMode} to ${b.mode}`);
  const gated = b.gates.filter((g) => g.route !== "none").map((g) => String(g.gate));
  if (gated.length) parts.push(`and ${gated.length > 1 ? "gates" : "gate"} ${andList(gated)} ${gated.length > 1 ? "route" : "routes"} it to ${c.gateMode}`);
  return `In one line: ${parts.join(", ")}.`;
}

function modeSentence(b: Brief): string {
  const c = b.cell;
  if (!c) return `**Mode: ${b.mode ?? "not computed"}.**${b.modeLine ? ` ${b.modeLine}` : ""}`;
  const steps = [
    ...(c.shifted ? ["low confidence moves it one step"] : []),
    ...(c.llmStep ? ["the task check moves it one step"] : []),
    ...(c.gateMode ? [`gates route to ${c.gateMode}`] : []),
  ];
  const grid = `${cap(c.damage)} damage × ${c.window} window${c.gridMode !== b.mode || steps.length ? ` = ${c.gridMode}` : ""}`;
  return `**Mode: ${b.mode}.** ${[grid, ...steps].join("; ")}. Confidence ${b.confidence?.level ?? "not computed"}.`;
}

/** One reason as a bold label and one or two sentences, from the signals and gates it rests on. */
function shortReason(r: Reason, b: Brief): { label: string; text: string } {
  const get = (n: string) => b.signals.find((s) => s.name === n);
  let m: RegExpMatchArray | null;
  if ((m = r.text.match(/^Gate (\d) \(/))) {
    const g = b.gates.find((g) => g.gate === Number(m![1]))!;
    const failing = g.checks.filter((c) => c.status !== "pass").map((c) => c.name);
    return {
      label: `Gate ${g.gate} ${g.status === "trip" ? "trips" : "is unverifiable"}`,
      text: `${g.name}, so it routes to ${g.route === "block" ? "a block" : "a human"}: ${failing.join("; ")}.`,
    };
  }
  if ((m = r.text.match(/^Gate (\d+): /))) return { label: `Gate ${m[1]}, advisory`, text: r.text.slice(m[0].length) };
  const path = get("Path");
  const reach = get("Reach");
  if (/^(High|Low) damage/.test(r.text) && path && reach)
    return r.text.startsWith("High")
      ? { label: "High damage", text: `Path ${valued(path)}, reach ${valued(reach)}.` }
      : { label: "Low damage", text: path.value !== "live" ? `Path ${valued(path)}.` : `Reach ${valued(reach)}.` };
  const flag = get("Feature flag");
  const revert = get("Time to revert");
  const detection = get("Detection apparatus");
  if (r.text.startsWith("Short window")) return { label: "Short window", text: "Reversible, fast undo and a detector for every failure mode." };
  if (r.text.startsWith("Long window") && b.cell && flag && revert && detection) {
    const undo: string[] = [];
    if (get("Reversible or irreversible")?.value !== "reversible") undo.push("the change is irreversible");
    if (!b.cell.undoFast)
      undo.push(flag.value === "partial" ? `flag partial, so undo for the edits outside it is ${valued(revert)}` : `no flag, so undo is ${valued(revert)}`);
    const blind = (b.detectors ?? []).filter((d) => !d.detectors.length).map((d) => `${NO_DETECTOR[d.mode]} for ${d.mode}`);
    const detect = b.cell.detectFast ? "" : `Detection ${valued(detection)}${blind.length ? `: ${blind.join("; ")}` : ""}.`;
    return { label: "Long window", text: [undo.length ? `${cap(undo.join("; "))}.` : "", detect].filter(Boolean).join(" ") };
  }
  if (r.text.startsWith("Probability") && b.cell) {
    const facts = lowering(b.confidence?.measured ?? []).map(noSpecRefs);
    const moved = b.cell.shifted ? `It moves the mode from ${b.cell.gridMode} to the next step toward caution.` : "The mode is already Human, so it moves no further.";
    return { label: "Low confidence", text: `${facts.length ? `${cap(facts.join("; "))}. ` : ""}${moved}` };
  }
  if (r.text.startsWith("LLM found")) return { label: "Diff vs task", text: r.text };
  const [label, ...rest] = r.text.split(": ");
  return { label: label.replace(/\.$/, ""), text: rest.join(": ") };
}

function whatWouldMove(b: Brief): string {
  const u = b.moves;
  if (!u) return b.unknown ?? "Not computed.";
  const first = u.first
    ? `If ${u.first.what} (assumed ${u.first.from}) were ${u.first.to}, the mode would move from ${u.base} to ${u.first.mode}.`
    : u.allFavourable === u.base
      ? "No assumed input changes the mode, alone or together."
      : `No assumed input changes the mode alone; all of them together would make it ${u.allFavourable}.`;
  const lead = u.first || u.allFavourable !== u.base ? `With every assumed input favourable (${u.allFavourable}), the` : "The";
  const known = u.holding.length
    ? `${lead} known input${u.holding.length > 1 ? "s" : ""} that would move it: ${u.holding.map((h) => `${h.what}, to ${h.mode}`).join("; ")}.`
    : "No single known input moves it either.";
  return [first, known, b.cell?.flagAdvice ?? ""].filter(Boolean).join(" ");
}

function signalRows(b: Brief): string[] {
  const get = (n: string) => b.signals.find((s) => s.name === n);
  const rows: string[] = [];
  for (const s of b.signals.filter((s) => s.name !== FAMILIARITY && !LLM_READS.includes(s.name))) {
    const cite = s.evidence.length ? `\`${shortRef(s.evidence[0])}\`${s.evidence.length > 1 ? ` +${s.evidence.length - 1}` : ""}. ` : "";
    const fam = get(FAMILIARITY);
    const ev =
      s.name === "Confidence: review depth" && fam
        ? `familiarity: ${fam.value} (${fam.source})`
        : s.name === AT_BASE
          ? "present before this change, not added by it; listed in full below"
          : clause(s);
    rows.push(`| ${SHORT_NAME[s.name] ?? s.name} | ${cell(s.value)} | ${s.source} | ${cite}${ev} |`);
  }
  const reads = LLM_READS.map(get).filter((s): s is Signal => !!s);
  if (reads.length) {
    const p = b.proposals ?? { accepted: 0, refused: 0 };
    rows.push(
      reads.every((s) => s.value === "unavailable")
        ? `| Model | off | — | ${cell(reads[reads.length - 1].note)}; failure mode and task check not run |`
        : `| Model | ${MODEL} | model | ${p.accepted} proposal${p.accepted === 1 ? "" : "s"} accepted, ${p.refused} refused |`,
    );
  }
  return rows;
}

export function renderShort(b: Brief, quote: (r: string) => string | null): string {
  const L: string[] = [];
  const add = (a: number, r: number) => `+${a} −${r}`;
  L.push(`# Release brief: ${b.title ?? "untitled change"}`);
  L.push("");
  const sum = (k: "added" | "removed") => b.files.reduce((n, f) => n + f[k], 0);
  const sources = !b.disagreements ? "" : b.disagreements.length ? ` Sources disagree on ${b.disagreements.length} point${b.disagreements.length > 1 ? "s" : ""}, listed below.` : " Sources agree.";
  L.push(`Range \`${b.base.slice(0, 7)}..${b.head.slice(0, 7)}\`, ${b.files.length} files, ${add(sum("added"), sum("removed"))}. ${gatesSentence(b)}${sources}`);
  L.push("");
  L.push(modeSentence(b));
  const line = oneLine(b);
  if (line) L.push("", line);
  L.push("");

  L.push("## Plan");
  L.push("");
  if (b.plan) {
    if (b.mode === "Human") L.push("Each row is proposed by the system; the owner approves or edits it.", "");
    L.push("| Step | Proposed |", "|---|---|");
    for (const p of b.plan) L.push(`| ${cell(p.row)} | ${cell(p.short ?? p.value)} |`);
  } else L.push("Not computed.");
  L.push("");

  L.push(`## Why ${b.mode ?? "this mode"}`);
  L.push("");
  if (b.reasons.length)
    b.reasons.forEach((r, i) => {
      const { label, text } = shortReason(r, b);
      L.push(`${i + 1}. **${label}.** ${text}`);
      // Exactly one line: the model's citation when the reason rests on a filled signal, else the reason's first.
      const m = r.model?.[0];
      const ref = m?.cite ?? r.evidence[0];
      if (ref) {
        const q = quote(ref);
        L.push(`   \`${ref}\`${q ? ` \`${q.replace(/`/g, "'")}\`` : ""}${m ? ` (the model's citation for ${m.signal}, which was ${m.was})` : ""}`);
      } else L.push("   No line to cite.");
    });
  else L.push("None recorded.");
  // Lowered confidence is unfavourable, so its causes show even when they did not move the mode: measured facts
  // (when no low-confidence reason already lists them), then whatever took it below the measured level.
  const c = b.confidence;
  if (c?.measuredLevel) {
    const causes = [
      ...(b.reasons.some((r) => r.text.startsWith("Probability")) ? [] : lowering(c.measured ?? []).map(noSpecRefs)),
      ...(c.level !== c.measuredLevel ? loweredBy(b) : []),
    ];
    if (causes.length)
      L.push("", `Confidence ${c.level}${c.level !== c.measuredLevel ? `, ${c.measuredLevel} from measured facts` : ""}. Lowered by: ${causes.join("; ")}.`);
  }
  L.push("");

  L.push("## What would move it");
  L.push("");
  L.push(whatWouldMove(b));
  L.push("");

  if (b.disagreements?.length) {
    L.push("## Disagreements");
    L.push("");
    L.push(...b.disagreements.map((d) => `- ${d}`));
    L.push("");
  }

  L.push("## Signals");
  L.push("");
  L.push("| Signal | Value | Source | Evidence |", "|---|---|---|---|");
  L.push(...signalRows(b));
  L.push("");

  L.push("## Gates");
  L.push("");
  if (b.gates.every((g) => g.status === "pass")) {
    const notes = b.gates.flatMap((g) =>
      g.checks
        .filter((c) => c.evidence.length)
        .map((c) => `Gate ${g.gate} notes ${c.name}: ${c.evidence.length} line${c.evidence.length > 1 ? "s" : ""}, \`${shortRef(c.evidence[0])}\`${c.evidence.length > 1 ? ` +${c.evidence.length - 1}` : ""}.`),
    );
    L.push(["All pass.", ...notes].join(" "));
  } else L.push(...gateLines(b, quote));
  L.push("");

  const atBase = b.signals.find((s) => s.name === AT_BASE);
  if (atBase) {
    L.push("## Secrets present at base");
    L.push("");
    L.push(`${atBase.note}.`);
    L.push("");
  }

  L.push("## Changed files");
  L.push("");
  const names = shortNames(b.files.map((f) => f.path));
  L.push(
    b.files
      .map((f, i) => [`\`${names[i]}\`${f.status === "modified" ? "" : ` (${f.status})`}`, f.added ? `+${f.added}` : "", f.removed ? `−${f.removed}` : ""].filter(Boolean).join(" "))
      .join(" · "),
  );
  L.push("");
  return L.join("\n");
}
