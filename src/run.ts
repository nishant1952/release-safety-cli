// Runs the whole chain for a range and returns the brief data. measure reads the repo (git, ts-morph) and
// returns plain JSON; decide turns that into a brief without reading anything but quoted lines. buildBrief
// is the two composed.
import type { Brief } from "./brief";
import { decide as grid, modeLine, type Decision } from "./decide";
import { buildPlan } from "./plan";
import { oneUnknown, unknownText } from "./unknown";
import { addProse } from "./prose";
import { makeQuoter, renderFull, renderShort } from "./render";
import { contextLines, diffText, loadDiff } from "./diff";
import { INTERNAL_SIGNATURES, redAdvisory, runGates, secretsAtBase } from "./gates";
import { Git } from "./git";
import { applyPolicy } from "./policy";
import { findPrFiles, loadPr, type PrMeta } from "./pr";
import { confidenceFacts, confidenceSignals, type Level } from "./signals/confidence";
import { detectionDisagreements, detectionFacts, detectionSignal, perMode, type ModeResult } from "./signals/detection";
import { historyFacts, historySignal } from "./signals/history";
import { failureModeFacts, failureModeSignal, llmDisagreements, type FailureModeFacts } from "./signals/failureMode";
import { askJson, askWithKey, llmAvailable, type CallProgress } from "./llm";
import { applyOverrides, type Overrides } from "./overrides";
import { applyRuling, citationContext, modelContract, relabelFilled, type CitationContext } from "./model";
import { featureFlag, flagFacts, type FlagFacts, type LineClass } from "./signals/flag";
import { pathFacts, pathSignal } from "./signals/path";
import { reachFacts, reachSignal } from "./signals/reach";
import { revertFacts, revertSignal } from "./signals/revert";
import { reversibility } from "./signals/reversible";
import type { GateResult, Signal } from "./types";

export interface RunOptions {
  repo: string;
  range: string;
  prFile: string | null;
  /** a stand-in for the model call (tests); when given, the model is treated as available */
  ask?: typeof askJson;
  /** owner values and switches (--overrides) */
  overrides?: Overrides;
}

/** CitationContext with its sets as arrays, so it survives JSON. */
type CitationJson = { [K in keyof CitationContext]: CitationContext[K] extends Set<infer T> ? T[] : CitationContext[K] };

/**
 * Everything read from the repo and the PR export for one range. Plain JSON: it can be written to disk and
 * read back, and decide needs nothing else except the repo to quote lines from.
 */
export interface Measured {
  repo: string;
  base: string;
  head: string;
  title: string;
  titleSource: string;
  files: Brief["files"];
  /** the PR export used (declared), and every export that matched the range */
  pr: PrMeta | null;
  prFiles: string[];
  gates: GateResult[];
  /** rule signals in brief order: the model's failure-mode read goes between early and late */
  early: Signal[];
  late: Signal[];
  /** flag facts with the line classes as entries, so the flag signal can be recomputed */
  flag: Omit<FlagFacts, "lines"> & { lines: [string, LineClass][] };
  confidence: { measuredLevel: Level; why: string[]; disagreements: string[] };
  detectionDisagreements: string[];
  detectors: ModeResult[];
  failure: FailureModeFacts;
  /** what the model is shown: commit messages and the range's diff with context */
  commitMessage: string;
  diffText: string;
  /** "Secrets present at base", when observed */
  atBase: Signal | null;
  citation: CitationJson;
  /** gate 1 found a secret on an added line: nothing is sent to the model */
  secretHit: boolean;
  owner: string | null;
  codeowners: boolean;
}

/** The brief, its markdown in both layouts, and the grid cell it came from. */
export interface Decided {
  brief: Brief;
  /** the short layout, the default */
  markdown: string;
  /** the full layout (the CLI's --full) */
  fullMarkdown: string;
  cell: Pick<Decision, "damage" | "window" | "gridMode" | "gateMode" | "shifted" | "llmStep">;
}

export interface DecideOptions {
  /** a stand-in for the model call (tests); when given, the model is treated as available */
  ask?: typeof askJson;
  /** quotes an evidence line; defaults to git at the measured range */
  quote?: (ref: string) => string | null;
  /** each model call made with modelKey, when it starts and when it ends */
  progress?: (p: CallProgress) => void;
}

export async function buildBrief(opts: RunOptions): Promise<Brief> {
  const diff = loadDiff(opts.repo, opts.range);
  // The PR export is a declared input; it may be absent for a range.
  const prFiles = opts.prFile ? [opts.prFile] : findPrFiles(diff.base, diff.head);
  const pr = await loadPr(prFiles[0] ?? null);
  return (await decide(measure(opts.repo, opts.range, pr, prFiles), opts.overrides, undefined, { ask: opts.ask })).brief;
}

/** The expensive part: git reads and ts-morph. Never depends on the model or on anything a person enters. */
export function measure(
  repo: string,
  range: string,
  pr: PrMeta | null,
  prFiles: string[] = pr ? [pr.file] : [],
  /** told when each stage ends, with its time in ms (the demo streams these) */
  onStage: (stage: string, ms: number) => void = () => {},
): Measured {
  const stage = <T>(name: string, run: () => T): T => {
    const started = performance.now();
    const out = run();
    onStage(name, Math.round(performance.now() - started));
    return out;
  };
  const diff = stage("diff", () => loadDiff(repo, range));
  const git = new Git(diff.repo);
  const gates = stage("gates", () => runGates(diff, pr));
  const flags = stage("feature flag", () => flagFacts(diff));
  const paths = stage("path", () => pathFacts(diff));
  const reach = stage("reach", () => reachFacts(diff));
  const failure = failureModeFacts(diff);
  const detection = stage("detection", () => detectionFacts(diff, failure));
  // Never send a diff with a detected secret to the API.
  const secretHit = gates[0].checks.some((c) => c.name === "secrets" && c.status === "trip");
  const confFacts = stage("confidence", () => confidenceFacts(diff, pr));
  const conf = confidenceSignals(confFacts, pr !== null);
  const early = stage("reversibility", () => [reversibility(diff), featureFlag(flags), pathSignal(paths), reachSignal(reach), failureModeSignal(failure)]);
  const late = stage("revert and history", () => [detectionSignal(detection), revertSignal(revertFacts(diff)), historySignal(historyFacts(diff)), ...conf.signals]);
  const fullDiff = diffText(diff);
  const ctx = citationContext(diff, paths, reach, secretHit);
  return {
    repo,
    base: diff.base,
    head: diff.head,
    // Without the PR export (declared), the head commit's subject (git) names the change.
    title: pr?.title ?? git.run(["log", "-1", "--format=%s", diff.head]).trim().replace(/\.$/, ""),
    titleSource: pr ? "PR title, declared" : "head commit subject, measured from git (no PR export found)",
    files: diff.files.map((f) => ({ path: f.path, status: f.status, added: f.added.length, removed: f.removed.length })),
    pr,
    prFiles,
    gates,
    early,
    late,
    flag: { ...flags, lines: [...flags.lines] },
    confidence: { measuredLevel: conf.measuredLevel, why: conf.why, disagreements: conf.disagreements },
    detectionDisagreements: detectionDisagreements(detection),
    detectors: perMode(detection),
    failure,
    commitMessage: git.run(["log", "--no-merges", "--format=%B", `${diff.base}..${diff.head}`]),
    diffText: fullDiff,
    // Secret or PII values on lines the PR did not add: redacted from the payload, listed, not a trip.
    atBase: secretsAtBase(diff, contextLines(fullDiff)),
    citation: { ...ctx, pathFiles: [...ctx.pathFiles], entries: [...ctx.entries], handlers: [...ctx.handlers], changed: [...ctx.changed] },
    secretHit,
    owner: ownerOf(confFacts.fileAuthors),
    codeowners: git.listFiles(diff.head).some((p) => /(^|\/)CODEOWNERS$/.test(p)),
  };
}

/**
 * Owner overrides, then the model contract, the missing-data policy, the grid, the one unknown, the plan and the
 * markdown. modelKey is used for the model calls in place of ANTHROPIC_API_KEY.
 */
export async function decide(m: Measured, overrides: Overrides = {}, modelKey?: string, opts: DecideOptions = {}): Promise<Decided> {
  const { failure, secretHit } = m;
  // The owner's values replace assumed ones before the model is asked, so the model sees only what is still assumed.
  const { early, late, pr, gates, atBase, disagreements: ownerDisagreements, switches } = applyOverrides(m, overrides);
  // The model sees the assumed values after the missing-data policy has rounded them (W 2), as the brief shows them.
  const rounded = applyPolicy([...early, ...late], m.confidence.measuredLevel, []).signals;
  const quote = opts.quote ?? makeQuoter(m.repo, m.base, m.head);
  const ctx: CitationContext = {
    ...m.citation,
    pathFiles: new Set(m.citation.pathFiles),
    entries: new Set(m.citation.entries),
    handlers: new Set(m.citation.handlers),
    changed: new Set(m.citation.changed),
  };
  const ask = opts.ask ?? (modelKey ? askWithKey(modelKey, opts.progress) : undefined);
  const available = ask ? true : llmAvailable();
  const withheld = secretHit ? "gate 1 found a secret in the diff" : overrides.model === false ? "the model is switched off" : null;
  const contract = await modelContract(m.diffText, rounded, pr, m.commitMessage, failure, quote, ctx, m.base.slice(0, 7), ask, available, withheld);
  const { agrees: llmAgrees, ...failureLlm } = contract.failureMode;
  const { coherent, ...coherence } = contract.coherence;
  const extracted = [...early, failureLlm, ...late, coherence, ...(atBase ? [atBase] : [])];
  // W 2: "Measured beats declared" - the catalog (declared) is checked against the code (measured).
  const disagreements: string[] = [
    ...m.detectionDisagreements,
    ...m.confidence.disagreements,
    ...llmDisagreements(llmAgrees, failure, failureLlm),
    // Declared inputs that conflict: two PR exports for one range.
    ...(m.prFiles.length > 1 ? [`${m.prFiles.length} PR exports match this range (${m.prFiles.map((f) => f.split("/").slice(-2, -1)[0]).join(", ")}); the first is used`] : []),
    ...ownerDisagreements,
  ];
  const measuredWhy = [...m.confidence.why];
  if (atBase) measuredWhy.push(`${atBase.name}: ${atBase.value} (${atBase.source}), ${atBase.note}`);
  // The LLM may only lower confidence; a mismatch counts like a measured negative but never moves the mode.
  if (coherent === false) measuredWhy.push("LLM found mismatches between the diff and the task (can only lower confidence)");
  const notches = gates
    .flatMap((g) => g.checks.filter((c) => c.name === INTERNAL_SIGNATURES).map((c) => `gate ${g.gate}: ${c.evidence.length} export(s) removed or changed in modules internal to the repo (declared by package.json)`));
  // Unit 5: each red check nothing requires lowers confidence one notch.
  notches.push(...redAdvisory(pr).map((c) => `gate 1: red advisory check ${c.name} (${c.conclusion}), not required on the repo`));
  // Confidence is computed before accepted proposals are applied, so a model answer can only lower it.
  const policy = applyPolicy(extracted, m.confidence.measuredLevel, disagreements, notches);
  const signals = applyRuling(policy.signals, contract.ruling);
  const finalLevel = coherent === false && policy.level !== "low" ? "low" : policy.level;

  const decisionInput = { gates, signals, measuredConfidence: m.confidence.measuredLevel, coherent };
  const decision = grid(decisionInput);
  const assumedProbability = signals.filter((s) => s.source === "assumed" && policy.why.some((w) => w.startsWith(`${s.name}:`))).map((s) => s.name);
  const moves = oneUnknown(decisionInput, assumedProbability);
  const unknown = unknownText(moves);
  const plan = buildPlan({ decision, signals, detectors: m.detectors, flagKey: m.flag.flags[0]?.key ?? null, owner: m.owner, codeowners: m.codeowners });

  const { damage, window, undoFast, detectFast, gridMode, gateMode, shifted, llmStep, flagAdvice } = decision;
  const brief: Brief = {
    base: m.base,
    head: m.head,
    title: m.title,
    titleSource: m.titleSource,
    files: m.files,
    gates,
    signals,
    mode: decision.mode,
    modeLine: modeLine(decision),
    plan,
    reasons: await addProse(decision.reasons, quote, ask, available, withheld !== null),
    confidence: {
      level: finalLevel,
      why: [...measuredWhy, ...relabelFilled(policy.why, contract.ruling)],
      measuredLevel: m.confidence.measuredLevel,
      measured: m.confidence.why,
    },
    unknown,
    // A refused model proposal is a code-vs-model disagreement, listed with the rule that refused it. It does not
    // lower confidence: code kept the assumed value, so nothing the decision rests on changed.
    // A coherence item the diff does not support is listed the same way, without lowering confidence.
    disagreements: [...disagreements, ...contract.ruling.refused, ...contract.unsupported],
    cell: { damage, window, undoFast, detectFast, gridMode, gateMode, shifted, llmStep, flagAdvice },
    moves,
    detectors: m.detectors,
    switches,
    proposals: { accepted: contract.ruling.accepted.length, refused: contract.ruling.refused.length },
  };
  return { brief, markdown: renderShort(brief, quote), fullMarkdown: renderFull(brief, quote), cell: { damage, window, gridMode, gateMode, shifted, llmStep } };
}

/** The earlier author who touched the most of the changed files; ties break by name. */
function ownerOf(fileAuthors: { file: string; authors: string[] }[]): string | null {
  const count = new Map<string, number>();
  for (const fa of fileAuthors) for (const a of fa.authors) count.set(a, (count.get(a) ?? 0) + 1);
  const ranked = [...count].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return ranked[0]?.[0] ?? null;
}
