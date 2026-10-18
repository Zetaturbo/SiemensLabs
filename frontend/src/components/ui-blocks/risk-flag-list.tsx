"use client";
import { useState } from "react";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { Badge, Button, Spinner } from "@/design-system/react";
import { invalidateResult } from "@/lib/hooks/use-result";
import { str } from "./fields";
import { BlockEmpty, BlockFrame, Eyebrow, LEVEL_STYLE, WithResult, cn } from "./primitives";
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

export function SeverityChip({ severity, className }: { severity: Severity | null; className?: string }) {
  if (!severity) return null;
  return (
    <Badge size="sm" className={cn("font-semibold uppercase tracking-wide", LEVEL_STYLE[SEVERITY_LEVEL[severity]].chip, className)}>
      {severity}
    </Badge>
  );
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
      {index !== undefined && <span className="tabular mr-1 font-mono text-tertiary">[{index}]</span>}
      {source.title}
    </>
  );
  return (
    <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      {safe ? (
        <a href={safe} target="_blank" rel="noreferrer noopener" className="truncate text-ink underline-offset-2 hover:text-brand hover:underline">
          {label}
        </a>
      ) : (
        <span className="text-ink">{label}</span>
      )}
      <span className="text-2xs text-tertiary">{[source.publisher ?? hostOf(source.url), source.accessed && `accessed ${source.accessed}`].filter(Boolean).join(" · ")}</span>
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
  return (
    <BlockFrame
      block="risk-flag-list"
      title={
        <span className="flex items-center gap-2">
          {job.company_name ?? "Web research"}
          <Badge size="sm" tone={job.status === "failed" ? "danger" : job.status === "needs_disambiguation" ? "warning" : "neutral"}>
            {running && <Spinner size="sm" className="size-3" label="Research running" />}
            {job.status.replace("_", " ")}
          </Badge>
        </span>
      }
      subtitle={`Research job ${job.job_id}${job.mode === "replay" ? " · replay data" : ""}. Findings appear here when the report is ready.`}
    >
      {job.status === "failed" ? (
        <p className="text-xs text-[var(--risk-critical)]">{job.error ?? "The research job failed."}</p>
      ) : job.status === "needs_disambiguation" && job.candidates.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs text-subtext">Several companies match. Which one do you mean?</p>
          {job.candidates.map((c) => (
            <div key={c.candidate_id} className="flex items-center justify-between gap-2 rounded-lg border border-subtle px-2 py-1.5 text-xs">
              <span className="min-w-0 truncate text-ink">
                {c.legal_name}
                <span className="ml-1.5 text-tertiary">{[c.country, c.website].filter(Boolean).join(" · ")}</span>
              </span>
              <Button size="sm" variant="secondary" className="h-6 px-2 text-xs" disabled={!!confirming} onClick={() => void confirm(c.candidate_id)}>
                {confirming === c.candidate_id ? "Confirming…" : "This one"}
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <ol className="space-y-1">
          {(job.progress.length ? job.progress.slice(-6) : [{ step: "queued", message: "Waiting for the research agent" }]).map((p, i, arr) => (
            <li key={i} className="flex items-baseline gap-2 text-xs">
              <Badge size="sm" tone={p.step === "red_flag" ? "danger" : "outline"} className="font-mono">
                {p.step}
              </Badge>
              <span className={i === arr.length - 1 && running ? "text-ink" : "text-subtext"}>{p.message}</span>
            </li>
          ))}
        </ol>
      )}
    </BlockFrame>
  );
}

export function RiskFlagListView({ resultId, data, minSeverity }: { resultId?: string | null; data?: unknown; minSeverity?: Severity | null }) {
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
        return (
          <BlockFrame
            block="risk-flag-list"
            title={
              <span className="flex items-center gap-2">
                {report.company.legal_name ?? "Research findings"}
                {report.company.country && <span className="text-xs font-normal text-tertiary">{report.company.country}</span>}
                {report.overall && <SeverityChip severity={report.overall} />}
              </span>
            }
            subtitle={`${report.flags.length} risk flag${report.flags.length === 1 ? "" : "s"} from web research${report.overall ? `, overall ${report.overall}` : ""}`}
          >
            {report.summary && <p className="mb-3 text-sm leading-relaxed text-ink">{report.summary}</p>}
            {flags.length === 0 ? (
              <p className="text-xs text-subtext">No flags at or above {minSeverity}.</p>
            ) : (
              <ul className="space-y-2">
                {flags.map((f, i) => (
                  <li key={`${f.title}-${i}`} className="rounded-lg border border-subtle p-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SeverityChip severity={f.severity} />
                      <Badge size="sm" tone="outline">
                        {f.category}
                      </Badge>
                      {f.date && (
                        <time className="tabular ml-auto font-mono text-2xs text-tertiary" dateTime={f.date}>
                          {f.date}
                        </time>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-ink">{f.title}</p>
                    {f.finding && <p className="text-xs leading-relaxed text-subtext">{f.finding}</p>}
                    {f.sources.length > 0 ? (
                      <ul className="mt-1 space-y-0.5 text-xs">
                        {f.sources.map((s) => (
                          <li key={s.url ?? s.title}>
                            <SourceLink source={s} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-2xs text-[var(--risk-critical)]">No source attached: treat as unverified.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {hidden > 0 && (
              <p className="mt-2 text-2xs text-tertiary">
                {hidden} lower-severity flag{hidden === 1 ? "" : "s"} hidden.
              </p>
            )}
            {report.assessments.length > 0 && (
              <div className="mt-3 border-t border-subtle pt-2">
                <Eyebrow>Category assessment</Eyebrow>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
                  {report.assessments.map((a) => (
                    <div key={a.category} className="flex items-center justify-between gap-1 text-xs" title={a.rationale ?? undefined}>
                      <dt className="truncate capitalize text-ink">{a.category}</dt>
                      <dd>
                        <SeverityChip severity={a.assessment} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {report.limitations && <p className="mt-2 text-2xs italic text-tertiary">Limitations: {report.limitations}</p>}
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const RiskFlagListBlock: ComponentRenderer<BlockProps<"RiskFlagList">> = ({ props }) => <RiskFlagListView resultId={props.resultId} minSeverity={props.minSeverity} />;
