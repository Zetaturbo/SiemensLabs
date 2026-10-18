"use client";
import { useState, type ReactNode } from "react";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { Check, Copy, Download } from "lucide-react";
import { Button } from "@/design-system/react";
import { str } from "./fields";
import { Markdown } from "./markdown";
import { BlockEmpty, BlockFrame, MoreButton, WithResult } from "./primitives";
import type { BlockProps } from "./specs";

type Rec = Record<string, unknown>;

/**
 * Memo result shape (shortlist_memo skill). Everything but sections is optional; a plain
 * `{ markdown }` or a string also works.
 */
export interface MemoDoc {
  title: string;
  subtitle?: string;
  case_id?: string;
  part_id?: string;
  profile_id?: string;
  generated_at?: string;
  author?: string;
  summary?: string;
  recommendation?: { supplier_id: string; supplier_name?: string; rationale?: string };
  sections: Array<{ heading: string; body?: string; bullets?: string[] }>;
  sources?: Array<{ title: string; url?: string }>;
}

export function parseMemo(data: unknown): MemoDoc | { markdown: string; title: string } | null {
  if (typeof data === "string") return { markdown: data, title: "Memo" };
  if (!data || typeof data !== "object") return null;
  const d = (("memo" in data && (data as Rec).memo && typeof (data as Rec).memo === "object") ? (data as Rec).memo : data) as Rec;
  const md = str(d.markdown) ?? str(d.content);
  const sections = Array.isArray(d.sections)
    ? (d.sections as Rec[])
        .filter((s) => s && typeof s === "object" && (str(s.heading) || str(s.title)))
        .map((s) => ({
          heading: (str(s.heading) ?? str(s.title))!,
          body: str(s.body) ?? str(s.text) ?? undefined,
          bullets: Array.isArray(s.bullets) ? (s.bullets as unknown[]).filter((b): b is string => typeof b === "string") : undefined,
        }))
    : [];
  if (!sections.length && md) {
    const title = str(d.title) ?? md.match(/^#\s+(.+)$/m)?.[1] ?? "Memo";
    // The header shows the title, so a leading "# title" line would repeat it.
    return { markdown: md.replace(/^\s*#\s+.+\n+/, ""), title };
  }
  if (!sections.length && !str(d.summary)) return null;
  const rec = d.recommendation as Rec | undefined;
  return {
    title: str(d.title) ?? "Supplier selection memo",
    subtitle: str(d.subtitle) ?? undefined,
    case_id: str(d.case_id) ?? undefined,
    part_id: str(d.part_id) ?? undefined,
    profile_id: str(d.profile_id) ?? undefined,
    generated_at: str(d.generated_at) ?? undefined,
    author: str(d.author) ?? undefined,
    summary: str(d.summary) ?? undefined,
    recommendation: rec && str(rec.supplier_id) ? { supplier_id: str(rec.supplier_id)!, supplier_name: str(rec.supplier_name) ?? undefined, rationale: str(rec.rationale) ?? undefined } : undefined,
    sections,
    sources: Array.isArray(d.sources)
      ? (d.sources as Rec[]).filter((s) => s && str(s.title)).map((s) => ({ title: str(s.title)!, url: str(s.url) ?? undefined }))
      : undefined,
  };
}

export function memoToMarkdown(memo: MemoDoc | { markdown: string; title: string }): string {
  if ("markdown" in memo) return memo.markdown;
  const meta = [memo.case_id && `Case: ${memo.case_id}`, memo.part_id && `Part: ${memo.part_id}`, memo.profile_id && `Profile: ${memo.profile_id}`, memo.generated_at && `Generated: ${memo.generated_at}`, memo.author && `Author: ${memo.author}`].filter(Boolean);
  const out = [`# ${memo.title}`];
  if (memo.subtitle) out.push(`_${memo.subtitle}_`);
  if (meta.length) out.push(meta.join(" · "));
  if (memo.summary) out.push(memo.summary);
  if (memo.recommendation) {
    const r = memo.recommendation;
    out.push(`## Recommendation\n\n**${r.supplier_name ? `${r.supplier_name} (${r.supplier_id})` : r.supplier_id}**${r.rationale ? `: ${r.rationale}` : ""}`);
  }
  for (const s of memo.sections) {
    const parts = [`## ${s.heading}`];
    if (s.body) parts.push(s.body);
    if (s.bullets?.length) parts.push(s.bullets.map((b) => `- ${b}`).join("\n"));
    out.push(parts.join("\n\n"));
  }
  if (memo.sources?.length) out.push(`## Sources\n\n${memo.sources.map((s, i) => `${i + 1}. ${s.url ? `[${s.title}](${s.url})` : s.title}`).join("\n")}`);
  return out.join("\n\n") + "\n";
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The memo's markdown sections by level-2 heading. */
function sectionsOf(md: string): Array<{ heading: string; body: string }> {
  const out: Array<{ heading: string; body: string }> = [];
  for (const part of md.split(/^##\s+/m).slice(1)) {
    const [head, ...rest] = part.split("\n");
    out.push({ heading: head.trim(), body: rest.join("\n").trim() });
  }
  return out;
}

/**
 * The skill's template names suppliers by id ("Recommend SUPP_00731 (Strategic Logistics 386)"). For the short read,
 * use the names from the memo's candidates table; the full memo keeps the ids as the document of record.
 */
function withNames(text: string, md: string): string {
  const names = new Map<string, string>();
  for (const m of md.matchAll(/\|\s*(SUPP_\d{5})\s*\|\s*([^|\n]+?)\s*\|/g)) names.set(m[1], m[2]);
  return text.replace(/(SUPP_\d{5}) \(([^)]+)\)/g, "$2").replace(/SUPP_\d{5}/g, (id) => names.get(id) ?? id);
}

/** Bullets that are sentences read better as one paragraph than as a list. */
const asParagraph = (bullets: string[]) => bullets.map((b) => (/[.!?]$/.test(b.trim()) ? b.trim() : `${b.trim()}.`)).join(" ");

export function MemoView({ resultId, data }: { resultId?: string | null; data?: unknown }) {
  const [copied, setCopied] = useState(false);
  const [full, setFull] = useState(false);
  return (
    <WithResult block="memo" resultId={resultId} data={data} skeletonRows={6}>
      {(value) => {
        const memo = parseMemo(value);
        if (!memo) return <BlockEmpty block="memo" title="Memo" message="This result has no memo content." />;
        const md = "markdown" in memo ? `# ${memo.title}\n\n${memo.markdown}` : memoToMarkdown(memo);
        const raw = (value && typeof value === "object" ? value : {}) as Rec;
        const unverified = Array.isArray(raw.unverified_numbers) ? (raw.unverified_numbers as unknown[]).filter((n): n is string => typeof n === "string") : [];
        const drafted = raw.source === "llm" ? "Scope and recommendation drafted by the model from computed facts; tables and numbers are computed." : raw.source === "template" ? "Written from the template; all numbers are computed." : null;
        const meta = "markdown" in memo ? [] : [memo.subtitle, memo.author && `By ${memo.author}`, memo.generated_at && `Generated ${memo.generated_at}`, memo.profile_id && `Profile ${memo.profile_id}`].filter(Boolean);
        const note = [unverified.length && `Check these numbers: ${unverified.join(", ")} do not appear in the computed facts.`, drafted, meta.length && `${meta.join(". ")}.`].filter(Boolean).join(" ");
        const slug = (("case_id" in memo && memo.case_id) || memo.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

        // The short read: the recommendation (and the summary for structured memos); the rest sits behind "Read the full memo".
        let short: ReactNode;
        let rest: ReactNode = null;
        if ("markdown" in memo) {
          const sections = sectionsOf(memo.markdown);
          const rec = sections.find((s) => /recommendation/i.test(s.heading));
          const lead = rec ? rec.body : (memo.markdown.split(/\n\s*\n/)[0] ?? "");
          short = <Markdown doc text={withNames(lead, memo.markdown)} className="space-y-2 text-sm leading-relaxed" />;
          rest = sections.length > 1 || !rec ? <Markdown doc text={memo.markdown} className="space-y-3 text-sm leading-relaxed" /> : null;
        } else {
          const r = memo.recommendation;
          short = (
            <div className="space-y-2">
              {r && (
                <p>
                  Recommended: <strong>{r.supplier_name ?? r.supplier_id}</strong>
                  {r.rationale ? `. ${r.rationale}` : "."}
                </p>
              )}
              {memo.summary && <Markdown doc text={memo.summary} className="space-y-2" />}
            </div>
          );
          const headings = memo.sections.length >= 2;
          rest = memo.sections.length ? (
            <div className="space-y-3">
              {memo.sections.map((s) => (
                <section key={s.heading} className="space-y-1">
                  {headings && <h4 className="text-sm font-semibold text-ink">{s.heading}</h4>}
                  {s.body && <Markdown doc text={s.body} className="space-y-2" />}
                  {s.bullets?.length ? <Markdown doc text={asParagraph(s.bullets)} className="space-y-2" /> : null}
                </section>
              ))}
            </div>
          ) : null;
        }

        return (
          <BlockFrame
            block="memo"
            title={memo.title}
            note={note || undefined}
            noteTone={unverified.length ? "warning" : "neutral"}
            actions={
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Copy the memo as Markdown"
                  leading={copied ? <Check /> : <Copy />}
                  onClick={() => {
                    void navigator.clipboard?.writeText(md).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                >
                  <span className="hidden @lg:inline">{copied ? "Copied" : "Copy"}</span>
                </Button>
                <Button size="sm" variant="ghost" aria-label="Export as Markdown" leading={<Download />} onClick={() => download(`${slug || "memo"}.md`, md)} title="Download as Markdown">
                  <span className="hidden @lg:inline">Export</span>
                </Button>
              </>
            }
          >
            <article className="max-w-prose text-sm leading-relaxed text-ink">
              {short}
              {full && rest && <div className="mt-4 border-t border-subtle pt-4">{rest}</div>}
            </article>
            {rest && <MoreButton onClick={() => setFull((v) => !v)}>{full ? "Show less" : "Read the full memo"}</MoreButton>}
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const MemoBlock: ComponentRenderer<BlockProps<"Memo">> = ({ props }) => <MemoView resultId={props.resultId} />;
