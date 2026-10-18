import { Fragment, type ReactNode } from "react";

/**
 * Minimal, safe Markdown for memos and narration: headings, bullet and numbered lists,
 * paragraphs, **bold**, *italic*, `code` and [links](https://...). Builds React elements only.
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={key} className="rounded-sm bg-sunken px-1 font-mono text-[0.9em]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const [, label, href] = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? [];
      out.push(
        /^https?:\/\//.test(href ?? "") ? (
          <a key={key} href={href} target="_blank" rel="noreferrer noopener" className="text-ink underline underline-offset-2 hover:text-brand">
            {label}
          </a>
        ) : (
          label
        ),
      );
    } else out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
const isSeparator = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const NUMERIC = /^[-+−]?[\d.,]+\s*(%|€|EUR)?(\s*\(.*\))?$/;

function MdTable({ rows, keyBase }: { rows: string[]; keyBase: string }) {
  const [head, , ...body] = rows;
  const h = cells(head);
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {h.map((c, i) => (
              <th key={i} className="border-b border-subtle px-2 py-1 text-left text-2xs font-medium uppercase tracking-wide text-tertiary">
                {inline(c, `${keyBase}-h${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri} className="border-b border-subtle last:border-0">
              {cells(r).map((c, ci) => (
                <td key={ci} className={`px-2 py-1 align-top ${NUMERIC.test(c) ? "tabular text-right font-mono" : ""}`}>
                  {inline(c, `${keyBase}-${ri}-${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let table: string[] = [];
  const flushTable = () => {
    if (table.length >= 2 && isSeparator(table[1])) blocks.push(<MdTable key={`t${blocks.length}`} rows={table} keyBase={`t${blocks.length}`} />);
    else if (table.length) blocks.push(<p key={`p${blocks.length}`}>{inline(table.join(" "), `p${blocks.length}`)}</p>);
    table = [];
  };
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(" "), `p${blocks.length}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const k = `l${blocks.length}`;
    const items = list.items.map((it, i) => <li key={i}>{inline(it, `${k}-${i}`)}</li>);
    blocks.push(list.ordered ? <ol key={k} className="list-decimal space-y-0.5 pl-5">{items}</ol> : <ul key={k} className="list-disc space-y-0.5 pl-5">{items}</ul>);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*\|/.test(line)) {
      flushPara();
      flushList();
      table.push(line);
      continue;
    }
    flushTable();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (h) {
      flushPara();
      flushList();
      const level = h[1].length;
      const cls = level === 1 ? "text-md font-semibold text-ink" : level === 2 ? "text-sm font-semibold text-ink" : "text-xs font-semibold uppercase tracking-wide text-tertiary";
      blocks.push(
        <p key={`h${blocks.length}`} role="heading" aria-level={level + 1} className={`${cls} pt-1`}>
          {inline(h[2], `h${blocks.length}`)}
        </p>,
      );
    } else if (bullet || numbered) {
      flushPara();
      const ordered = !bullet;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushTable();
  flushPara();
  flushList();
  return <div className={className ?? "space-y-2 text-sm leading-relaxed"}>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
