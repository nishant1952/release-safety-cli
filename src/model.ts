// The model contract (Round 3, Unit 6). One structured call. The model sees the diff and the assumed
// signals only, never measured or declared signals, gate results or the mode. For each assumed signal
// it says "no change" or proposes a value one step away on that signal's scale, citing the line it
// rests on. Code accepts a proposal only when the cited line exists and the step is within one; an
// accepted value is tagged "model (cited)". The same call also answers the failure-mode and
// diff-vs-task questions, which can only lower confidence or tighten the mode.
import { withoutSensitiveFiles } from "./gates";
import { askJson, llmAvailable, NO_CREDENTIAL } from "./llm";
import POLICY from "./policy.json";
import type { PrMeta } from "./pr";
import type { FailureModeFacts } from "./signals/failureMode";
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
  coherence: { coherent: boolean; mismatches: string[] };
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
      properties: { coherent: { type: "boolean" }, mismatches: { type: "array", items: { type: "string" } } },
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
  "say, nothing missing, nothing extra; list each concrete mismatch.";

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

/** Code's check on each proposal. quote returns the text at a cited line, or null when it does not exist. */
export function judge(proposals: Proposal[], signals: Signal[], quote: (ref: string) => string | null, base7?: string): Ruling {
  const accepted: Ruling["accepted"] = [];
  const refused: string[] = [];
  for (const p of proposals.filter((p) => p.change === "propose")) {
    const s = signals.find((x) => x.name === p.signal);
    const refuse = (why: string) => refused.push(`model proposed ${p.signal} = "${p.value}" (cites ${p.cite || "nothing"}); refused: ${why}`);
    if (!s) refuse("no such signal");
    else if (s.source !== "assumed") refuse(`${s.name} is ${s.source}; the model may only fill assumed signals`);
    else if (!SCALES[s.name]) refuse(`${s.name} has no scale the model may move on`);
    else if (accepted.some((a) => a.signal === s.name)) refuse("a second proposal for the same signal");
    else {
      const scale = SCALES[s.name];
      const from = scale.indexOf(s.value);
      const to = scale.indexOf(p.value);
      const cite = p.cite.trim();
      const sha = cite.match(/@([0-9a-f]+):\d+$/)?.[1];
      const text = cite && (!sha || !base7 || sha === base7) ? quote(cite) : null;
      if (to === -1) refuse(`"${p.value}" is not on the scale ${scale.join(" < ")}`);
      else if (to === from) continue;
      else if (Math.abs(to - from) > 1) refuse(`${Math.abs(to - from)} steps from "${s.value}"; at most one is allowed`);
      else if (!text?.trim()) refuse(cite ? `the cited line ${cite} is blank or does not exist in the diff or at the head revision` : "no line cited");
      else accepted.push({ signal: s.name, from: s.value, to: p.value, cite, reasoning: p.reasoning.trim() });
    }
  }
  return { accepted, refused };
}

/** Accepted proposals replace their assumed signal's value, tagged "model (cited)" with the citation as evidence. */
export function applyRuling(signals: Signal[], ruling: Ruling): Signal[] {
  return signals.map((s) => {
    const a = ruling.accepted.find((x) => x.signal === s.name);
    return a
      ? { ...s, value: a.to, source: "model (cited)" as const, evidence: [a.cite], note: `model (cited): ${a.reasoning} Was "${a.from}" (assumed): ${s.note}` }
      : s;
  });
}

export interface Contract {
  ruling: Ruling;
  failureMode: Signal & { agrees: boolean | null };
  coherence: Signal & { coherent: boolean | null };
}

/** One call; without a key, or with a secret in the diff, nothing is sent and every assumed signal stays assumed. */
export async function modelContract(
  diffText: string,
  signals: Signal[],
  pr: PrMeta | null,
  commitMessage: string,
  rules: FailureModeFacts,
  quote: (ref: string) => string | null,
  base7: string,
  ask: typeof askJson = askJson,
  available = llmAvailable(),
  withheld: string | null = null,
): Promise<Contract> {
  const fmName = "Failure mode (LLM second opinion)";
  const cohName = "Confidence: diff vs task (LLM)";
  const off = (note: string, fmNote = note): Contract => ({
    ruling: { accepted: [], refused: [] },
    failureMode: { name: fmName, value: "unavailable", source: "assumed", evidence: [], note: fmNote, agrees: null },
    coherence: { name: cohName, value: "unavailable", source: "assumed", evidence: [], note, coherent: null },
  });
  if (!available) return off(NO_CREDENTIAL, `${NO_CREDENTIAL}; rules only`);
  if (withheld) return off(`diff not sent to the LLM: ${withheld}`);
  const answer = await ask<ContractAnswer>(SYSTEM, contractPrompt(diffText, signals, pr, commitMessage, base7), CONTRACT_SCHEMA, "model contract");
  if (!answer) return off("LLM call failed or was refused");
  const modes = [...new Set(answer.failure_modes.modes)].sort();
  const agrees = modes.join(",") === rules.modes.join(",");
  return {
    ruling: judge(answer.proposals, signals, quote, base7),
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
      value: answer.coherence.coherent ? "coherent" : "mismatch",
      source: "assumed",
      evidence: [],
      note: answer.coherence.mismatches.length ? answer.coherence.mismatches.join("; ") : "no mismatch named",
      coherent: answer.coherence.coherent,
    },
  };
}
