// Section 2: "Each signal is marked measured, declared or assumed, so the human knows what to distrust."
// Round 3: an assumed value the model replaced, one step on its scale, citing a line that code checked exists.
// Demo: a value the release owner entered in place of an assumed or declared one (src/overrides.ts).
export type Source = "measured" | "declared" | "assumed" | "model (cited)" | "declared by owner";

export interface Signal<T = string> {
  name: string;
  value: T;
  source: Source;
  /** file:line references (head side), or path@base:line for removed lines */
  evidence: string[];
  note: string;
  /** set when the model filled this signal: its one sentence, and the assumed value and evidence it replaced */
  model?: { reasoning: string; was: { value: string; evidence: string[] } };
}

export type GateStatus = "pass" | "trip" | "unverifiable";
export type GateRoute = "none" | "human" | "block";

export interface GateCheck {
  name: string;
  status: GateStatus;
  source: Source;
  evidence: string[];
  note: string;
}

export interface GateResult {
  gate: 1 | 2 | 3;
  name: string;
  status: GateStatus;
  route: GateRoute;
  checks: GateCheck[];
}
