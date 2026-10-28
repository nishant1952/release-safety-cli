// Pieces the page shares: the numbered section frame and a source swatch.
import type { CSSProperties, ReactNode } from "react";

export function Section({
  n,
  title,
  aside,
  end,
  delay = 0,
  className = "",
  children,
}: {
  n: number;
  title: string;
  aside?: ReactNode;
  end?: ReactNode;
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`sec card ${className}`} style={{ animationDelay: `${delay}s` } as CSSProperties}>
      <div className="sec-rule" />
      <div className="sec-head">
        <span className="sec-label">
          {String(n).padStart(2, "0")} {title}
        </span>
        {aside}
        {end && <span className="sec-end">{end}</span>}
      </div>
      {children}
    </section>
  );
}

const SWATCH: Record<string, string> = { measured: "", declared: "declared", assumed: "assumed", "declared by owner": "owner", "model (cited)": "model" };
const Swatch = ({ source }: { source: string }) => <span className={`swatch ${SWATCH[source] ?? ""}`} />;

export function Src({ source, caution, children }: { source: string; caution?: boolean; children?: ReactNode }) {
  return (
    <span className="src">
      <Swatch source={source} />
      {children ?? source}
      {caution && <Caution />}
    </span>
  );
}

/** A hover or focus note shown at once (a title attribute waits about a second before it shows). */
export const Tip = ({ tip, className = "", children }: { tip: string; className?: string; children: ReactNode }) => (
  <span className={`tip ${className}`} data-tip={tip} tabIndex={0} aria-label={tip}>
    {children}
  </span>
);

/** An owner value replaced a measured or declared one: what follows rests on the owner's word, not the repo. */
export const Caution = ({ title = "Declared by the owner over a measured or declared value: this rests on the owner's word, not the repo" }: { title?: string }) => (
  <Tip tip={title} className="caution">
    ⚠
  </Tip>
);

// Each value of a decision input, toned for the release: good (ok), in between (mid) or bad (bad). Per signal,
// since "low" is good for reach and bad for confidence. The short brief's names are aliases of the full ones.
const TONES: Record<string, Record<string, "ok" | "mid" | "bad">> = {
  "Reversible or irreversible": { reversible: "ok", irreversible: "bad" },
  "Feature flag": { full: "ok", partial: "mid", none: "bad" },
  Path: { unreached: "ok", "not a code path": "ok", live: "bad" },
  Reach: { none: "ok", low: "ok", high: "bad" },
  "Detection apparatus": { fast: "ok", slow: "bad" },
  "Time to revert": { "one-click rollback": "ok", "measured pipeline under 15 minutes": "ok", "full build and deploy": "bad" },
  Confidence: { high: "ok", medium: "mid", low: "bad" },
};
const ALIAS: Record<string, string> = { Reversible: "Reversible or irreversible", Detection: "Detection apparatus" };

/** The tone class of a signal's value, or "" when the value is not one the decision rates. */
export function toneOf(name: string, value: string | null | undefined): string {
  const t = TONES[ALIAS[name] ?? name]?.[(value ?? "").toLowerCase()];
  return t ? `tone-${t}` : "";
}
