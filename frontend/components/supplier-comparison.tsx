"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  isResearchable,
  type Assessment,
  type ResearchJobView,
  type ResearchReport,
} from "@/lib/research-types";
import {
  comparisonMetrics,
  getBestSupplierIds,
  updateShortlist,
  type Metric,
  type Supplier,
} from "@/lib/suppliers";

const MAX_SHORTLIST = 20;
const INITIAL_SELECTION_COUNT = 4;
const RESEARCH_POLL_MS = 2500;
const RESEARCH_TIMEOUT_MS = 15 * 60_000;

type ResearchState =
  | { phase: "running"; message: string }
  | { phase: "done"; report: ResearchReport; mode: ResearchJobView["mode"] }
  | { phase: "failed"; message: string };

const ASSESSMENT_CLASS: Record<Assessment, string> = {
  low: "low",
  moderate: "medium",
  elevated: "high",
  high: "critical",
};

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status}).`);
  return payload as T;
}

function AssessmentChip({ assessment, title }: { assessment: Assessment; title?: string }) {
  return (
    <span className={`assessment-chip ${ASSESSMENT_CLASS[assessment]}`} title={title}>
      {assessment}
    </span>
  );
}

function formatValue(value: number | string, format: Metric["format"]): string {
  if (typeof value === "string") return value;
  if (format === "currency") {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (format === "percent") return `${value.toFixed(1)}%`;
  return value.toFixed(0);
}

function metricValue(supplier: Supplier, metric: Metric): number | string {
  return supplier[metric.key] ?? "";
}

function riskClass(value: number): string {
  if (value >= 75) return "critical";
  if (value >= 50) return "high";
  if (value >= 25) return "medium";
  return "low";
}

export default function SupplierComparison({
  initialCandidates,
  totalSuppliers,
}: {
  initialCandidates: Supplier[];
  totalSuppliers: number;
}) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [suppliersById, setSuppliersById] = useState(
    () => new Map(initialCandidates.map((supplier) => [supplier.id, supplier])),
  );
  const [selectedIds, setSelectedIds] = useState(
    initialCandidates.slice(0, INITIAL_SELECTION_COUNT).map((supplier) => supplier.id),
  );
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [notice, setNotice] = useState("");
  const [research, setResearch] = useState<Record<string, ResearchState>>({});
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError("");
      try {
        const response = await fetch(`/api/suppliers?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Supplier search failed. Please try again.");
        const payload: { results: Supplier[] } = await response.json();
        setCandidates(payload.results);
        setSuppliersById((previous) => {
          const next = new Map(previous);
          for (const supplier of payload.results) next.set(supplier.id, supplier);
          return next;
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSearchError(error instanceof Error ? error.message : "Supplier search failed.");
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, query ? 250 : 0);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  const selectedSuppliers = useMemo(() => {
    return selectedIds
      .map((id) => suppliersById.get(id))
      .filter((supplier): supplier is Supplier => supplier !== undefined);
  }, [selectedIds, suppliersById]);

  function toggleSupplier(id: string) {
    const result = updateShortlist(selectedIds, id, MAX_SHORTLIST);
    setSelectedIds(result.ids);
    setNotice(result.limitReached ? `Shortlist is limited to ${MAX_SHORTLIST} suppliers.` : "");
  }

  function clearShortlist() {
    setSelectedIds([]);
    setNotice("");
  }

  async function runResearch(supplier: Supplier) {
    const update = (state: ResearchState) => {
      if (mounted.current) setResearch((previous) => ({ ...previous, [supplier.id]: state }));
    };
    update({ phase: "running", message: "Starting research" });
    try {
      const job = await readJson<{ job_id: string }>(
        await fetch("/api/research", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ supplierId: supplier.id }),
        }),
      );
      const deadline = Date.now() + RESEARCH_TIMEOUT_MS;
      while (mounted.current && Date.now() < deadline) {
        await wait(RESEARCH_POLL_MS);
        const view = await readJson<ResearchJobView>(
          await fetch(`/api/research/${encodeURIComponent(job.job_id)}`, { cache: "no-store" }),
        );
        if (view.status === "done" && view.report) {
          update({ phase: "done", report: view.report, mode: view.mode });
          return;
        }
        if (view.status === "failed") throw new Error(view.error ?? "Research failed.");
        if (view.status === "needs_disambiguation") {
          throw new Error("Several companies match this name. Confirm the company in the research service.");
        }
        update({ phase: "running", message: view.progress.at(-1)?.message ?? "Queued" });
      }
      if (mounted.current) throw new Error("Research timed out.");
    } catch (error) {
      update({ phase: "failed", message: error instanceof Error ? error.message : "Research failed." });
    }
  }

  const selectedSet = new Set(selectedIds);
  const researchedSuppliers = selectedSuppliers.filter((supplier) => research[supplier.id]);
  const researchCategories = [
    ...new Set(
      researchedSuppliers.flatMap((supplier) => {
        const state = research[supplier.id];
        return state.phase === "done" ? state.report.category_assessment.map((entry) => entry.category) : [];
      }),
    ),
  ];
  const showsReplay = researchedSuppliers.some((supplier) => {
    const state = research[supplier.id];
    return state.phase === "done" && (state.mode === "replay" || state.report.simulated);
  });

  function researchRow(
    key: string,
    label: string,
    hint: string,
    render: (report: ResearchReport) => React.ReactNode,
    showStatus = false,
  ) {
    return (
      <tr key={key}>
        <th scope="row" className="metric-label">
          <span>{label}</span>
          <small>{hint}</small>
        </th>
        {selectedSuppliers.map((supplier) => {
          const state = research[supplier.id];
          let content: React.ReactNode = <span className="research-muted">—</span>;
          if (state?.phase === "done") content = render(state.report);
          else if (showStatus && state?.phase === "running") {
            content = <span className="research-running">{state.message}…</span>;
          } else if (showStatus && state?.phase === "failed") {
            content = <span className="research-error">{state.message}</span>;
          } else if (showStatus && !state) {
            content = (
              <span className="research-muted">
                {isResearchable(supplier.id) ? "Not researched" : "Invented name, not researchable"}
              </span>
            );
          }
          return <td key={supplier.id}>{content}</td>;
        })}
      </tr>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Siemens procurement home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>Siemens<span className="brand-divider"> / </span>Procurement</span>
        </a>
        <div className="topbar-right">
          <span className="environment-tag"><span className="status-dot" />Supplier intelligence</span>
          <span className="avatar" aria-label="Buyer account">B</span>
        </div>
      </header>

      <div className="page-content">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <span>Supplier sourcing</span><span className="crumb-divider">/</span><strong>Compare shortlist</strong>
        </nav>

        <section className="page-heading">
          <div>
            <p className="eyebrow">SOURCING WORKSPACE <span>·</span> STEP 3 OF 4</p>
            <h1>Compare suppliers</h1>
            <p className="subheading">
              Review your preliminary results side by side and build a shortlist you can justify.
            </p>
          </div>
          <div className="step-indicator" aria-label="Step 3 of 4">
            <span className="step complete">01 <span>Define need</span></span>
            <span className="step-line" />
            <span className="step complete">02 <span>Screen</span></span>
            <span className="step-line active" />
            <span className="step current">03 <span>Compare</span></span>
            <span className="step-line" />
            <span className="step">04 <span>Decide</span></span>
          </div>
        </section>

        <section className="workspace" aria-label="Supplier comparison workspace">
          <aside className="candidate-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">PRELIMINARY RESULTS</p>
                <h2>Candidate pool <span className="result-count">{totalSuppliers.toLocaleString("en-GB")}</span></h2>
              </div>
              <span className="sort-label">Lowest total risk first</span>
            </div>
            <label className="search-wrap">
              <span className="search-icon" aria-hidden="true">⌕</span>
              <span className="sr-only">Search suppliers by name or ID</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search supplier or ID"
                type="search"
              />
              {isSearching && <span className="searching-indicator" aria-label="Searching" />}
            </label>
            <div className="results-meta">
              <span>{query ? "Matching suppliers" : "Top 20 by Total Risk Index"}</span>
              <span>{candidates.length} results</span>
            </div>

            {searchError && <p className="inline-error" role="alert">{searchError}</p>}
            <div className="candidate-list" aria-label="Preliminary supplier results">
              {candidates.map((supplier, index) => {
                const selected = selectedSet.has(supplier.id);
                return (
                  <article className={`candidate-card${selected ? " is-selected" : ""}`} key={supplier.id}>
                    <div className="candidate-rank">{String(index + 1).padStart(2, "0")}</div>
                    <div className="candidate-info">
                      <strong>{supplier.name}</strong>
                      <span>{supplier.id}</span>
                      <div className="candidate-stats">
                        <span className={`risk-tag ${riskClass(supplier.totalRiskIndex)}`}>
                          {supplier.totalRiskIndex} <span>risk</span>
                        </span>
                        <span>{supplier.deliveryRating.toFixed(1)}% delivery</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`add-button${selected ? " added" : ""}`}
                      aria-label={`${selected ? "Remove" : "Add"} ${supplier.id} ${selected ? "from" : "to"} comparison`}
                      aria-pressed={selected}
                      onClick={() => toggleSupplier(supplier.id)}
                    >
                      {selected ? "✓" : "+"}
                    </button>
                  </article>
                );
              })}
              {!isSearching && candidates.length === 0 && !searchError && (
                <p className="empty-state">No suppliers match “{query}”. Try a supplier ID such as BRKR_0002.</p>
              )}
            </div>
            <p className="panel-footnote">Showing up to 20 ranked results. Search all suppliers by name or ID.</p>
          </aside>

          <section className="comparison-panel" aria-labelledby="comparison-title">
            <div className="comparison-toolbar">
              <div>
                <p className="eyebrow">SIDE-BY-SIDE VIEW</p>
                <h2 id="comparison-title">Your shortlist <span className="shortlist-count">{selectedIds.length}<span> / {MAX_SHORTLIST}</span></span></h2>
              </div>
              <button type="button" className="text-button" onClick={clearShortlist} disabled={selectedIds.length === 0}>
                Clear shortlist
              </button>
            </div>

            {notice && <p className="inline-notice" role="status">{notice}</p>}
            {selectedSuppliers.length === 0 ? (
              <div className="comparison-empty">
                <div className="empty-icon" aria-hidden="true">＋</div>
                <h3>Start building your shortlist</h3>
                <p>Add suppliers from the preliminary results to compare risk, delivery, and sourcing context.</p>
              </div>
            ) : (
              <>
                <div className="comparison-summary">
                  <div className="summary-copy">
                    <span className="summary-icon" aria-hidden="true">↗</span>
                    <span><strong>{selectedSuppliers.length} suppliers selected</strong><small>Compare key risks and delivery signals at a glance.</small></span>
                  </div>
                  <div className="legend" aria-label="Comparison legend">
                    <span><i className="legend-dot best" /> Best in shortlist</span>
                    <span><i className="legend-dot risk" /> Higher risk</span>
                  </div>
                </div>

                <div className="matrix-scroll" role="region" aria-label="Supplier metric comparison. Scroll horizontally to compare more suppliers." tabIndex={0}>
                  <table className="comparison-table">
                    <thead>
                      <tr>
                        <th className="metric-header" scope="col">
                          <span>MEASURE</span><small>Best value highlighted</small>
                        </th>
                        {selectedSuppliers.map((supplier) => (
                          <th className="supplier-header" scope="col" key={supplier.id}>
                            <span className="supplier-initial">{supplier.name.slice(0, 1)}</span>
                            <strong title={supplier.name}>{supplier.name}</strong>
                            <small>{supplier.id}</small>
                            {isResearchable(supplier.id) && (
                              <button
                                type="button"
                                className="research-button"
                                onClick={() => runResearch(supplier)}
                                disabled={research[supplier.id]?.phase === "running"}
                                aria-label={`Research ${supplier.name} on the web`}
                              >
                                {{ running: "Researching…", done: "Run again", failed: "Retry research" }[
                                  research[supplier.id]?.phase ?? ""
                                ] ?? "Research"}
                              </button>
                            )}
                            <button type="button" className="remove-button" onClick={() => toggleSupplier(supplier.id)} aria-label={`Remove ${supplier.id} from shortlist`}>×</button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    {(["Risk score", "Delivery performance", "Procurement context"] as const).map((group) => (
                      <Fragment key={group}>
                      <tbody>
                        <tr className="group-row">
                          <th scope="rowgroup" colSpan={selectedSuppliers.length + 1}>{group}</th>
                        </tr>
                        {comparisonMetrics.filter((metric) => metric.group === group).map((metric) => {
                          const bestIds = getBestSupplierIds(selectedSuppliers, metric);
                          return (
                            <tr key={metric.key}>
                              <th scope="row" className="metric-label">
                                <span>{metric.label}</span>
                                {metric.group === "Risk score" && <small>0–100 · lower is safer</small>}
                                {metric.group === "Delivery performance" && (
                                  <small>{metric.better === "higher" ? "Higher is better" : "Lower is better"}</small>
                                )}
                                {metric.group === "Procurement context" && <small>Context, not a risk score</small>}
                              </th>
                              {selectedSuppliers.map((supplier) => {
                                const value = metricValue(supplier, metric);
                                const numeric = typeof value === "number";
                                const score = numeric ? value : null;
                                const best = bestIds.has(supplier.id);
                                const risk = metric.group === "Risk score" && score !== null;
                                return (
                                  <td className={`${best ? "best-cell" : ""}${risk ? ` ${riskClass(score)}-cell` : ""}`} key={supplier.id}>
                                    <div className={`metric-value${best ? " is-best" : ""}`}>
                                      {risk ? (
                                        <span className={`metric-number ${riskClass(score)}`}>{formatValue(value, metric.format)}</span>
                                      ) : (
                                        <span className="plain-value">{formatValue(value, metric.format)}</span>
                                      )}
                                      {best && <span className="best-label">BEST</span>}
                                    </div>
                                    {risk && <div className="score-track"><span className={`score-fill ${riskClass(score)}`} style={{ width: `${score}%` }} /></div>}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                      {group === "Risk score" && researchedSuppliers.length > 0 && (
                        <tbody className="research-group">
                          <tr className="group-row">
                            <th scope="rowgroup" colSpan={selectedSuppliers.length + 1}>Web research findings</th>
                          </tr>
                          {researchRow("overall", "Overall assessment", "Verified sources only", (report) => (
                            <div className="metric-value">
                              <AssessmentChip assessment={report.overall_assessment} title={report.summary} />
                              {report.simulated && <span className="simulated-badge">SIMULATED</span>}
                            </div>
                          ), true)}
                          {researchCategories.map((category) =>
                            researchRow(`category-${category}`, `${category[0].toUpperCase()}${category.slice(1)}`, "Research assessment", (report) => {
                              const entry = report.category_assessment.find((item) => item.category === category);
                              return entry ? (
                                <AssessmentChip assessment={entry.assessment} title={entry.rationale} />
                              ) : (
                                <span className="research-muted">Not assessed</span>
                              );
                            }),
                          )}
                          {researchRow("flags", "Verified red flags", "Each with a cited source", (report) =>
                            report.risk_flags.length === 0 ? (
                              <span className="plain-value">None found</span>
                            ) : (
                              <ul className="flag-list">
                                {report.risk_flags.map((flag) => (
                                  <li key={flag.title}>
                                    <AssessmentChip assessment={flag.severity} />
                                    {flag.sources[0] ? (
                                      <a href={flag.sources[0].url} target="_blank" rel="noreferrer" title={flag.finding}>{flag.title}</a>
                                    ) : (
                                      <span title={flag.finding}>{flag.title}</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            ),
                          )}
                          {researchRow("claims", "Verified claims", "Checked against source text", (report) => (
                            <span className="plain-value">
                              {report.verification_summary
                                ? `${report.verification_summary.verified} of ${report.verification_summary.total}`
                                : "—"}
                            </span>
                          ))}
                        </tbody>
                      )}
                      </Fragment>
                    ))}
                  </table>
                </div>
                <div className="comparison-note">
                  <span className="note-info" aria-hidden="true">i</span>
                  <p>Risk scores are 0–100 (lower is safer); delivery ratings are performance measures (higher is better). Order value and sourcing fields are context, not a ranking.{researchedSuppliers.length > 0 && " Web research findings sit beside the dataset scores and never change them."}</p>
                </div>
                {showsReplay && (
                  <p className="inline-notice" role="status">
                    Replay mode: research results show the research service&apos;s simulated example report, not findings about these companies. Set RESEARCH_API_URL to use the live service.
                  </p>
                )}
              </>
            )}
            <div className="panel-footer">
              <span><span className="data-dot" />Real brake companies · scores simulated until researched</span>
              <button type="button" className="continue-button" disabled={selectedSuppliers.length === 0}>
                Continue to decision <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>
        </section>
        <footer className="page-footer">
          <span>SUPPLIER INTELLIGENCE <span className="footer-separator">·</span> INTERNAL PROCUREMENT TOOL</span>
          <span>Scores reflect dataset indicators and are not a substitute for buyer due diligence.</span>
        </footer>
      </div>
    </main>
  );
}
