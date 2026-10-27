// Runs the whole chain for a range and returns the brief data.
import type { Brief } from "./brief";
import { decide, modeLine } from "./decide";
import { buildPlan } from "./plan";
import { oneUnknown, unknownText } from "./unknown";
import { addProse } from "./prose";
import { makeQuoter } from "./render";
import { contextLines, diffText, loadDiff } from "./diff";
import { INTERNAL_SIGNATURES, redAdvisory, runGates, secretsAtBase } from "./gates";
import { Git } from "./git";
import { applyPolicy } from "./policy";
import { findPrFiles, loadPr } from "./pr";
import { confidenceFacts, confidenceSignals } from "./signals/confidence";
import { detectionDisagreements, detectionFacts, detectionSignal, perMode } from "./signals/detection";
import { historyFacts, historySignal } from "./signals/history";
import { failureModeFacts, failureModeSignal, llmDisagreements } from "./signals/failureMode";
import { applyRuling, modelContract } from "./model";
import { featureFlag, flagFacts } from "./signals/flag";
import { pathFacts, pathSignal } from "./signals/path";
import { reachFacts, reachSignal } from "./signals/reach";
import { revertFacts, revertSignal } from "./signals/revert";
import { reversibility } from "./signals/reversible";

export interface RunOptions {
  repo: string;
  range: string;
  prFile: string | null;
}

export async function buildBrief(opts: RunOptions): Promise<Brief> {
  const diff = loadDiff(opts.repo, opts.range);
  // The PR export is a declared input; it may be absent for a range.
  const prFiles = opts.prFile ? [opts.prFile] : findPrFiles(diff.base, diff.head);
  const pr = await loadPr(prFiles[0] ?? null);
  const gates = runGates(diff, pr);
  const flags = flagFacts(diff);
  const paths = pathFacts(diff);
  const reach = reachFacts(diff);
  const failure = failureModeFacts(diff);
  const detection = detectionFacts(diff, failure);
  // Never send a diff with a detected secret to the API.
  const secretHit = gates[0].checks.some((c) => c.name === "secrets" && c.status === "trip");
  const confFacts = confidenceFacts(diff, pr);
  const conf = confidenceSignals(confFacts, pr !== null);
  const commitMessage = new Git(diff.repo).run(["log", "--no-merges", "--format=%B", `${diff.base}..${diff.head}`]);
  const ruleSignals = {
    early: [reversibility(diff), featureFlag(diff, flags), pathSignal(paths), reachSignal(reach), failureModeSignal(failure)],
    late: [detectionSignal(detection), revertSignal(revertFacts(diff)), historySignal(historyFacts(diff)), ...conf.signals],
  };
  // The model sees the assumed values after the missing-data policy has rounded them (W 2), as the brief shows them.
  const rounded = applyPolicy([...ruleSignals.early, ...ruleSignals.late], conf.measuredLevel, []).signals;
  const quote = makeQuoter(diff.repo, diff.base, diff.head);
  const fullDiff = diffText(diff);
  // Secret or PII values on lines the PR did not add: redacted from the payload, listed, not a trip.
  const atBase = secretsAtBase(diff, contextLines(fullDiff));
  const contract = await modelContract(
    fullDiff, rounded, pr, commitMessage, failure, quote, diff.base.slice(0, 7), undefined, undefined, secretHit ? "gate 1 found a secret in the diff" : null,
  );
  const { agrees: llmAgrees, ...failureLlm } = contract.failureMode;
  const { coherent, ...coherence } = contract.coherence;
  const extracted = [...ruleSignals.early, failureLlm, ...ruleSignals.late, coherence, ...(atBase ? [atBase] : [])];
  // W 2: "Measured beats declared" - the catalog (declared) is checked against the code (measured).
  const disagreements: string[] = [
    ...detectionDisagreements(detection),
    ...conf.disagreements,
    ...llmDisagreements(llmAgrees, failure, failureLlm),
    // A refused model proposal is a code-vs-model disagreement.
    ...contract.ruling.refused,
    // Declared inputs that conflict: two PR exports for one range.
    ...(prFiles.length > 1 ? [`${prFiles.length} PR exports match this range (${prFiles.map((f) => f.split("/").slice(-2, -1)[0]).join(", ")}); the first is used`] : []),
  ];
  const measuredWhy = [...conf.why];
  if (atBase) measuredWhy.push(`${atBase.name}: ${atBase.value} (${atBase.source}), ${atBase.note}`);
  // The LLM may only lower confidence; a mismatch counts like a measured negative but never moves the mode.
  if (coherent === false) measuredWhy.push("LLM found mismatches between the diff and the task (can only lower confidence)");
  const notches = gates
    .flatMap((g) => g.checks.filter((c) => c.name === INTERNAL_SIGNATURES).map((c) => `gate ${g.gate}: ${c.evidence.length} export(s) removed or changed in modules internal to the repo (declared by package.json)`));
  // Unit 5: each red check nothing requires lowers confidence one notch.
  notches.push(...redAdvisory(pr).map((c) => `gate 1: red advisory check ${c.name} (${c.conclusion}), not required on the repo`));
  // Confidence is computed before accepted proposals are applied, so a model answer can only lower it.
  const policy = applyPolicy(extracted, conf.measuredLevel, disagreements, notches);
  const signals = applyRuling(policy.signals, contract.ruling);
  const finalLevel = coherent === false && policy.level !== "low" ? "low" : policy.level;

  const decisionInput = { gates, signals, measuredConfidence: conf.measuredLevel, coherent };
  const decision = decide(decisionInput);
  const assumedProbability = signals.filter((s) => s.source === "assumed" && policy.why.some((w) => w.startsWith(`${s.name}:`))).map((s) => s.name);
  const unknown = unknownText(oneUnknown(decisionInput, assumedProbability));
  const plan = buildPlan({
    decision,
    signals,
    detectors: perMode(detection),
    flagKey: flags.flags[0]?.key ?? null,
    owner: ownerOf(confFacts.fileAuthors),
    codeowners: new Git(diff.repo).listFiles(diff.head).some((p) => /(^|\/)CODEOWNERS$/.test(p)),
  });

  return {
    base: diff.base,
    head: diff.head,
    // Without the PR export (declared), the head commit's subject (git) names the change.
    title: pr?.title ?? new Git(diff.repo).run(["log", "-1", "--format=%s", diff.head]).trim().replace(/\.$/, ""),
    titleSource: pr ? "PR title, declared" : "head commit subject, measured from git (no PR export found)",
    files: diff.files.map((f) => ({ path: f.path, status: f.status, added: f.added.length, removed: f.removed.length })),
    gates,
    signals,
    mode: decision.mode,
    modeLine: modeLine(decision),
    plan,
    reasons: await addProse(decision.reasons, makeQuoter(diff.repo, diff.base, diff.head), undefined, undefined, secretHit),
    confidence: { level: finalLevel, why: [...measuredWhy, ...policy.why] },
    unknown,
    disagreements,
  };
}

/** The earlier author who touched the most of the changed files; ties break by name. */
function ownerOf(fileAuthors: { file: string; authors: string[] }[]): string | null {
  const count = new Map<string, number>();
  for (const fa of fileAuthors) for (const a of fa.authors) count.set(a, (count.get(a) ?? 0) + 1);
  const ranked = [...count].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return ranked[0]?.[0] ?? null;
}
