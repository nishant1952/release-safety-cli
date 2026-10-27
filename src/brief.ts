// The data a brief is rendered from. W 3: "the mode, the top reasons, the confidence, and the
// one missing fact that would most change the call". Fields are filled as units run.
import type { GateResult, Signal } from "./types";

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
  plan: { row: string; value: string }[] | null;
  reasons: Reason[];
  confidence: { level: string; why: string[] } | null;
  unknown: string | null;
  disagreements: string[] | null;
}
