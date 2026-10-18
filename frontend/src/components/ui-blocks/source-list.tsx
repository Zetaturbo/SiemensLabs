"use client";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { asResearchJob, parseReport, researchPending, SourceLink, type Source } from "./risk-flag-list";
import { str } from "./fields";
import { BlockEmpty, BlockFrame, WithResult } from "./primitives";
import type { BlockProps } from "./specs";

type Rec = Record<string, unknown>;

/** Sources from a research report (own list plus every flag's sources), a memo, or any { sources: [...] }. */
export function collectSources(data: unknown): Source[] {
  const report = parseReport(data);
  if (report?.sources.length) return report.sources;
  const d = (data && typeof data === "object" ? data : {}) as Rec;
  const list = Array.isArray(data) ? data : Array.isArray(d.sources) ? d.sources : [];
  return (list as unknown[])
    .filter((s): s is Rec => !!s && typeof s === "object")
    .map((s) => ({ title: str(s.title) ?? str(s.url) ?? "", url: str(s.url), publisher: str(s.publisher), accessed: str(s.accessed) }))
    .filter((s) => s.title);
}

export function SourceListView({ resultId, data, title }: { resultId?: string | null; data?: unknown; title?: string | null }) {
  return (
    <WithResult block="source-list" resultId={resultId} data={data} skeletonRows={3} pollMs={2500} pollWhile={researchPending}>
      {(value) => {
        const job = asResearchJob(value);
        if (job && !job.hasReport)
          return <BlockEmpty block="source-list" title={title ?? "Sources"} message={job.status === "failed" ? "Research failed; no sources." : "Sources appear when the research report is ready."} />;
        const sources = collectSources(value);
        if (!sources.length) return <BlockEmpty block="source-list" title={title ?? "Sources"} message="No sources in this result." />;
        return (
          <BlockFrame block="source-list" title={title ?? `Sources (${sources.length})`}>
            <ol className="space-y-1 text-xs">
              {sources.map((s, i) => (
                <li key={s.url ?? s.title} className="min-w-0">
                  <SourceLink source={s} index={i + 1} />
                </li>
              ))}
            </ol>
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const SourceListBlock: ComponentRenderer<BlockProps<"SourceList">> = ({ props }) => <SourceListView resultId={props.resultId} title={props.title} />;
