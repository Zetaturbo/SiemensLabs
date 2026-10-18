"use client";

import { useEffect, useMemo, useState } from "react";
import {
  comparisonMetrics,
  getBestSupplierIds,
  updateShortlist,
  type Metric,
  type Supplier,
} from "@/lib/suppliers";

const MAX_SHORTLIST = 20;
const INITIAL_SELECTION_COUNT = 4;

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
  return supplier[metric.key];
}

function riskClass(value: number): string {
  if (value >= 75) return "critical";
  if (value >= 50) return "high";
  if (value >= 25) return "medium";
  return "low";
}

export default function SupplierComparison({
  initialCandidates,
}: {
  initialCandidates: Supplier[];
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

  const selectedSet = new Set(selectedIds);

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
                <h2>Candidate pool <span className="result-count">10,000</span></h2>
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
                <p className="empty-state">No suppliers match “{query}”. Try a supplier ID such as SUPP_00018.</p>
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
                            <button type="button" className="remove-button" onClick={() => toggleSupplier(supplier.id)} aria-label={`Remove ${supplier.id} from shortlist`}>×</button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    {(["Risk score", "Delivery performance", "Procurement context"] as const).map((group) => (
                      <tbody key={group}>
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
                    ))}
                  </table>
                </div>
                <div className="comparison-note">
                  <span className="note-info" aria-hidden="true">i</span>
                  <p>Risk scores are 0–100 (lower is safer); delivery ratings are performance measures (higher is better). Order value and sourcing fields are context, not a ranking.</p>
                </div>
              </>
            )}
            <div className="panel-footer">
              <span><span className="data-dot" />Based on anonymized supplier risk data</span>
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
