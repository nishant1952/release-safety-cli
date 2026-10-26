// Runs the whole chain for a range and returns the brief data.
import type { Brief, Reason } from "./brief";
import { diffText, loadDiff } from "./diff";
import { runGates } from "./gates";
import { Git } from "./git";
import { applyPolicy } from "./policy";
import { findPrFile, loadPr } from "./pr";
import { coherenceCheck, confidenceFacts, confidenceSignals } from "./signals/confidence";
import { detectionDisagreements, detectionFacts, detectionSignal } from "./signals/detection";
import { historyFacts, historySignal } from "./signals/history";
import { failureModeFacts, failureModeSecondOpinion, failureModeSignal, llmDisagreements } from "./signals/failureMode";
import { featureFlag, flagFacts } from "./signals/flag";
import { pathFacts, pathSignal } from "./signals/path";
import { reachFacts, reachSignal } from "./signals/reach";
import { revertFacts, revertSignal } from "./signals/revert";
import { reversibility } from "./signals/reversible";

export interface RunOptions {
  repo: string;
  range: string;
  ignoreDeclared: boolean;
  prFile: string | null;
}

export async function buildBrief(opts: RunOptions): Promise<Brief> {
  const diff = loadDiff(opts.repo, opts.range);
  // --ignore-declared drops every declared input; the PR export is one.
  const pr = opts.ignoreDeclared ? null : await loadPr(opts.prFile ?? findPrFile(diff.base, diff.head));
  const gates = runGates(diff, pr);
  const flags = flagFacts(diff);
  const paths = pathFacts(diff, opts.ignoreDeclared);
  const reach = reachFacts(diff, opts.ignoreDeclared);
  const failure = failureModeFacts(diff);
  const detection = detectionFacts(diff, failure, opts.ignoreDeclared);
  // Never send a diff with a detected secret to the API.
  const secretHit = gates[0].checks.some((c) => c.name === "secrets" && c.status === "trip");
  const { agrees: llmAgrees, ...failureLlm } = await failureModeSecondOpinion(
    diffText(diff), pr, failure, undefined, undefined, secretHit ? "gate 1 found a secret in the diff" : null,
  );
  const conf = confidenceSignals(confidenceFacts(diff, pr), pr !== null);
  const commitMessage = new Git(diff.repo).run(["log", "--no-merges", "--format=%B", `${diff.base}..${diff.head}`]);
  const { coherent, ...coherence } = await coherenceCheck(
    diffText(diff), pr, commitMessage, undefined, undefined, secretHit ? "gate 1 found a secret in the diff" : null,
  );
  const extracted = [
    reversibility(diff),
    featureFlag(diff, flags),
    pathSignal(paths),
    reachSignal(reach),
    failureModeSignal(failure),
    failureLlm,
    detectionSignal(detection),
    revertSignal(revertFacts(diff, opts.ignoreDeclared)),
    historySignal(historyFacts(diff)),
    ...conf.signals,
    coherence,
  ];
  // W 2: "Measured beats declared" - the catalog (declared) is checked against the code (measured).
  const disagreements: string[] = [
    ...detectionDisagreements(detection),
    ...conf.disagreements,
    ...llmDisagreements(llmAgrees, failure, failureLlm),
  ];
  const measuredWhy = [...conf.why];
  // The LLM may only lower confidence; a mismatch counts like a measured negative but never moves the mode.
  if (coherent === false) measuredWhy.push("LLM found mismatches between the diff and the task (can only lower confidence)");
  const policy = applyPolicy(extracted, conf.measuredLevel, disagreements);
  const signals = policy.signals;
  const finalLevel = coherent === false && policy.level !== "low" ? "low" : policy.level;

  const reasons: Reason[] = gates
    .filter((g) => g.route !== "none")
    .map((g) => {
      const failing = g.checks.filter((c) => c.status !== "pass");
      return {
        text: `Gate ${g.gate} (${g.name}) is ${g.status}, routes to ${g.route}: ${failing.map((c) => `${c.name}: ${c.note}`).join("; ")}.`,
        evidence: failing.flatMap((c) => c.evidence),
      };
    });

  return {
    base: diff.base,
    head: diff.head,
    title: pr?.title ?? null,
    files: diff.files.map((f) => ({ path: f.path, status: f.status, added: f.added.length, removed: f.removed.length })),
    gates,
    signals,
    mode: null,
    modeLine: null,
    plan: null,
    reasons,
    confidence: { level: finalLevel, why: [...measuredWhy, ...policy.why] },
    unknown: null,
    disagreements,
  };
}
