// Pieces the page shares: the numbered section frame and a source swatch.
import type { CSSProperties, ReactNode } from "react";

export function Section({ n, title, aside, end, delay = 0, children }: { n: number; title: string; aside?: ReactNode; end?: ReactNode; delay?: number; children: ReactNode }) {
  return (
    <section className="sec" style={{ animationDelay: `${delay}s` } as CSSProperties}>
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

/** An owner value replaced a measured or declared one: what follows rests on the owner's word, not the repo. */
export const Caution = ({ title = "Declared by the owner over a measured or declared value" }: { title?: string }) => (
  <span className="caution" title={title} aria-label={title}>
    ⚠
  </span>
);
