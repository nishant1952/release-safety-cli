// The brief's markdown as React elements: the subset src/render.ts writes (headings, paragraphs, pipe tables,
// nested lists, `code`, **bold**, *italic*). No HTML is passed through, so quoted repo lines render as text.
import type { ReactNode } from "react";
import { toneOf } from "./parts";

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "list"; ordered: boolean; start: number; items: Block[][] };

const MARKER = /^(\s*)(\d+\.|-) (.*)$/;
const indentOf = (l: string) => l.length - l.trimStart().length;

function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "\\" && body[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (body[i] === "|") {
      out.push(cur.trim());
      cur = "";
    } else cur += body[i];
  }
  out.push(cur.trim());
  return out;
}

export function parse(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = line.match(/^(#{1,6}) (.*)$/);
    if (h) {
      blocks.push({ kind: "heading", level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (line.trimStart().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) rows.push(cells(lines[i++]));
      const body = rows.filter((r, k) => !(k === 1 && r.every((c) => /^:?-+:?$/.test(c))));
      blocks.push({ kind: "table", head: body[0], rows: body.slice(1) });
      continue;
    }
    const m = line.match(MARKER);
    if (m) {
      const indent = m[1].length;
      const ordered = m[2] !== "-";
      const items: Block[][] = [];
      while (i < lines.length) {
        const im = lines[i].match(MARKER);
        if (!im || im[1].length !== indent || (im[2] !== "-") === !ordered) break;
        const content = indent + im[2].length + 1;
        const own = [im[3]];
        i++;
        // Lines indented past the marker belong to this item.
        while (i < lines.length && lines[i].trim() && indentOf(lines[i]) >= content) own.push(lines[i++].slice(content));
        items.push(parse(own));
      }
      blocks.push({ kind: "list", ordered, start: ordered ? Number(m[2].slice(0, -1)) : 1, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !MARKER.test(lines[i]) && !/^#{1,6} /.test(lines[i]) && !lines[i].trimStart().startsWith("|")) para.push(lines[i++].trim());
    blocks.push({ kind: "paragraph", text: para.join(" ") });
  }
  return blocks;
}

/** `code`, **bold** and *italic*; code spans first, so a star inside one stays a star. */
export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /`([^`]+)`|\*\*(.+?)\*\*|\*([^*\s][^*]*?)\*/g;
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<code key={k++}>{m[1]}</code>);
    else if (m[2] !== undefined) out.push(<strong key={k++}>{inline(m[2])}</strong>);
    else out.push(<em key={k++}>{inline(m[3])}</em>);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function render(blocks: Block[]): ReactNode[] {
  return blocks.map((b, k) => {
    switch (b.kind) {
      case "heading": {
        const H = `h${Math.min(b.level + 1, 6)}` as "h2";
        return <H key={k}>{inline(b.text)}</H>;
      }
      case "paragraph":
        return <p key={k}>{inline(b.text)}</p>;
      case "table":
        return (
          <div className="table-wrap" key={k}>
            <table>
              <thead>
                <tr>{b.head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, l) => (
                      // In a signals table, the value is coloured by what it means for the release.
                      <td key={l} className={l === 1 && b.head[0] === "Signal" ? toneOf(r[0], c) || undefined : undefined}>
                        {inline(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "list": {
        const items = b.items.map((item, j) => (
          // A one-paragraph item renders without a <p>.
          <li key={j}>{item.length === 1 && item[0].kind === "paragraph" ? inline(item[0].text) : render(item)}</li>
        ));
        return b.ordered ? <ol key={k} start={b.start}>{items}</ol> : <ul key={k}>{items}</ul>;
      }
    }
  });
}

export function Markdown({ text }: { text: string }) {
  return <div className="markdown">{render(parse(text.split("\n")))}</div>;
}
