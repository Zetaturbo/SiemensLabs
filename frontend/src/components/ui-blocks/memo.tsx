"use client";
import { useState } from "react";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { Check, Copy, Download } from "lucide-react";
import { Button } from "@/design-system/react";
import { str } from "./fields";
import { Markdown } from "./markdown";
import { BlockEmpty, BlockFrame, Eyebrow, WithResult } from "./primitives";
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
  if (!sections.length && md) return { markdown: md, title: str(d.title) ?? "Memo" };
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

export function MemoView({ resultId, data }: { resultId?: string | null; data?: unknown }) {
  const [copied, setCopied] = useState(false);
  return (
    <WithResult block="memo" resultId={resultId} data={data} skeletonRows={6}>
      {(value) => {
        const memo = parseMemo(value);
        if (!memo) return <BlockEmpty block="memo" title="Memo" message="This result has no memo content." />;
        const md = memoToMarkdown(memo);
        const slug = (("case_id" in memo && memo.case_id) || memo.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        return (
          <BlockFrame
            block="memo"
            title={memo.title}
            subtitle={"markdown" in memo ? undefined : [memo.subtitle, memo.case_id, memo.profile_id && `profile ${memo.profile_id}`, memo.generated_at].filter(Boolean).join(" · ") || undefined}
            actions={
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  leading={copied ? <Check /> : <Copy />}
                  onClick={() => {
                    void navigator.clipboard?.writeText(md).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" leading={<Download />} onClick={() => download(`${slug || "memo"}.md`, md)} title="Download as Markdown">
                  Export .md
                </Button>
              </>
            }
          >
            <article className="mx-auto max-w-prose space-y-3 text-sm leading-relaxed text-ink">
              {"markdown" in memo ? (
                <Markdown text={memo.markdown} />
              ) : (
                <>
                  {memo.summary && <Markdown text={memo.summary} />}
                  {memo.recommendation && (
                    <div className="rounded-lg border border-line bg-sunken px-3 py-2">
                      <Eyebrow className="mb-0.5">Recommendation</Eyebrow>
                      <p className="text-sm font-semibold">
                        {memo.recommendation.supplier_name ?? memo.recommendation.supplier_id}
                        {memo.recommendation.supplier_name && <span className="ml-1.5 font-mono text-2xs font-normal text-tertiary">{memo.recommendation.supplier_id}</span>}
                      </p>
                      {memo.recommendation.rationale && <p className="text-xs text-subtext">{memo.recommendation.rationale}</p>}
                    </div>
                  )}
                  {memo.sections.map((s) => (
                    <section key={s.heading} className="space-y-1.5">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-tertiary">{s.heading}</h4>
                      {s.body && <Markdown text={s.body} />}
                      {s.bullets?.length ? <Markdown text={s.bullets.map((b) => `- ${b}`).join("\n")} /> : null}
                    </section>
                  ))}
                  {memo.sources?.length ? (
                    <section className="space-y-1">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-tertiary">Sources</h4>
                      <ol className="list-decimal pl-5 text-xs">
                        {memo.sources.map((s) => (
                          <li key={s.title}>
                            {s.url && /^https?:\/\//.test(s.url) ? (
                              <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-ink underline underline-offset-2 hover:text-brand">
                                {s.title}
                              </a>
                            ) : (
                              s.title
                            )}
                          </li>
                        ))}
                      </ol>
                    </section>
                  ) : null}
                </>
              )}
            </article>
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const MemoBlock: ComponentRenderer<BlockProps<"Memo">> = ({ props }) => <MemoView resultId={props.resultId} />;
