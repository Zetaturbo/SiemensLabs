"use client";
import { useState } from "react";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { asResearchJob, parseReport, researchPending, SourceLink, type Source } from "./risk-flag-list";
import { str } from "./fields";
import { BlockEmpty, BlockFrame, MoreButton, WithResult } from "./primitives";
import type { BlockProps } from "./specs";

type Rec = Record<string, unknown>;

/** Sources shown before "Show all". */
const SOURCE_CAP = 8;

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
  const [all, setAll] = useState(false);
  return (
    <WithResult block="source-list" resultId={resultId} data={data} skeletonRows={3} pollMs={2500} pollWhile={researchPending}>
      {(value) => {
        const job = asResearchJob(value);
        if (job && !job.hasReport)
          return <BlockEmpty block="source-list" title={title ?? "Sources"} message={job.status === "failed" ? "Research failed, so there are no sources." : "Sources appear when the research report is ready."} />;
        const sources = collectSources(value);
        if (!sources.length) return <BlockEmpty block="source-list" title={title ?? "Sources"} message="No sources in this result." />;
        const shown = all ? sources : sources.slice(0, SOURCE_CAP);
        return (
          <BlockFrame block="source-list" title={title ?? `${sources.length} source${sources.length === 1 ? "" : "s"}`}>
            <ol className="space-y-2">
              {shown.map((s, i) => (
                <li key={s.url ?? s.title} className="min-w-0">
                  <SourceLink source={s} index={i + 1} />
                </li>
              ))}
            </ol>
            {sources.length > SOURCE_CAP && <MoreButton onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${sources.length}`}</MoreButton>}
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const SourceListBlock: ComponentRenderer<BlockProps<"SourceList">> = ({ props }) => <SourceListView resultId={props.resultId} title={props.title} />;
