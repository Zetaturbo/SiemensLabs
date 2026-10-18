"use client";
import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { str } from "./fields";
import { BlockEmpty, BlockFrame, WithResult, cx } from "./primitives";

type Rec = Record<string, unknown>;

/** Research report severities and assessments (ARCHITECTURE.md section 6.3). */
export type Severity = "low" | "moderate" | "elevated" | "high";
export const SEVERITIES: Severity[] = ["low", "moderate", "elevated", "high"];

export interface Source {
  title: string;
  url: string | null;
  publisher: string | null;
  accessed: string | null;
}

export interface RiskFlag {
  category: string;
  severity: Severity | null;
  title: string;
  finding: string | null;
  date: string | null;
  sources: Source[];
}

export interface Report {
  company: { legal_name: string | null; country: string | null; website: string | null; lei: string | null };
  summary: string | null;
  overall: Severity | null;
  flags: RiskFlag[];
  assessments: Array<{ category: string; assessment: Severity | null; rationale: string | null }>;
  sources: Source[];
  limitations: string | null;
}

const asSeverity = (v: unknown): Severity | null => (typeof v === "string" && (SEVERITIES as string[]).includes(v.toLowerCase()) ? (v.toLowerCase() as Severity) : null);

const toSource = (s: unknown): Source | null => {
  if (!s || typeof s !== "object") return null;
  const r = s as Rec;
  const url = str(r.url);
  const title = str(r.title) ?? url;
  return title ? { title, url, publisher: str(r.publisher), accessed: str(r.accessed) } : null;
};

/** Accepts the report itself, a job wrapper ({ report }), or an envelope's data. */
export function parseReport(data: unknown): Report | null {
  if (!data || typeof data !== "object") return null;
  let d = data as Rec;
  if (d.report && typeof d.report === "object") d = d.report as Rec;
  const flags: RiskFlag[] = (Array.isArray(d.risk_flags) ? d.risk_flags : [])
    .filter((f): f is Rec => !!f && typeof f === "object")
    .map((f) => ({
      category: str(f.category) ?? "other",
      severity: asSeverity(f.severity),
      title: str(f.title) ?? "Untitled finding",
      finding: str(f.finding),
      date: str(f.date),
      sources: (Array.isArray(f.sources) ? f.sources : []).map(toSource).filter((s): s is Source => s !== null),
    }));
  const company = (d.company && typeof d.company === "object" ? d.company : {}) as Rec;
  const own = (Array.isArray(d.sources) ? d.sources : []).map(toSource).filter((s): s is Source => s !== null);
  const seen = new Set<string>();
  const sources = [...own, ...flags.flatMap((f) => f.sources)].filter((s) => {
    const k = s.url ?? s.title;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!flags.length && !str(d.summary) && !sources.length) return null;
  return {
    company: { legal_name: str(company.legal_name), country: str(company.country), website: str(company.website), lei: str(company.lei) },
    summary: str(d.summary),
    overall: asSeverity(d.overall_assessment),
    flags,
    assessments: (Array.isArray(d.category_assessment) ? d.category_assessment : [])
      .filter((a): a is Rec => !!a && typeof a === "object" && typeof (a as Rec).category === "string")
      .map((a) => ({ category: a.category as string, assessment: asSeverity(a.assessment), rationale: str(a.rationale) })),
    sources,
    limitations: str(d.limitations),
  };
}

export const SEVERITY_STYLE: Record<Severity, string> = {
  low: "bg-emerald-500/15 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300",
  moderate: "bg-amber-400/20 text-amber-800 ring-amber-500/30 dark:text-amber-200",
  elevated: "bg-orange-500/15 text-orange-800 ring-orange-500/30 dark:text-orange-300",
  high: "bg-red-500/15 text-red-700 ring-red-500/30 dark:text-red-300",
};

export function SeverityChip({ severity, className }: { severity: Severity | null; className?: string }) {
  if (!severity) return null;
  return <span className={cx("inline-flex rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset", SEVERITY_STYLE[severity], className)}>{severity}</span>;
}

export const hostOf = (url: string | null) => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

export function SourceLink({ source, index }: { source: Source; index?: number }) {
  const safe = source.url && /^https?:\/\//.test(source.url) ? source.url : null;
  const label = (
    <>
      {index !== undefined && <span className="mr-1 font-mono text-zinc-400">[{index}]</span>}
      {source.title}
    </>
  );
  return (
    <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      {safe ? (
        <a href={safe} target="_blank" rel="noreferrer noopener" className="truncate text-sky-700 underline-offset-2 hover:underline dark:text-sky-400">
          {label}
        </a>
      ) : (
        <span>{label}</span>
      )}
      <span className="text-[10px] text-zinc-400">{[source.publisher ?? hostOf(source.url), source.accessed && `accessed ${source.accessed}`].filter(Boolean).join(" · ")}</span>
    </span>
  );
}

const rank = (s: Severity | null) => (s ? SEVERITIES.indexOf(s) : -1);

export function RiskFlagListView({ resultId, data, minSeverity }: { resultId?: string | null; data?: unknown; minSeverity?: Severity | null }) {
  return (
    <WithResult block="risk-flag-list" resultId={resultId} data={data} skeletonRows={4}>
      {(value) => {
        const report = parseReport(value);
        if (!report) return <BlockEmpty block="risk-flag-list" title="Research findings" message="This result has no research findings." />;
        const min = minSeverity ? rank(minSeverity) : -1;
        const flags = report.flags
          .filter((f) => rank(f.severity) >= min)
          .sort((a, b) => rank(b.severity) - rank(a.severity) || (b.date ?? "").localeCompare(a.date ?? ""));
        const hidden = report.flags.length - flags.length;
        return (
          <BlockFrame
            block="risk-flag-list"
            title={
              <span className="flex items-center gap-2">
                {report.company.legal_name ?? "Research findings"}
                {report.company.country && <span className="text-[11px] font-normal text-zinc-400">{report.company.country}</span>}
                {report.overall && <SeverityChip severity={report.overall} />}
              </span>
            }
            subtitle={`${report.flags.length} risk flag${report.flags.length === 1 ? "" : "s"} from web research${report.overall ? ` · overall ${report.overall}` : ""}`}
          >
            {report.summary && <p className="mb-3 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">{report.summary}</p>}
            {flags.length === 0 ? (
              <p className="text-xs text-zinc-500">No flags at or above {minSeverity}.</p>
            ) : (
              <ul className="space-y-2.5">
                {flags.map((f, i) => (
                  <li key={`${f.title}-${i}`} className="rounded-md border border-zinc-100 p-2 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SeverityChip severity={f.severity} />
                      <span className="rounded bg-zinc-100 px-1.5 py-px text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{f.category}</span>
                      {f.date && <time className="ml-auto font-mono text-[10px] text-zinc-400" dateTime={f.date}>{f.date}</time>}
                    </div>
                    <p className="mt-1 text-[13px] font-semibold leading-5">{f.title}</p>
                    {f.finding && <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{f.finding}</p>}
                    {f.sources.length > 0 ? (
                      <ul className="mt-1 space-y-0.5 text-[11px]">
                        {f.sources.map((s) => (
                          <li key={s.url ?? s.title}>
                            <SourceLink source={s} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-[10px] text-red-600">No source attached: treat as unverified.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {hidden > 0 && <p className="mt-2 text-[10px] text-zinc-400">{hidden} lower-severity flag{hidden === 1 ? "" : "s"} hidden.</p>}
            {report.assessments.length > 0 && (
              <div className="mt-3 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Category assessment</p>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
                  {report.assessments.map((a) => (
                    <div key={a.category} className="flex items-center justify-between gap-1 text-xs" title={a.rationale ?? undefined}>
                      <dt className="truncate capitalize">{a.category}</dt>
                      <dd>
                        <SeverityChip severity={a.assessment} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {report.limitations && <p className="mt-2 text-[10px] italic text-zinc-400">Limitations: {report.limitations}</p>}
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const RiskFlagList = defineComponent({
  name: "RiskFlagList",
  description:
    "Web research findings for a real company: overall assessment, risk flags with severity chips, dates and source links, and the qualitative category assessment. " +
    "Use for research_company report results.",
  props: z.object({
    resultId: z.string().describe("Handle of a research report result"),
    minSeverity: z.enum(["low", "moderate", "elevated", "high"]).optional().describe("Hide flags below this severity"),
  }),
  component: ({ props }) => <RiskFlagListView resultId={props.resultId} minSeverity={props.minSeverity} />,
});
