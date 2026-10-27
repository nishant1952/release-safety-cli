// The model contract (Round 3, Unit 6). One structured call. The model sees the diff and the assumed
// signals only, never measured or declared signals, gate results or the mode. For each assumed signal
// it says "no change" or proposes a value one step away on that signal's scale, citing the line it
// rests on. Code accepts a proposal only when the cited line exists, the step is within one, the line
// is in the signal's citation domain, and it is not the evidence of a measured conclusion the proposal
// contradicts (Round 4, Unit 2); an accepted value is tagged "model (cited)". The same call also answers the failure-mode and
// diff-vs-task questions, which can only lower confidence or tighten the mode.
import { ref, type Diff } from "./diff";
import { nonCodeKind } from "./files";
import { CODE_FILE, isRouteLine, withoutSensitiveFiles } from "./gates";
import { askJson, llmAvailable, NO_CREDENTIAL } from "./llm";
import POLICY from "./policy.json";
import type { PrMeta } from "./pr";
import type { FailureModeFacts } from "./signals/failureMode";
import type { PathFacts } from "./signals/path";
import type { ReachFacts } from "./signals/reach";
import type { Signal } from "./types";

const SCALES: Record<string, string[]> = POLICY.model.scales;

export interface Proposal {
  signal: string;
  change: "no change" | "propose";
  value: string;
  cite: string;
  reasoning: string;
}

export interface ContractAnswer {
  proposals: Proposal[];
  failure_modes: { modes: string[]; reason: string };
  coherence: { coherent: boolean; mismatches: Mismatch[] };
}

/** One coherence item. A claim that the change adds, removes or includes something is checked against the diff. */
export interface Mismatch {
  text: string;
  claim: "adds" | "removes" | "includes credentials" | "other";
  /** the exact text from the diff the claim is about; "" for "other" and "includes credentials" */
  subject: string;
}

export const CONTRACT_SCHEMA = {
  type: "object",
  properties: {
    proposals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          signal: { type: "string" },
          change: { type: "string", enum: ["no change", "propose"] },
          value: { type: "string" },
          cite: { type: "string" },
          reasoning: { type: "string" },
        },
        required: ["signal", "change", "value", "cite", "reasoning"],
        additionalProperties: false,
      },
    },
    failure_modes: {
      type: "object",
      properties: { modes: { type: "array", items: { type: "string", enum: ["infra", "security", "domain"] } }, reason: { type: "string" } },
      required: ["modes", "reason"],
      additionalProperties: false,
    },
    coherence: {
      type: "object",
      properties: {
        coherent: { type: "boolean" },
        mismatches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              claim: { type: "string", enum: ["adds", "removes", "includes credentials", "other"] },
              subject: { type: "string" },
            },
            required: ["text", "claim", "subject"],
            additionalProperties: false,
          },
        },
      },
      required: ["coherent", "mismatches"],
      additionalProperties: false,
    },
  },
  required: ["proposals", "failure_modes", "coherence"],
  additionalProperties: false,
};

/** The assumed signals the model may fill: assumed, and with a scale in policy.json. */
export const fillable = (signals: Signal[]) => signals.filter((s) => s.source === "assumed" && SCALES[s.name]?.includes(s.value));

/** Unified diff with each line prefixed by its head line number (context and +) or the base one (-). */
export function numberedDiff(text: string): string {
  let oldLine = 0;
  let newLine = 0;
  return text
    .split("\n")
    .map((raw) => {
      const h = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (h) {
        oldLine = Number(h[1]);
        newLine = Number(h[2]);
        return raw;
      }
      if (raw.startsWith("+++") || raw.startsWith("---") || raw.startsWith("diff ") || raw.startsWith("index ")) return raw;
      if (raw.startsWith("+")) return `${String(newLine++).padStart(5)} ${raw}`;
      if (raw.startsWith("-")) return `${`b${oldLine++}`.padStart(5)} ${raw}`;
      if (raw.startsWith(" ")) {
        oldLine++;
        return `${String(newLine++).padStart(5)} ${raw}`;
      }
      return raw;
    })
    .join("\n");
}

const SYSTEM =
  "You help write a release-safety brief. Some signals could not be measured, so they were set to an assumed value that " +
  "rounds toward caution. For each assumed signal listed, answer \"no change\" unless one specific line in the diff shows the " +
  "value is different. Then propose a value exactly one step away on that signal's scale, cite that line as path:line (the " +
  "head line number shown at the left of the diff; for a removed line use path@<base>:line with the base commit given below " +
  "and the b-number), and give one " +
  "sentence of reasoning. Never propose for a signal that is not listed. For \"no change\", set value to the current value, " +
  "cite to \"\" and reasoning to \"\".\n" +
  "Also answer two questions. failure_modes: how the change can fail in production, every mode that applies: infra " +
  "(resources, latency, availability, config, build), security (auth, secrets, permissions, data exposure), domain (wrong " +
  "business values or behaviour that error rates cannot see). coherence: does the change do what its task and description " +
  "say, nothing missing, nothing extra; list each concrete mismatch as text, claim and subject. When the item says the " +
  "change adds or removes something, claim is \"adds\" or \"removes\" and subject is the exact text from the diff it is " +
  "about; when it says the change includes a secret or credential, claim is \"includes credentials\"; otherwise claim is " +
  "\"other\". subject is \"\" unless claim is adds or removes.";

export function contractPrompt(diffText: string, signals: Signal[], pr: PrMeta | null, commitMessage: string, base7: string): string {
  const rows = fillable(signals).map(
    (s) => `- ${s.name}: assumed "${s.value}". Scale, cautious to favourable: ${SCALES[s.name].map((v) => `"${v}"`).join(" < ")}. Why assumed: ${s.note}`,
  );
  return (
    `Assumed signals:\n${rows.join("\n")}\n\nCommit message:\n${commitMessage}\n\nPR title: ${pr?.title ?? "(none)"}\n\n` +
    `PR description:\n${pr?.body ?? "(none)"}\n\nBase commit: ${base7}\n\nDiff (line numbers at left):\n${numberedDiff(withoutSensitiveFiles(diffText).text)}`
  );
}

export interface Ruling {
  accepted: { signal: string; from: string; to: string; cite: string; reasoning: string }[];
  refused: string[];
}

/** What code knows about the change when it checks a citation or a claim. Built from measured facts by citationContext. */
export interface CitationContext {
  /** code files on the measured path: changed files whose import chain reaches an entry point, and every importer on it */
  pathFiles: Set<string>;
  /** entry point files */
  entries: Set<string>;
  /** handler definitions the changed code reaches */
  handlers: Set<string>;
  /** added and removed lines */
  changed: Set<string>;
  /** text of the added lines and the paths of added files; the same for removed lines and deleted files */
  added: string[];
  removed: string[];
  /** gate 1 found a secret on an added line */
  secretAdded: boolean;
}

export function citationContext(diff: Diff, paths: PathFacts, reach: ReachFacts, secretAdded = false): CitationContext {
  const pathFiles = new Set<string>();
  for (const [file, chain] of paths.chains)
    if (chain) for (const f of [file, ...chain.map((h) => h.file)]) pathFiles.add(f);
  return {
    pathFiles,
    entries: new Set(paths.entries),
    handlers: new Set(reach.handlers.map((h) => h.at)),
    changed: new Set([...diff.added, ...diff.removed].map((l) => ref(l, diff.base))),
    added: [...diff.added.map((l) => l.text), ...diff.files.filter((f) => f.status === "added").map((f) => f.path)],
    removed: [...diff.removed.map((l) => l.text), ...diff.files.filter((f) => f.status === "deleted").map((f) => f.path)],
    secretAdded,
  };
}

// An item that says the change adds or includes real (plaintext, hardcoded) credentials is a credentials claim, whatever
// kind the model gave it. "adds a password reset flow" is not: it names a feature, not a value.
const CREDENTIAL_CLAIM =
  /\b(adds?|added|includes?|included|introduces?|introduced|commits?|committed|contains?|exposes?|leaks?)\b[^.;]*\b(real|actual|live|plaintext|plain-text|hard-?coded)\s+(credentials?|passwords?|secrets?|api keys?|tokens?)\b/i;
const squash = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();

/** Why the diff does not support a coherence claim, or null when it does (or the item asserts nothing checkable). */
export function unsupportedClaim(m: Mismatch, ctx: CitationContext): string | null {
  const claim = m.claim !== "removes" && CREDENTIAL_CLAIM.test(m.text) ? "includes credentials" : m.claim;
  if (claim === "includes credentials")
    return ctx.secretAdded ? null : "gate 1 found no secret on an added line; a value present at base was not added by this change";
  if (claim === "other") return null;
  const subject = squash(m.subject);
  if (!subject) return `the item says the change ${claim} something but names no text from the diff`;
  const lines = claim === "adds" ? ctx.added : ctx.removed;
  return lines.some((l) => squash(l).includes(subject)) ? null : `"${m.subject}" is on no ${claim === "adds" ? "added" : "removed"} line or file`;
}

const isCode = (file: string) => CODE_FILE.test(file) && nonCodeKind(file) === null;
const IMPORT_LINE = /^\s*(import\b|export\b.*\bfrom\s*["']|.*\brequire\s*\()/;
// Time to revert is how fast a release is undone: only the files that build, ship or roll back say that. A deploy or
// rollback file is config or a script by extension; source code named deploy* is not one.
const isReleaseFile = (file: string) =>
  ["workflow", "compose", "script"].includes(nonCodeKind(file) ?? "") || /(deploy|rollback)[^/]*\.(ya?ml|json|toml|ini|conf|cfg|sh|bash)$/i.test(file);

type Cited = { ref: string; file: string; text: string };

/** Where a citation for each signal must come from. A signal with no entry has no domain, so no citation fits it. */
const DOMAINS: Record<string, { needs: string; fits: (c: Cited, ctx: CitationContext) => boolean }> = {
  Reach: {
    needs: "a code line on the measured path, or a route or handler definition",
    fits: (c, ctx) => (isCode(c.file) && ctx.pathFiles.has(c.file)) || isRouteLine(c.text) || ctx.handlers.has(c.ref),
  },
  "Time to revert": {
    needs: "a line in a workflow, deploy script, compose file or rollback config",
    fits: (c) => isReleaseFile(c.file),
  },
  Path: {
    needs: "an entry point, a route table line, or an import on the measured graph",
    fits: (c, ctx) => ctx.entries.has(c.file) || isRouteLine(c.text) || (ctx.pathFiles.has(c.file) && IMPORT_LINE.test(c.text)),
  },
  "Failure mode": {
    needs: "a line in the changed code",
    fits: (c, ctx) => isCode(c.file) && ctx.changed.has(c.ref),
  },
};

/**
 * A measured conclusion a favourable proposal may not overturn with that conclusion's own evidence: while the
 * measured signal holds such a value, its evidence lines cannot support moving these signals toward release.
 */
const RULES_OUT: { signal: string; holds: (v: string) => boolean; proposals: string[]; why: string }[] = [
  {
    signal: "Feature flag",
    holds: (v) => v !== "full",
    proposals: ["Reach", "Time to revert", "Path"],
    why: "the flag does not cover the whole change, so its lines cannot show the change reaches fewer systems, is unreached, or is undone in one click",
  },
  {
    signal: "Reversible or irreversible",
    holds: (v) => v === "irreversible",
    proposals: ["Time to revert"],
    why: "an irreversible write is not undone by rolling back the code",
  },
];

/** Code's check on each proposal. quote returns the text at a cited line, or null when it does not exist. */
export function judge(proposals: Proposal[], signals: Signal[], quote: (ref: string) => string | null, ctx: CitationContext, base7?: string): Ruling {
  const accepted: Ruling["accepted"] = [];
  const refused: string[] = [];
  for (const p of proposals.filter((p) => p.change === "propose")) {
    const s = signals.find((x) => x.name === p.signal);
    const refuse = (...why: [string, string][]) =>
      refused.push(`model proposed ${p.signal} = "${p.value}" (cites ${p.cite || "nothing"}); refused by ${why.map(([rule, w]) => `the ${rule} rule: ${w}`).join("; and by ")}`);
    if (!s) refuse(["assumed signals only", "no such signal"]);
    else if (s.source !== "assumed") refuse(["assumed signals only", `${s.name} is ${s.source}; the model may only fill assumed signals`]);
    else if (!SCALES[s.name]) refuse(["scale", `${s.name} has no scale the model may move on`]);
    else if (accepted.some((a) => a.signal === s.name)) refuse(["one proposal per signal", "a second proposal for the same signal"]);
    else {
      const scale = SCALES[s.name];
      const from = scale.indexOf(s.value);
      const to = scale.indexOf(p.value);
      const cite = p.cite.trim();
      const sha = cite.match(/@([0-9a-f]+):\d+$/)?.[1];
      const text = cite && (!sha || !base7 || sha === base7) ? quote(cite) : null;
      if (to === -1) refuse(["scale", `"${p.value}" is not on the scale ${scale.join(" < ")}`]);
      else if (to === from) continue;
      else if (Math.abs(to - from) > 1) refuse(["one step", `${Math.abs(to - from)} steps from "${s.value}"; at most one is allowed`]);
      else if (!text?.trim()) refuse(["citation exists", cite ? `the cited line ${cite} is blank or does not exist in the diff or at the head revision` : "no line cited"]);
      else {
        const c: Cited = { ref: cite, file: cite.replace(/(@[0-9a-f]+)?:\d+$/, ""), text };
        const why: [string, string][] = [];
        // Only a move toward release can contradict a measured conclusion; a move toward caution never loosens anything.
        if (to > from)
          for (const r of RULES_OUT.filter((r) => r.proposals.includes(s.name))) {
            const m = signals.find((x) => x.name === r.signal && x.source === "measured" && r.holds(x.value) && x.evidence.includes(cite));
            if (m) why.push(["measured evidence", `${cite} is evidence for ${m.name} = ${m.value} (measured), and ${r.why}`]);
          }
        const domain = DOMAINS[s.name];
        if (!domain) why.push(["citation domain", `no citation domain is defined for ${s.name}`]);
        else if (!domain.fits(c, ctx)) why.push(["citation domain", `${s.name} needs ${domain.needs}; ${cite} is not one${nonCodeKind(c.file) ? ` (${nonCodeKind(c.file)})` : ""}`]);
        if (why.length) refuse(...why);
        else accepted.push({ signal: s.name, from: s.value, to: p.value, cite, reasoning: p.reasoning.trim() });
      }
    }
  }
  return { accepted, refused };
}

/** Accepted proposals replace their assumed signal's value, tagged "model (cited)" with the citation as evidence. */
export function applyRuling(signals: Signal[], ruling: Ruling): Signal[] {
  return signals.map((s) => {
    const a = ruling.accepted.find((x) => x.signal === s.name);
    return a
      ? {
          ...s,
          value: a.to,
          source: "model (cited)" as const,
          evidence: [a.cite],
          note: `model (cited): ${a.reasoning} Was "${a.from}" (assumed): ${s.note}`,
          model: { reasoning: a.reasoning, was: { value: s.value, evidence: s.evidence } },
        }
      : s;
  });
}

/**
 * Confidence lines name a signal's value as it was when confidence was computed, before the fill. For a signal the
 * model filled, the line says so instead of calling the value assumed.
 */
export function relabelFilled(why: string[], ruling: Ruling): string[] {
  return why.map((w) => {
    const a = ruling.accepted.find((x) => w.startsWith(`${x.signal}: ${x.from} (assumed)`));
    return a
      ? `${a.signal}: filled by the model (cited ${a.cite}) from "${a.from}" to "${a.to}"; confidence is computed before a fill, so it still counts as missing data here (W 2)`
      : w;
  });
}

export interface Contract {
  ruling: Ruling;
  failureMode: Signal & { agrees: boolean | null };
  coherence: Signal & { coherent: boolean | null };
  /** coherence items dropped because the diff does not support them; listed, never lowering confidence */
  unsupported: string[];
}

/** One call; without a key, or with a secret in the diff, nothing is sent and every assumed signal stays assumed. */
export async function modelContract(
  diffText: string,
  signals: Signal[],
  pr: PrMeta | null,
  commitMessage: string,
  rules: FailureModeFacts,
  quote: (ref: string) => string | null,
  ctx: CitationContext,
  base7: string,
  ask: typeof askJson = askJson,
  available = llmAvailable(),
  withheld: string | null = null,
): Promise<Contract> {
  const fmName = "Failure mode (LLM second opinion)";
  const cohName = "Confidence: diff vs task (LLM)";
  const off = (note: string, fmNote = note): Contract => ({
    ruling: { accepted: [], refused: [] },
    unsupported: [],
    failureMode: { name: fmName, value: "unavailable", source: "assumed", evidence: [], note: fmNote, agrees: null },
    coherence: { name: cohName, value: "unavailable", source: "assumed", evidence: [], note, coherent: null },
  });
  if (!available) return off(NO_CREDENTIAL, `${NO_CREDENTIAL}; rules only`);
  if (withheld) return off(`diff not sent to the LLM: ${withheld}`);
  const answer = await ask<ContractAnswer>(SYSTEM, contractPrompt(diffText, signals, pr, commitMessage, base7), CONTRACT_SCHEMA, "model contract");
  if (!answer) return off("LLM call failed or was refused");
  const modes = [...new Set(answer.failure_modes.modes)].sort();
  const agrees = modes.join(",") === rules.modes.join(",");
  const checked = answer.coherence.mismatches.map((m) => ({ m, why: unsupportedClaim(m, ctx) }));
  const kept = checked.filter((c) => c.why === null).map((c) => c.m);
  const dropped = checked.filter((c) => c.why !== null);
  // A mismatch the diff does not support is not a mismatch: with none left, the read is coherent.
  const coherent = kept.length ? false : dropped.length ? true : answer.coherence.coherent;
  return {
    ruling: judge(answer.proposals, signals, quote, ctx, base7),
    unsupported: dropped.map((c) => `model claim not supported by the diff: "${c.m.text}" (${c.why})`),
    failureMode: {
      name: fmName,
      value: modes.join(", ") || "none",
      source: "assumed",
      evidence: [],
      note: `${agrees ? "agrees with" : "disagrees with"} the rules (${rules.modes.join(", ")}). ${answer.failure_modes.reason}`,
      agrees,
    },
    coherence: {
      name: cohName,
      value: coherent ? "coherent" : "mismatch",
      source: "assumed",
      evidence: [],
      note:
        (kept.length ? kept.map((m) => m.text).join("; ") : "no mismatch named") +
        (dropped.length ? ` (${dropped.length} item(s) dropped as not supported by the diff, listed under Disagreements)` : ""),
      coherent,
    },
  };
}
