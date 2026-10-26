// W 1d item 1, appendix Probability rank 1: "Failure mode (primary): how the change can fail:
// infra, security or domain", extracted from "The diff, an LLM read as a second opinion only".
// Ignore case: "Docs- or test-only changes".
import { ref, type Diff } from "../diff";
import { askJson, llmAvailable } from "../llm";
import type { PrMeta } from "../pr";
import type { Signal } from "../types";

export type Mode = "infra" | "security" | "domain";

// First match wins, applied to each changed file's path.
const RULES: { mode: Mode | "docs/tests"; test: RegExp }[] = [
  { mode: "docs/tests", test: /\.(md|mdx|txt)$|(^|\/)docs\/|(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[jt]sx?$/i },
  { mode: "security", test: /(^|\/)(auth|security|crypto|permissions?|acl|oauth|sessions?)(\/|\.|-|$)|password|cookies?\.|secret/i },
  {
    mode: "infra",
    test: /(^|\/)(infrastructure|infra|observability|fireweave|\.github|docker|scripts|deploy|terraform|k8s|helm|config)(\/|$)|Dockerfile|compose[^/]*\.ya?ml$|(^|\/)package\.json$|bun\.lock$/i,
  },
  { mode: "domain", test: /./ },
];

export interface FailureModeFacts {
  perFile: { path: string; mode: Mode | "docs/tests"; at: string }[];
  modes: Mode[];
}

export function failureModeFacts(diff: Diff): FailureModeFacts {
  const perFile = diff.files.map((f) => {
    const first = f.added[0] ?? f.removed[0];
    return {
      path: f.path,
      mode: RULES.find((r) => r.test.test(f.path))!.mode,
      at: first ? ref(first, diff.base) : `${f.path}:1`,
    };
  });
  const modes = [...new Set(perFile.map((p) => p.mode).filter((m): m is Mode => m !== "docs/tests"))].sort();
  return { perFile, modes };
}

export function failureModeSignal(facts: FailureModeFacts): Signal {
  return {
    name: "Failure mode",
    value: facts.modes.length ? facts.modes.join(", ") : "none (docs- or test-only)",
    source: "measured",
    evidence: facts.perFile.map((p) => p.at),
    note: `rules on touched paths: ${facts.perFile.map((p) => `${p.path} -> ${p.mode}`).join("; ")}. Matched on file path; each evidence line is the file's first change`,
  };
}

const SCHEMA = {
  type: "object",
  properties: {
    modes: { type: "array", items: { type: "string", enum: ["infra", "security", "domain"] } },
    reason: { type: "string" },
  },
  required: ["modes", "reason"],
  additionalProperties: false,
};

/** LLM second opinion. Unavailable without ANTHROPIC_API_KEY; tagged assumed (a model opinion). */
export async function failureModeSecondOpinion(
  diffText: string,
  pr: PrMeta | null,
  rules: FailureModeFacts,
  ask: typeof askJson = askJson,
  available = llmAvailable(),
  withheld: string | null = null,
): Promise<Signal & { agrees: boolean | null }> {
  const name = "Failure mode (LLM second opinion)";
  const unavailable = (note: string) => ({ name, value: "unavailable", source: "assumed" as const, evidence: [], note, agrees: null });
  if (!available) return unavailable("no ANTHROPIC_API_KEY; rules only");
  if (withheld) return unavailable(`diff not sent to the LLM: ${withheld}`);
  const answer = await ask<{ modes: string[]; reason: string }>(
    "You classify how a code change can fail in production. Modes: infra (resources, latency, availability, config, build), " +
      "security (auth, secrets, permissions, data exposure), domain (wrong business values or behaviour that error rates cannot see). " +
      "Return every mode that applies.",
    `PR title: ${pr?.title ?? "(none)"}\n\nPR description:\n${pr?.body ?? "(none)"}\n\nDiff:\n${diffText}`,
    SCHEMA,
  );
  if (!answer) return unavailable("LLM call failed or was refused");
  const modes = [...new Set(answer.modes)].sort();
  const agrees = modes.join(",") === rules.modes.join(",");
  return {
    name,
    value: modes.join(", ") || "none",
    source: "assumed",
    evidence: [],
    note: `${agrees ? "agrees with" : "disagrees with"} the rules (${rules.modes.join(", ")}). ${answer.reason}`,
    agrees,
  };
}

/** Spec "LLM use": "Log code-vs-model disagreement as lowered confidence." */
export function llmDisagreements(agrees: boolean | null, rules: FailureModeFacts, llm: Signal): string[] {
  return agrees === false ? [`failure mode: rules say ${rules.modes.join(", ")}, LLM second opinion says ${llm.value}`] : [];
}
