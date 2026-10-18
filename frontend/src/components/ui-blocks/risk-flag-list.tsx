"use client";
import { useState } from "react";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { Spinner } from "@/design-system/react";
import { invalidateResult } from "@/lib/hooks/use-result";
import { str } from "./fields";
import { BlockEmpty, BlockFrame, Dot, LEVEL_STYLE, LevelDot, MoreButton, Num, WithResult, cn } from "./primitives";
import type { BlockProps } from "./specs";

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

/** Severities share the risk scale: low, moderate, elevated, high = Low, Medium, High, Critical colors. */
const SEVERITY_LEVEL = { low: "Low", moderate: "Medium", elevated: "High", high: "Critical" } as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Severity as a colour dot plus the word. */
export function SeverityChip({ severity, className }: { severity: Severity | null; className?: string }) {
  if (!severity) return null;
  return <LevelDot level={SEVERITY_LEVEL[severity]} label={cap(severity)} className={className} />;
}

export const hostOf = (url: string | null) => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

const safeUrl = (url: string | null) => (url && /^https?:\/\//.test(url) ? url : null);

/** One source: the title as a link, the publisher in quiet text on the same line; the access date sits in the tooltip. */
export function SourceLink({ source, index }: { source: Source; index?: number }) {
  const href = safeUrl(source.url);
  const by = source.publisher ?? hostOf(source.url);
  const tip = [source.url, source.accessed && `accessed ${source.accessed}`].filter(Boolean).join(", ") || undefined;
  return (
    <span className="flex min-w-0 items-baseline gap-3 text-sm" title={tip}>
      {index !== undefined && <Num className="w-5 shrink-0 text-right text-tertiary">{index}</Num>}
      <span className="min-w-0 truncate">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer noopener" className="text-ink underline-offset-2 hover:underline">
            {source.title}
          </a>
        ) : (
          <span className="text-ink">{source.title}</span>
        )}
        {by && <span className="ml-2 text-subtext">{by}</span>}
      </span>
    </span>
  );
}

const rank = (s: Severity | null) => (s ? SEVERITIES.indexOf(s) : -1);

/** Live research job state stored under a result handle (research_company skill); the server tracker updates it. */
export interface ResearchJob {
  job_id: string;
  company_name: string | null;
  status: "queued" | "needs_disambiguation" | "running" | "done" | "failed" | string;
  mode: string | null;
  progress: Array<{ step: string; message: string }>;
  candidates: Array<{ candidate_id: string; legal_name: string; country: string | null; website: string | null }>;
  error: string | null;
  hasReport: boolean;
}

export function asResearchJob(data: unknown): ResearchJob | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Rec;
  if (d.kind !== "research_job" && !(typeof d.job_id === "string" && typeof d.status === "string")) return null;
  return {
    job_id: str(d.job_id) ?? "",
    company_name: str(d.company_name),
    status: str(d.status) ?? "queued",
    mode: str(d.mode),
    progress: (Array.isArray(d.progress) ? d.progress : []).filter((p): p is Rec => !!p && typeof p === "object").map((p) => ({ step: str(p.step) ?? "", message: str(p.message) ?? "" })),
    candidates: (Array.isArray(d.candidates) ? d.candidates : [])
      .filter((c): c is Rec => !!c && typeof c === "object" && typeof (c as Rec).candidate_id === "string")
      .map((c) => ({ candidate_id: c.candidate_id as string, legal_name: str(c.legal_name) ?? (c.candidate_id as string), country: str(c.country), website: str(c.website) })),
    error: str(d.error),
    hasReport: !!(d.report && typeof d.report === "object"),
  };
}

/** Keep polling while the job has neither finished nor failed. */
export const researchPending = (data: unknown) => {
  const job = asResearchJob(data);
  return !!job && !job.hasReport && job.status !== "failed" && job.status !== "done";
};

const STATUS_WORD: Record<string, string> = { queued: "Queued", running: "Researching", needs_disambiguation: "Which company?", failed: "Failed", done: "Done" };

function ResearchJobView({ job, resultId }: { job: ResearchJob; resultId?: string | null }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const confirm = async (candidateId: string) => {
    setConfirming(candidateId);
    try {
      await fetch(`/api/research/${encodeURIComponent(job.job_id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ candidate_id: candidateId }) });
    } finally {
      setConfirming(null);
      if (resultId) invalidateResult(resultId);
    }
  };
  const running = job.status === "queued" || job.status === "running";
  const last = job.progress.at(-1)?.message ?? "Waiting for the research agent.";
  return (
    <BlockFrame
      block="risk-flag-list"
      title={job.company_name ?? "Web research"}
      note={`Research job ${job.job_id}${job.mode === "replay" ? ", replayed data" : ""}. Findings appear here when the report is ready.`}
      actions={
        <span className="inline-flex items-center gap-2 text-sm text-subtext">
          {running ? <Spinner size="sm" className="size-3.5" label="Research running" /> : <Dot fill={job.status === "failed" ? "var(--risk-critical)" : "var(--risk-high)"} />}
          {STATUS_WORD[job.status] ?? cap(job.status.replace(/_/g, " "))}
        </span>
      }
    >
      {job.status === "failed" ? (
        <p className="text-sm text-ink">{job.error ?? "The research job failed."}</p>
      ) : job.status === "needs_disambiguation" && job.candidates.length > 0 ? (
        <div className="-mx-2">
          <p className="px-2 pb-2 text-sm text-subtext">Several companies match. Pick the one you mean.</p>
          {job.candidates.map((c) => (
            <button
              key={c.candidate_id}
              type="button"
              disabled={!!confirming}
              onClick={() => void confirm(c.candidate_id)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-[var(--lw-focus-ring)] disabled:opacity-60"
            >
              <span className="min-w-0 truncate text-ink">{c.legal_name}</span>
              <span className="shrink-0 text-subtext">{confirming === c.candidate_id ? "Confirming…" : [c.country, hostOf(c.website)].filter(Boolean).join(", ")}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink">{last}</p>
      )}
    </BlockFrame>
  );
}

/** Flags shown before "Show all". */
const FLAG_CAP = 5;

export function RiskFlagListView({ resultId, data, minSeverity }: { resultId?: string | null; data?: unknown; minSeverity?: Severity | null }) {
  const [all, setAll] = useState(false);
  return (
    <WithResult block="risk-flag-list" resultId={resultId} data={data} skeletonRows={4} pollMs={2500} pollWhile={researchPending}>
      {(value) => {
        const job = asResearchJob(value);
        if (job && !job.hasReport) return <ResearchJobView job={job} resultId={resultId} />;
        const report = parseReport(value);
        if (!report) return <BlockEmpty block="risk-flag-list" title="Research findings" message="This result has no research findings." />;
        const min = minSeverity ? rank(minSeverity) : -1;
        const flags = report.flags.filter((f) => rank(f.severity) >= min).sort((a, b) => rank(b.severity) - rank(a.severity) || (b.date ?? "").localeCompare(a.date ?? ""));
        const hidden = report.flags.length - flags.length;
        const shown = all ? flags : flags.slice(0, FLAG_CAP);
        const note = [
          report.company.country && `Country: ${report.company.country}.`,
          hidden > 0 && `${hidden} flag${hidden === 1 ? "" : "s"} below ${minSeverity} hidden.`,
          report.limitations && `Limitations: ${report.limitations}`,
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <BlockFrame block="risk-flag-list" title={report.company.legal_name ?? "Research findings"} note={note || undefined} actions={<SeverityChip severity={report.overall} />}>
            {report.summary && <p className="text-sm leading-relaxed text-ink">{report.summary}</p>}
            {flags.length === 0 ? (
              <p className={cn("text-sm text-subtext", report.summary && "mt-3")}>{report.flags.length ? `No flags at or above ${minSeverity}.` : "No risk flags found."}</p>
            ) : (
              <ul className={cn("space-y-4", report.summary && "mt-4")}>
                {shown.map((f, i) => {
                  const level = f.severity ? SEVERITY_LEVEL[f.severity] : null;
                  const src = f.sources[0];
                  const href = src ? safeUrl(src.url) : null;
                  return (
                    <li key={`${f.title}-${i}`} className="grid grid-cols-[0.5rem_minmax(0,1fr)] gap-x-3">
                      <span className="pt-1.5">{level ? <Dot fill={LEVEL_STYLE[level].fill} label={f.severity ?? undefined} /> : <Dot fill="var(--lw-text-placeholder)" />}</span>
                      <div className="min-w-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="min-w-0 truncate text-sm font-medium text-ink" title={f.title}>
                            {f.title}
                          </p>
                          {f.date && (
                            <time className="shrink-0 font-mono text-sm text-tertiary" dateTime={f.date}>
                              {f.date}
                            </time>
                          )}
                        </div>
                        {f.finding && <p className="mt-0.5 text-sm leading-relaxed text-subtext">{f.finding}</p>}
                        {src ? (
                          <p className="mt-0.5 truncate text-sm text-subtext" title={f.sources.map((s) => s.title).join("\n")}>
                            {href ? (
                              <a href={href} target="_blank" rel="noreferrer noopener" className="text-ink underline-offset-2 hover:underline">
                                {src.publisher ?? hostOf(src.url) ?? src.title}
                              </a>
                            ) : (
                              (src.publisher ?? src.title)
                            )}
                            {f.sources.length > 1 && ` and ${f.sources.length - 1} more`}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-sm text-[var(--risk-critical)]">No source attached, treat as unverified.</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {flags.length > FLAG_CAP && <MoreButton onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${flags.length}`}</MoreButton>}
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const RiskFlagListBlock: ComponentRenderer<BlockProps<"RiskFlagList">> = ({ props }) => <RiskFlagListView resultId={props.resultId} minSeverity={props.minSeverity} />;
