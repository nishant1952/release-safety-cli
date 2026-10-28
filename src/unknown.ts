// W 2: "Every decision states how confident it is, and names the one unknown that, if answered,
// would most likely change it." Spec: for each assumed signal, flip to its favourable value, rerun,
// report the first flip that changes the mode.
import { decide, type DecisionInput, type Mode } from "./decide";
import type { GateResult, Signal } from "./types";

// Order: gates are evaluated first (W 3), then the write-up's top five (W 1 note), then the rest.
const ORDER = ["Reversible or irreversible", "Path", "Reach", "Failure mode", "Detection apparatus", "Feature flag", "Time to revert"];

/** The value of each decision signal that is best for the release. */
export const FAVOURABLE: Record<string, string> = {
  "Reversible or irreversible": "reversible",
  Path: "unreached",
  Reach: "low",
  "Detection apparatus": "fast",
  "Feature flag": "full",
  "Time to revert": "measured pipeline under 15 minutes",
};

interface Flip {
  what: string;
  from: string;
  to: string;
  apply: (i: DecisionInput) => DecisionInput;
}

function gateFlips(gates: GateResult[]): Flip[] {
  return gates.flatMap((g, gi) =>
    g.checks
      .map((c, ci) => ({ c, ci }))
      .filter(({ c }) => c.status === "unverifiable")
      .map(({ c, ci }) => ({
        what: `gate ${g.gate} ${c.name}`,
        from: "unverifiable",
        to: "pass",
        apply: (i: DecisionInput) => {
          const gatesCopy = i.gates.map((x, xi) => {
            if (xi !== gi) return x;
            const checks = x.checks.map((y, yi) => (yi === ci ? { ...y, status: "pass" as const } : y));
            const status = checks.some((y) => y.status === "trip") ? "trip" : checks.some((y) => y.status === "unverifiable") ? "unverifiable" : "pass";
            return { ...x, checks, status, route: status === "pass" ? ("none" as const) : x.route } as GateResult;
          });
          return { ...i, gates: gatesCopy };
        },
      })),
  );
}

function signalFlips(signals: Signal[]): Flip[] {
  const rank = (n: string) => (ORDER.includes(n) ? ORDER.indexOf(n) : ORDER.length);
  return signals
    .filter((s) => s.source === "assumed" && FAVOURABLE[s.name] !== undefined && s.value !== FAVOURABLE[s.name])
    .sort((a, b) => rank(a.name) - rank(b.name))
    .map((s) => ({
      what: s.name,
      from: s.value,
      to: FAVOURABLE[s.name],
      apply: (i: DecisionInput) => ({ ...i, signals: i.signals.map((x) => (x.name === s.name ? { ...x, value: FAVOURABLE[s.name] } : x)) }),
    }));
}

export interface Unknown {
  base: Mode;
  first: { what: string; from: string; to: string; mode: Mode } | null;
  considered: string[];
  /** the mode with every assumed input at its favourable value */
  allFavourable: Mode;
  /** known (non-assumed) inputs that, made favourable on top of every assumed flip, would change the mode */
  holding: { what: string; mode: Mode }[];
}

/** confidenceSource: where the confidence level came from, "measured" unless the owner declared it. */
export function oneUnknown(input: DecisionInput, assumedProbability: string[], confidenceSource = "measured"): Unknown {
  const base = decide(input).mode;
  const flips = [...gateFlips(input.gates), ...signalFlips(input.signals)];
  let first: Unknown["first"] = null;
  for (const f of flips) {
    const mode = decide(f.apply(input)).mode;
    if (mode !== base) {
      first = { what: f.what, from: f.from, to: f.to, mode };
      break;
    }
  }
  const all = flips.reduce((i, f) => f.apply(i), input);
  const allFavourable = decide(all).mode;
  // Which known inputs actually hold the mode: change each alone, on top of all assumed flips.
  const known: { what: string; apply: (i: DecisionInput) => DecisionInput }[] = all.signals
    .filter((s) => FAVOURABLE[s.name] !== undefined && s.value !== FAVOURABLE[s.name])
    .sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name))
    .map((s) => ({
      what: `${s.name} ${s.value} (${s.source})`,
      apply: (i: DecisionInput) => ({ ...i, signals: i.signals.map((x) => (x.name === s.name ? { ...x, value: FAVOURABLE[s.name] } : x)) }),
    }));
  if (input.measuredConfidence !== "high")
    known.push({ what: `confidence ${input.measuredConfidence} (${confidenceSource})`, apply: (i) => ({ ...i, measuredConfidence: "high" }) });
  const holding = known
    .map((k) => ({ what: k.what, mode: decide(k.apply(all)).mode }))
    .filter((k) => k.mode !== allFavourable);
  return {
    base,
    first,
    // Assumed probability inputs only lower confidence and never move the mode (W 2), so flipping them cannot change it.
    considered: [...flips.map((f) => `${f.what} (${f.from})`), ...assumedProbability.map((p) => `${p} (cannot move the mode)`)],
    allFavourable,
    holding,
  };
}

export function unknownText(u: Unknown): string {
  if (u.first)
    return `**${u.first.what}**: assumed ${u.first.from}. If it were ${u.first.to}, the mode would move from ${u.base} to ${u.first.mode}.`;
  return (
    `No single assumed input changes the mode. Considered: ${u.considered.join("; ")}. ` +
    `With all of them at their favourable value the mode is ${u.allFavourable}` +
    (u.allFavourable !== u.base
      ? "."
      : u.holding.length
        ? `, so the call rests on what is known: ${u.holding.map((h) => `${h.what}, without which it would be ${h.mode}`).join("; ")}.`
        : ", and no single known input changes it either.")
  );
}
