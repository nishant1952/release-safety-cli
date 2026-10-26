// bun run brief <repo-path> <base>..<head> [--out file] [--pr pr.json] [--llm-log file]
import { llmSummary, setLlmLogPath } from "./llmlog";
import { makeQuoter, renderBrief } from "./render";
import { buildBrief } from "./run";

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let out: string | null = null;
  let prFile: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out = argv[++i];
    else if (a === "--pr") prFile = argv[++i];
    else if (a === "--llm-log") setLlmLogPath(argv[++i]);
    else positional.push(a);
  }
  if (positional.length !== 2) {
    console.error("usage: bun run brief <repo-path> <base>..<head> [--out file] [--pr pr.json] [--llm-log file]");
    process.exit(2);
  }
  return { repo: positional[0], range: positional[1], out, prFile };
}

const args = parseArgs(process.argv.slice(2));
const brief = await buildBrief(args);
const md = renderBrief(brief, makeQuoter(args.repo, brief.base, brief.head));

if (args.out) await Bun.write(args.out, md);
else process.stdout.write(md);

const summary = llmSummary();
if (summary) process.stderr.write(summary + "\n");
