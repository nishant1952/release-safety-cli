// The data a brief is rendered from. W 3: "the mode, the top reasons, the confidence, and the
// one missing fact that would most change the call". Fields are filled as units run.
import type { Decision } from "./decide";
import type { Contested } from "./overrides";
import type { PlanRow } from "./plan";
import type { ModeResult } from "./signals/detection";
import type { GateResult, Signal } from "./types";
import type { Unknown } from "./unknown";

export interface Reason {
  text: string;
  evidence: string[];
  /** what the reason rests on when it has no file line to cite */
  basis?: string;
  /** optional LLM wording of the reason; never changes the reason itself */
  prose?: string;
  /** model (cited) signals the reason rests on: shown first, before the reason's own evidence */
  model?: ModelEvidence[];
}

export interface ModelEvidence {
  signal: string;
  cite: string;
  reasoning: string;
  /** the assumed value the model replaced */
  was: string;
  /** the lines the replaced assumed value rested on, each labelled */
  prior: { ref: string; label: string }[];
}

export interface Brief {
  base: string;
  head: string;
  title: string | null;
  /** where the title came from */
  titleSource: string;
  files: { path: string; status: string; added: number; removed: number }[];
  gates: GateResult[];
  signals: Signal<string>[];
  mode: string | null;
  modeLine: string | null;
  plan: PlanRow[] | null;
  reasons: Reason[];
  /** measuredLevel and measured: the level from measured facts only, and those facts (read by the short layout) */
  confidence: { level: string; why: string[]; measuredLevel?: string; measured?: string[] } | null;
  unknown: string | null;
  disagreements: string[] | null;
  // Read by the short layout only; the full layout renders the prose fields above.
  /** the grid cell and the steps from it to the mode */
  cell?: Pick<Decision, "damage" | "window" | "undoFast" | "detectFast" | "gridMode" | "gateMode" | "shifted" | "llmStep" | "flagAdvice">;
  /** the one-unknown result that unknown is written from */
  moves?: Unknown;
  /** detectors found per failure mode */
  detectors?: ModeResult[];
  /** owner switches that took effect (src/overrides.ts) */
  switches?: string[];
  /** owner values that replaced a measured or declared one, confidence included: shown with a caution */
  contested?: Contested[];
  /** model proposals accepted and refused by code */
  proposals?: { accepted: number; refused: number };
}
