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
  /** Verified claims the flag is built from (research service). */
  claimCount: number | null;
}

export interface Report {
  company: { legal_name: string | null; country: string | null; website: string | null; lei: string | null };
  summary: string | null;
  overall: Severity | null;
  flags: RiskFlag[];
  assessments: Array<{ category: string; assessment: Severity | null; rationale: string | null }>;
  sources: Source[];
  limitations: string | null;
  /** Claim counts of the run (research service: verification_summary, else counted from claims); null for older reports. */
  claims: { total: number; verified: number; partial: number; dropped: number } | null;
  /** The service's sandbox companies produce simulated reports. */
  simulated: boolean;
}

const asSeverity = (v: unknown): Severity | null => (typeof v === "string" && (SEVERITIES as string[]).includes(v.toLowerCase()) ? (v.toLowerCase() as Severity) : null);

/** "federalregister.gov/documents/2018/…" for a source whose title is only its URL (the service's fallback). */
const titleFromUrl = (url: string) => {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname).replace(/\/+$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
};

const toSource = (s: unknown): Source | null => {
  if (!s || typeof s !== "object") return null;
  const r = s as Rec;
  const url = str(r.url);
  const raw = str(r.title);
  const title = raw && raw !== url ? raw : url ? titleFromUrl(url) : raw;
  return title ? { title, url, publisher: str(r.publisher), accessed: str(r.accessed) } : null;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Claim counts: verification_summary when present, else counted from the claims list. */
function claimCounts(d: Rec): Report["claims"] {
  const v = d.verification_summary as Rec | null | undefined;
  if (v && typeof v === "object" && num(v.total) !== null) {
    return { total: num(v.total)!, verified: num(v.verified) ?? 0, partial: num(v.partial) ?? 0, dropped: num(v.dropped) ?? 0 };
  }
  if (!Array.isArray(d.claims)) return null;
  const status = (d.claims as Rec[]).map((c) => (c && typeof c === "object" ? str(c.status) : null));
  return {
    total: status.length,
    verified: status.filter((x) => x === "verified").length,
    partial: status.filter((x) => x === "partial").length,
    dropped: status.filter((x) => x === "unsupported" || x === "contradicted").length,
  };
}

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
      claimCount: Array.isArray(f.claim_ids) ? f.claim_ids.length : null,
    }));
  const company = (d.company && typeof d.company === "object" ? d.company : {}) as Rec;
  const own = (Array.isArray(d.sources) ? d.sources : []).map(toSource).filter((s): s is Source => s !== null);
  const byKey = new Map<string, Source>();
  for (const s of [...own, ...flags.flatMap((f) => f.sources)]) {
    const k = s.url ?? s.title;
    const prev = byKey.get(k);
    byKey.set(k, prev ? { ...prev, publisher: prev.publisher ?? s.publisher, accessed: prev.accessed ?? s.accessed } : s);
  }
  const sources = [...byKey.values()];
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
    claims: claimCounts(d),
    simulated: d.simulated === true,
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
  const publisher = source.publisher ?? hostOf(source.url);
  // A title built from the URL already starts with the host; do not repeat it.
  const by = publisher && !source.title.startsWith(publisher) ? publisher : null;
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
      note={
        job.job_id
          ? `Research job ${job.job_id}${job.mode === "replay" ? ", replay of a recorded live run" : ""}. Findings appear here when the report is ready.`
          : "The research service did not start a job."
      }
      actions={
        <span className="inline-flex items-center gap-2 text-sm text-subtext">
          {running ? <Spinner size="sm" className="size-3.5" label="Research running" /> : <Dot fill={job.status === "failed" ? "var(--risk-critical)" : "var(--risk-high)"} />}
          {!job.job_id && job.status === "failed" ? "Not started" : (STATUS_WORD[job.status] ?? cap(job.status.replace(/_/g, " ")))}
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

/**
 * Category assessments in one quiet line: the categories above low by name with their severity, the rest counted
 * ("legal Elevated · safety Elevated · 6 low"). The rationale is the tooltip.
 */
export function CategoryLine({ assessments, className }: { assessments: Report["assessments"]; className?: string }) {
  if (!assessments.length) return null;
  const raised = assessments.filter((a) => a.assessment && a.assessment !== "low").sort((a, b) => rank(b.assessment) - rank(a.assessment));
  const low = assessments.length - raised.length;
  return (
    <p className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-subtext", className)}>
      {raised.map((a) => (
        <span key={a.category} className="inline-flex items-center gap-1.5" title={a.rationale ?? undefined}>
          {cap(a.category)}
          <SeverityChip severity={a.assessment} />
        </span>
      ))}
      {low > 0 && (
        <span title={assessments.filter((a) => !raised.includes(a)).map((a) => a.category).join(", ")}>
          {raised.length ? `${low} more low` : `all ${low} categories low`}
        </span>
      )}
    </p>
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
          report.simulated && "Simulated example: a sandbox company with simulated documents, not a real company.",
          report.company.country && `Country: ${report.company.country}.`,
          report.company.lei && `LEI ${report.company.lei}.`,
          hidden > 0 && `${hidden} flag${hidden === 1 ? "" : "s"} below ${minSeverity} hidden.`,
          report.limitations && `Limitations: ${report.limitations}`,
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <BlockFrame block="risk-flag-list" title={report.company.legal_name ?? "Research findings"} note={note || undefined} actions={<SeverityChip severity={report.overall} />}>
            {report.summary && <p className="text-sm leading-relaxed text-ink">{report.summary}</p>}
            <CategoryLine assessments={report.assessments} className={cn(report.summary && "mt-3")} />
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
                            {f.claimCount !== null && <span className="text-tertiary">{` · ${f.claimCount} verified claim${f.claimCount === 1 ? "" : "s"}`}</span>}
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
            {report.claims && (
              <p className="mt-3 text-sm text-tertiary">
                <Num>{report.claims.total}</Num> claims checked against their sources: <Num>{report.claims.verified}</Num> verified
                {report.claims.partial > 0 && (
                  <>
                    , <Num>{report.claims.partial}</Num> unconfirmed
                  </>
                )}
                {report.claims.dropped > 0 && (
                  <>
                    , <Num>{report.claims.dropped}</Num> dropped
                  </>
                )}
                . Only verified claims become flags.
              </p>
            )}
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const RiskFlagListBlock: ComponentRenderer<BlockProps<"RiskFlagList">> = ({ props }) => <RiskFlagListView resultId={props.resultId} minSeverity={props.minSeverity} />;
