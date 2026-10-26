// The data a brief is rendered from. W 3: "the mode, the top reasons, the confidence, and the
// one missing fact that would most change the call". Fields are filled as units run.
import type { GateResult, Signal } from "./types";

export interface Reason {
  text: string;
  evidence: string[];
}

export interface Brief {
  base: string;
  head: string;
  title: string | null;
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
