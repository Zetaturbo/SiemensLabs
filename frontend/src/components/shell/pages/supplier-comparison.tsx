"use client";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { Alert, Badge, Button, Card, IconButton, SearchInput } from "@/design-system/react";
import { LEVEL_VAR } from "@/components/case/chart-theme";
import { fmtEur } from "@/components/case/domain";
import { LevelChip, ScoreCell, ui } from "@/components/case/primitives";
import { cn } from "@/lib/utils";
import {
  comparisonMetrics,
  getBestSupplierIds,
  searchSuppliers,
  updateShortlist,
  type Metric,
  type Supplier,
} from "@/lib/brake-suppliers/suppliers";
import type { Assessment, ResearchJobState, ResearchReport } from "@/lib/research/types";

/**
 * Shortlist comparison for the real brake companies (ported from dashboard/). Real names, simulated scores.
 * Each shortlisted company has a Research button: POST /api/research, then poll GET /api/research/:jobId.
 * Research findings sit beside the dataset scores and never change them.
 */

const MAX_SHORTLIST = 20;
const INITIAL_SELECTION = 4;
const POLL_MS = 2500;
const TIMEOUT_MS = 15 * 60_000;
const GROUPS = ["Risk score", "Delivery performance", "Procurement context"] as const;

// Same rule as the research service's SYNTHETIC_ENTITY guard: dataset ids with invented names.
const SYNTHETIC_ID = /^(?:SUPP|BRK)_\d+$/i;
const isResearchable = (id: string) => !SYNTHETIC_ID.test(id);

type ResearchState =
  | { phase: "running"; message: string }
  | { phase: "done"; report: ResearchReport; mode: ResearchJobState["mode"] }
  | { phase: "failed"; message: string };

const ASSESSMENT_LEVEL = { low: "Low", moderate: "Medium", elevated: "High", high: "Critical" } as const;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status}).`);
  return payload as T;
}

function AssessmentChip({ assessment, title }: { assessment: Assessment; title?: string }) {
  const c = LEVEL_VAR[ASSESSMENT_LEVEL[assessment]];
  return (
    <span className="inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-2xs font-medium capitalize" style={{ background: c.bg, color: c.fg }} title={title}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {assessment}
    </span>
  );
}

function formatValue(value: number | string | undefined, format: Metric["format"]): string {
  if (value === undefined) return "–";
  if (typeof value === "string") return value;
  if (format === "currency") return fmtEur(value);
  if (format === "percent") return `${value.toFixed(1)}%`;
  return value.toFixed(0);
}

function metricHint(metric: Metric): string {
  if (metric.group === "Risk score") return "0-100, lower is safer";
  if (metric.group === "Delivery performance") return metric.better === "higher" ? "Higher is better" : "Lower is better";
  return "Context, not a risk score";
}

export function SupplierComparison({ suppliers }: { suppliers: Supplier[] }) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => searchSuppliers(suppliers, "").slice(0, INITIAL_SELECTION).map((s) => s.id));
  const [notice, setNotice] = useState("");
  const [research, setResearch] = useState<Record<string, ResearchState>>({});
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const byId = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);
  const candidates = useMemo(() => searchSuppliers(suppliers, query), [suppliers, query]);
  const selected = selectedIds.map((id) => byId.get(id)).filter((s): s is Supplier => s !== undefined);
  const selectedSet = new Set(selectedIds);

  function toggle(id: string) {
    const result = updateShortlist(selectedIds, id, MAX_SHORTLIST);
    setSelectedIds(result.ids);
    setNotice(result.limitReached ? `The shortlist is limited to ${MAX_SHORTLIST} suppliers.` : "");
  }

  async function runResearch(supplier: Supplier) {
    const update = (state: ResearchState) => {
      if (mounted.current) setResearch((prev) => ({ ...prev, [supplier.id]: state }));
    };
    update({ phase: "running", message: "Starting research" });
    try {
      const job = await readJson<{ job_id: string }>(
        await fetch("/api/research", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // auto_confirm: this view has no step to choose between companies with similar names.
          body: JSON.stringify({ company_name: supplier.name, country: supplier.country ?? null, supplier_id: supplier.id, auto_confirm: true }),
        }),
      );
      const deadline = Date.now() + TIMEOUT_MS;
      while (mounted.current && Date.now() < deadline) {
        await wait(POLL_MS);
        const state = await readJson<ResearchJobState>(await fetch(`/api/research/${encodeURIComponent(job.job_id)}`, { cache: "no-store" }));
        if (state.status === "done" && state.report) return update({ phase: "done", report: state.report, mode: state.mode });
        if (state.status === "failed") throw new Error(state.error ?? "Research failed.");
        if (state.status === "needs_disambiguation") throw new Error("Several companies match this name. Start the research from the case chat to choose one.");
        update({ phase: "running", message: state.progress.at(-1)?.message ?? "Queued" });
      }
      if (mounted.current) throw new Error("Research timed out.");
    } catch (error) {
      update({ phase: "failed", message: error instanceof Error ? error.message : "Research failed." });
    }
  }

  const researched = selected.filter((s) => research[s.id]);
  const categories = [
    ...new Set(
      researched.flatMap((s) => {
        const state = research[s.id];
        return state.phase === "done" ? state.report.category_assessment.map((c) => c.category) : [];
      }),
    ),
  ];
  const showsReplay = researched.some((s) => {
    const state = research[s.id];
    return state.phase === "done" && (state.mode === "replay" || state.report.simulated);
  });

  function researchRow(key: string, label: string, hint: string, render: (report: ResearchReport) => ReactNode, showStatus = false) {
    return (
      <tr key={key}>
        <RowLabel label={label} hint={hint} />
        {selected.map((s) => {
          const state = research[s.id];
          let content: ReactNode = <span className={ui.faint}>–</span>;
          if (state?.phase === "done") content = render(state.report);
          else if (showStatus && state?.phase === "running") content = <span className="text-xs text-subtext">{state.message}...</span>;
          else if (showStatus && state?.phase === "failed") content = <span className="text-xs text-danger">{state.message}</span>;
          else if (showStatus && !state) content = <span className={cn("text-xs", ui.faint)}>Not researched</span>;
          return <Cell key={s.id}>{content}</Cell>;
        })}
      </tr>
    );
  }

  return (
    <section aria-labelledby="comparison-title" className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="comparison-title" className="text-lg font-semibold text-ink">Compare brake suppliers</h2>
          <p className="text-sm text-subtext">
            Shortlist up to {MAX_SHORTLIST} real brake companies and compare them side by side. Names are real; scores are simulated.
          </p>
        </div>
        <Badge tone="warning" size="sm">Simulated scores</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className="flex flex-col gap-3 p-3">
          <SearchInput aria-label="Search brake suppliers" placeholder="Search supplier or ID" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="flex justify-between text-xs text-tertiary">
            <span>{query ? "Matching suppliers" : "Lowest total risk first"}</span>
            <span>{candidates.length} of {suppliers.length}</span>
          </div>
          <ul className="flex flex-col gap-1" aria-label="Brake suppliers">
            {candidates.map((s, i) => {
              const on = selectedSet.has(s.id);
              return (
                <li key={s.id} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5", on ? "bg-sunken" : "hover:bg-surface-hover")}>
                  <span className={cn("w-5 text-2xs", ui.num, ui.faint)}>{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink" title={s.name}>{s.name}</div>
                    <div className="flex items-center gap-2 text-2xs text-tertiary">
                      <span className="font-mono">{s.id}</span>
                      <span>{s.deliveryRating.toFixed(1)}% delivery</span>
                    </div>
                  </div>
                  <LevelChip score={s.totalRiskIndex} level={s.totalRiskLevel} />
                  <IconButton
                    size="sm"
                    variant={on ? "subtle" : "ghost"}
                    aria-pressed={on}
                    aria-label={`${on ? "Remove" : "Add"} ${s.name} ${on ? "from" : "to"} the shortlist`}
                    onClick={() => toggle(s.id)}
                  >
                    {on ? <Check /> : <Plus />}
                  </IconButton>
                </li>
              );
            })}
            {candidates.length === 0 && <li className="px-2 py-6 text-center text-sm text-subtext">No supplier matches &ldquo;{query}&rdquo;.</li>}
          </ul>
        </Card>

        <Card className="flex min-w-0 flex-col gap-3 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-ink">
              Your shortlist <span className={cn(ui.num, ui.faint)}>{selected.length} / {MAX_SHORTLIST}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-subtext">
              <span className="flex items-center gap-1">
                <span className="inline-block size-2.5 rounded-sm ring-1 ring-inset ring-[var(--risk-low)]" /> best in shortlist
              </span>
              <Button size="sm" variant="ghost" disabled={selected.length === 0} onClick={() => (setSelectedIds([]), setNotice(""))}>
                Clear
              </Button>
            </div>
          </div>
          {notice && <p className="text-sm text-warning" role="status">{notice}</p>}

          {selected.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
              <Search aria-hidden className="size-5 text-tertiary" />
              <div className="text-base font-medium text-ink">Start your shortlist</div>
              <div className="max-w-sm text-sm text-subtext">Add suppliers from the list to compare risk, delivery and sourcing context.</div>
            </div>
          ) : (
            <div className="overflow-auto" role="region" aria-label="Supplier comparison. Scroll sideways to see more suppliers." tabIndex={0}>
              <table className="border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr>
                    <th className="sticky left-0 z-20 min-w-44 border-b border-subtle bg-surface px-3 py-2 text-left align-bottom text-xs font-medium uppercase tracking-wide text-tertiary">
                      Measure
                    </th>
                    {selected.map((s) => {
                      const state = research[s.id];
                      return (
                        <th key={s.id} className="min-w-32 max-w-40 border-b border-l border-subtle px-2 py-2 text-left align-top font-normal">
                          <div className="flex items-start justify-between gap-1">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-ink" title={s.name}>{s.name}</div>
                              <div className="font-mono text-2xs text-tertiary">{s.id}{s.country ? ` · ${s.country}` : ""}</div>
                            </div>
                            <IconButton size="sm" aria-label={`Remove ${s.name} from the shortlist`} onClick={() => toggle(s.id)}>
                              <X />
                            </IconButton>
                          </div>
                          {isResearchable(s.id) && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="mt-1.5 w-full"
                              disabled={state?.phase === "running"}
                              onClick={() => runResearch(s)}
                              aria-label={`Research ${s.name} on the web`}
                            >
                              {state?.phase === "running" ? "Researching..." : state?.phase === "done" ? "Run again" : state?.phase === "failed" ? "Retry research" : "Research"}
                            </Button>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                {GROUPS.map((group) => (
                  <Fragment key={group}>
                    <tbody>
                      <GroupRow label={group} span={selected.length + 1} />
                      {comparisonMetrics
                        .filter((m) => m.group === group)
                        .map((m) => {
                          const best = getBestSupplierIds(selected, m);
                          return (
                            <tr key={m.key} className="group">
                              <RowLabel label={m.label} hint={metricHint(m)} />
                              {selected.map((s) => {
                                const value = s[m.key];
                                const isBest = best.has(s.id);
                                return (
                                  <Cell key={s.id}>
                                    {m.group === "Risk score" && typeof value === "number" ? (
                                      <ScoreCell value={value} label={m.label} emphasis={isBest ? "best" : undefined} />
                                    ) : (
                                      <span
                                        className={cn("inline-flex min-w-[3.5rem] justify-center rounded-md px-1 py-0.5 text-xs", typeof value === "number" && ui.num, isBest && "ring-1 ring-inset ring-[var(--risk-low)]")}
                                        title={isBest ? "best in shortlist" : undefined}
                                      >
                                        {formatValue(value, m.format)}
                                      </span>
                                    )}
                                  </Cell>
                                );
                              })}
                            </tr>
                          );
                        })}
                    </tbody>
                    {group === "Risk score" && researched.length > 0 && (
                      <tbody>
                        <GroupRow label="Web research findings" span={selected.length + 1} />
                        {researchRow(
                          "overall",
                          "Overall assessment",
                          "Verified sources only",
                          (r) => (
                            <span className="inline-flex items-center gap-1">
                              <AssessmentChip assessment={r.overall_assessment} title={r.summary} />
                              {r.simulated && <Badge tone="warning" size="sm">Simulated</Badge>}
                            </span>
                          ),
                          true,
                        )}
                        {categories.map((category) =>
                          researchRow(`category-${category}`, `${category[0].toUpperCase()}${category.slice(1)}`, "Research assessment", (r) => {
                            const entry = r.category_assessment.find((c) => c.category === category);
                            return entry ? <AssessmentChip assessment={entry.assessment} title={entry.rationale} /> : <span className={cn("text-xs", ui.faint)}>Not assessed</span>;
                          }),
                        )}
                        {researchRow("flags", "Verified red flags", "Each with a cited source", (r) =>
                          r.risk_flags.length === 0 ? (
                            <span className="text-xs text-subtext">None found</span>
                          ) : (
                            <ul className="flex flex-col gap-1 text-left">
                              {r.risk_flags.map((flag) => (
                                <li key={flag.title} className="flex items-start gap-1 text-xs">
                                  <AssessmentChip assessment={flag.severity} />
                                  {flag.sources[0] ? (
                                    <a href={flag.sources[0].url} target="_blank" rel="noreferrer" title={flag.finding} className="text-ink underline decoration-line underline-offset-2 hover:decoration-current">
                                      {flag.title}
                                    </a>
                                  ) : (
                                    <span title={flag.finding}>{flag.title}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ),
                        )}
                        {researchRow("claims", "Verified claims", "Checked against source text", (r) => (
                          <span className={cn("text-xs", ui.num)}>{r.verification_summary ? `${r.verification_summary.verified} of ${r.verification_summary.total}` : "–"}</span>
                        ))}
                      </tbody>
                    )}
                  </Fragment>
                ))}
              </table>
            </div>
          )}

          <p className="text-xs text-tertiary">
            Risk scores are 0-100 (lower is safer); delivery measures are higher-is-better except order change rate. Order volume and sourcing fields are context, not a ranking.
            {researched.length > 0 && " Web research findings sit beside the dataset scores and never change them."}
          </p>
          {showsReplay && (
            <Alert tone="warning" title="Replay mode" className="p-2.5 text-sm">
              These research results are a simulated example report, not findings about these companies. Set RESEARCH_API_URL to use the live service.
            </Alert>
          )}
        </Card>
      </div>
    </section>
  );
}

function RowLabel({ label, hint }: { label: string; hint: string }) {
  return (
    <th scope="row" className="sticky left-0 z-[5] border-b border-subtle bg-surface px-3 py-1.5 text-left font-normal group-hover:bg-surface-hover">
      <div className="text-sm text-ink">{label}</div>
      <div className="text-2xs text-tertiary">{hint}</div>
    </th>
  );
}

function GroupRow({ label, span }: { label: string; span: number }) {
  return (
    <tr>
      <th scope="rowgroup" colSpan={span} className="sticky left-0 border-b border-subtle bg-sunken px-3 py-1 text-left text-2xs font-medium uppercase tracking-wide text-tertiary">
        {label}
      </th>
    </tr>
  );
}

function Cell({ children }: { children: ReactNode }) {
  return <td className="border-b border-l border-subtle px-2 py-1.5 text-center align-middle group-hover:bg-surface-hover">{children}</td>;
}
