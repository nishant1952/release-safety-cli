// Dev helper: print one unit's raw output for a range, for hand checks and reviews.
// Usage: bun run unit <unit> <repo> <base>..<head>
import { loadDiff } from "../diff";
import { runGates } from "../gates";
import { findPrFile, loadPr } from "../pr";
import { featureFlag, flagFacts } from "../signals/flag";
import { pathFacts, pathSignal } from "../signals/path";
import { reachFacts, reachSignal } from "../signals/reach";
import { failureModeFacts, failureModeSecondOpinion, failureModeSignal } from "../signals/failureMode";
import { diffText } from "../diff";
import { detectionDisagreements, detectionFacts, detectionSignal } from "../signals/detection";
import { historyFacts, historySignal } from "../signals/history";
import { coherenceCheck, confidenceFacts, confidenceSignals } from "../signals/confidence";
import { revertFacts, revertSignal } from "../signals/revert";
import { reversibility } from "../signals/reversible";
import type { Signal } from "../types";

function printSignal(s: Signal<unknown>) {
  console.log(`${s.name}: ${JSON.stringify(s.value)} [${s.source}]\n  ${s.note}`);
  for (const e of s.evidence) console.log(`    ${e}`);
}

const [unit, repo, range] = process.argv.slice(2);
const diff = loadDiff(repo, range);
const pr = await loadPr(findPrFile(diff.base, diff.head));

switch (unit) {
  case "diff":
    console.log(`base ${diff.base}\nhead ${diff.head}`);
    for (const f of diff.files) console.log(`${f.status.padEnd(8)} +${f.added.length} -${f.removed.length}  ${f.path}`);
    console.log("buckets:");
    for (const [dir, files] of Object.entries(diff.buckets)) console.log(`  ${dir}: ${files.join(", ")}`);
    console.log(`added lines: ${diff.added.length}, removed lines: ${diff.removed.length}`);
    for (const l of [diff.added[0], diff.added[diff.added.length - 1]]) console.log(`  ${l.file}:${l.line}  ${l.text}`);
    break;
  case "gates":
    for (const g of runGates(diff, pr)) {
      console.log(`gate ${g.gate} ${g.name}: ${g.status} -> route ${g.route}`);
      for (const c of g.checks) {
        console.log(`  - ${c.name}: ${c.status} [${c.source}] ${c.note}`);
        for (const e of c.evidence) console.log(`      ${e}`);
      }
    }
    break;
  case "reversible":
    printSignal(reversibility(diff));
    break;
  case "flag": {
    const facts = flagFacts(diff);
    console.log("flags:", JSON.stringify(facts.flags));
    printSignal(featureFlag(diff, facts));
    const group = new Map<string, string[]>();
    for (const [r, c] of facts.lines) (group.get(c) ?? group.set(c, []).get(c)!).push(r);
    for (const [c, rs] of group) console.log(`${c} (${rs.length}): ${rs.join(" ")}`);
    break;
  }
  case "path": {
    const facts = pathFacts(diff);
    console.log("entries:", facts.entries.join(", "));
    for (const [f, c] of facts.chains) console.log(`  ${f}: ${c === null ? "UNREACHED" : c.map((h) => `${h.file}:${h.line}`).join(" -> ") || "(entry)"}`);
    for (const r of facts.routes) console.log("  route:", JSON.stringify(r));
    printSignal(pathSignal(facts));
    break;
  }
  case "reach": {
    const facts = reachFacts(diff, process.argv.includes("--ignore-declared"));
    for (const e of facts.endpoints) console.log(`endpoint ${e.path}\n    ${e.via.join("\n    ")}`);
    for (const h of facts.handlers) console.log(`handler ${h.method} ${h.path} at ${h.at}: ${h.calls.join(", ")}`);
    console.log("catalog:", JSON.stringify(facts.catalog));
    printSignal(reachSignal(facts));
    break;
  }
  case "failure-mode": {
    const facts = failureModeFacts(diff);
    printSignal(failureModeSignal(facts));
    printSignal(await failureModeSecondOpinion(diffText(diff), pr, facts));
    break;
  }
  case "detection": {
    const facts = detectionFacts(diff, process.argv.includes("--ignore-declared"));
    console.log(JSON.stringify({ ...facts, emits: facts.emits.length }, null, 1));
    for (const e of facts.emits) console.log(`  ${e.at} ${e.via} ${e.name}`);
    printSignal(detectionSignal(facts));
    console.log("disagreements:", detectionDisagreements(facts));
    break;
  }
  case "history": {
    const facts = historyFacts(diff);
    console.log(`shallow ${facts.shallow}, span ${JSON.stringify(facts.span)}`);
    for (const c of facts.commits) console.log(`  ${c.sha} revert=${c.revert} fix=${c.fix} ${c.subject}`);
    printSignal(historySignal(facts));
    break;
  }
  case "confidence": {
    const ignore = process.argv.includes("--ignore-declared");
    const facts = confidenceFacts(diff, ignore ? null : pr);
    console.log(JSON.stringify({ ...facts, fileAuthors: facts.fileAuthors.map((f) => `${f.file}:${f.authors.length}`) }));
    const r = confidenceSignals(facts, !ignore);
    for (const s of r.signals) printSignal(s);
    const { coherent, ...coh } = await coherenceCheck("", pr, "");
    printSignal(coh);
    console.log(`measured level: ${r.measuredLevel}\nwhy: ${r.why.join(" | ")}\ndisagreements: ${JSON.stringify(r.disagreements)}`);
    break;
  }
  case "revert": {
    const facts = revertFacts(diff, process.argv.includes("--ignore-declared"));
    console.log(JSON.stringify(facts));
    printSignal(revertSignal(facts));
    break;
  }
  default:
    console.error(`unknown unit ${unit}`);
    process.exit(1);
}
