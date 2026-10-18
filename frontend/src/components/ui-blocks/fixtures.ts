import compareSuppliers from "@/lib/data-api/mocks/compare_suppliers.json";
import explainSupplier from "@/lib/data-api/mocks/explain_supplier.json";
import filterSuppliers from "@/lib/data-api/mocks/filter_suppliers.json";
import findSimilar from "@/lib/data-api/mocks/find_similar.json";
import getSuppliers from "@/lib/data-api/mocks/get_suppliers.json";
import rankWithProfile from "@/lib/data-api/mocks/rank_with_profile.json";
import runSql from "@/lib/data-api/mocks/run_sql.json";
import brake from "./brake-fixtures.json";
import type { MemoDoc } from "./memo";

/**
 * Fixture results for /dev/blocks and the chat demo mode. Data-tool results are the data owner's
 * real-valued mocks (src/lib/data-api/mocks, envelope `data` only, which is what skills store).
 * The research report and memo have no mock yet: the report is a placeholder for a fictional
 * company with example.com sources; the memo restates the compare mock's numbers.
 */

const RESEARCH_REPORT = {
  company: { legal_name: "Example Rail Components GmbH", country: "DE", website: "https://example.com", lei: null },
  summary:
    "Placeholder report for UI development: a fictional mid-sized brake component maker. Findings and sources are invented and point to example.com. " +
    "Replace with mocks/research_report.json from the research agent.",
  overall_assessment: "elevated",
  risk_flags: [
    {
      category: "quality",
      severity: "high",
      title: "Product recall of brake pad batch",
      finding: "Fictional example: a voluntary recall of one brake pad batch after wear tests, closed after a corrective action plan.",
      date: "2025-03-14",
      sources: [
        { title: "Recall notice (placeholder)", url: "https://example.com/recall-notice", publisher: "Example Rail Gazette", accessed: "2026-10-18" },
        { title: "Corrective action summary (placeholder)", url: "https://example.org/capa", publisher: "Example Regulator", accessed: "2026-10-18" },
      ],
    },
    {
      category: "financial",
      severity: "moderate",
      title: "Covenant waiver on a credit line",
      finding: "Fictional example: lenders granted a temporary covenant waiver; liquidity reported as adequate.",
      date: "2024-11-02",
      sources: [{ title: "Annual report excerpt (placeholder)", url: "https://example.com/annual-report", publisher: "Example Rail Components", accessed: "2026-10-18" }],
    },
    {
      category: "esg",
      severity: "low",
      title: "Supplier code of conduct published",
      finding: "Fictional example: a supplier code of conduct with LkSG references is public.",
      date: "2024-06-20",
      sources: [{ title: "Code of conduct (placeholder)", url: "https://example.com/code-of-conduct", publisher: "Example Rail Components", accessed: "2026-10-18" }],
    },
  ],
  category_assessment: [
    { category: "financial", assessment: "moderate", rationale: "Covenant waiver, no default." },
    { category: "legal", assessment: "low", rationale: "No open litigation found." },
    { category: "sanctions", assessment: "low", rationale: "No sanctions list match." },
    { category: "quality", assessment: "high", rationale: "Recent recall." },
    { category: "esg", assessment: "low", rationale: "Code of conduct in place." },
    { category: "operations", assessment: "moderate", rationale: "Single plant." },
  ],
  sources: [{ title: "Company register entry (placeholder)", url: "https://example.org/register" }],
  limitations: "Placeholder data. A real report lists what could not be verified.",
};

const MEMO: MemoDoc = {
  title: "Shortlist memo: passenger doors",
  subtitle: "Three suppliers compared under the default profile",
  case_id: "case_doors",
  part_id: "doors",
  profile_id: "default",
  generated_at: "2026-10-18",
  author: "Tom R. (Body systems)",
  summary:
    "All three shortlisted suppliers are **High** on the total risk index (57 to 62), so none is low-risk. " +
    "On financial risk (financial health and credit rating), Dynamic Group 434 is lowest; on total risk, Strategic Logistics 386 is lowest.",
  recommendation: {
    supplier_id: "SUPP_00012",
    supplier_name: "Dynamic Group 434",
    rationale: "Lowest financial family score (55.1 vs 61.6 and 62.4), driven by the best credit rating in the group (57 vs 76 for Strategic Logistics 386). Proceed to RFI with the caveats below.",
  },
  sections: [
    {
      heading: "Comparison",
      bullets: [
        "Total risk index: Strategic Logistics 386 57, Dynamic Group 434 60, Precision Partners 464 62.",
        "Financial health: 53, 54 and 65; credit rating: 76, 57 and 58 (same order).",
        "Delivery rating is close for all three (85.0% to 86.1%); order confirmation ranges from 75.6% to 95.8%.",
      ],
    },
    {
      heading: "Caveats",
      bullets: [
        "Dynamic Group 434 is Critical on operational resilience (91) and has the highest safety incident score (70).",
        "Price, category and delivery country are not in the dataset; quotes are still missing.",
        "Supplier names are synthetic: link real legal entities before web research.",
      ],
    },
    { heading: "Next steps", body: "Send RFI questions on operational resilience and safety incidents to Dynamic Group 434; keep Strategic Logistics 386 as the fallback." },
  ],
};

/** what_matters for the brake system (weights from the list_profiles mock, descriptions from get_metadata). */
const GUIDANCE = {
  query: "brake_system",
  part: { id: "brake_system", label: "Brake system", group: "running_gear", criticality: "safety" },
  matched_by: "part",
  profile_id: "safety_critical",
  profile_label: "Safety-critical component",
  dimensions: [
    { field: "quality_risk", label: "Quality Risk", description: "Risk of product defects, non-compliance with technical specifications, or quality failures.", family: "operational_quality", weight: 0.25 },
    { field: "compliance_risk", label: "Compliance Risk", description: "Risk of violating legal, regulatory, or industry-specific requirements.", family: "compliance_governance", weight: 0.15 },
    { field: "operational_resilience", label: "Operational Resilience", description: "Ability to maintain operations during disruptions.", family: "supply_chain_structure", weight: 0.15 },
    { field: "safety_incident", label: "Safety Incident", description: "Risk of workplace accidents, safety violations, or hazardous incidents.", family: "operational_quality", weight: 0.15 },
    { field: "delivery_risk", label: "Delivery Risk", description: "100 minus the delivery rating.", family: "supply_chain_structure", weight: 0.1 },
  ],
  filters: [
    { field: "quality_risk_level", op: "ne", value: "Critical" },
    { field: "safety_incident_level", op: "ne", value: "Critical" },
    { field: "delivery_rating", op: "gte", value: 90 },
  ],
  why: "Brake system is safety-critical, so quality, compliance and operational resilience carry 55 % of the weight and a failing score there rules a supplier out.",
};

export const FIXTURE_IDS = {
  filter: "demo_filter_suppliers",
  rank: "demo_rank_with_profile",
  compare: "demo_compare_suppliers",
  explain: "demo_explain_supplier",
  similar: "demo_find_similar",
  suppliers: "demo_get_suppliers",
  sql: "demo_run_sql",
  research: "demo_research_report",
  memo: "demo_shortlist_memo",
  guidance: "demo_what_matters",
} as const;

export const FIXTURES: Record<string, unknown> = {
  [FIXTURE_IDS.filter]: filterSuppliers.data,
  [FIXTURE_IDS.rank]: rankWithProfile.data,
  [FIXTURE_IDS.compare]: compareSuppliers.data,
  [FIXTURE_IDS.explain]: explainSupplier.data,
  [FIXTURE_IDS.similar]: findSimilar.data,
  [FIXTURE_IDS.suppliers]: getSuppliers.data,
  [FIXTURE_IDS.sql]: { ...runSql.data, query: runSql.meta.mock_input.query },
  [FIXTURE_IDS.research]: RESEARCH_REPORT,
  [FIXTURE_IDS.memo]: MEMO,
  [FIXTURE_IDS.guidance]: GUIDANCE,
};

// ------------------------------------------------------------------ review states (/dev/blocks)

/**
 * Every block against three states of its real result shape: many rows (the payload as a skill stores it),
 * one row, and an empty result. The states are cut from the same mocks, so a block that breaks on a short or
 * empty list shows it here.
 */
const one = <T>(xs: readonly T[]) => xs.slice(0, 1);

const compareData = compareSuppliers.data;
const filterData = filterSuppliers.data;
const rankData = rankWithProfile.data;
const similarData = findSimilar.data;
const explainData = explainSupplier.data;

/** compare_suppliers as the skill stores it: the data plus ids, profile and the server verdict (src/skills/verdict.ts wording). */
const COMPARE_WITH_VERDICT = {
  ...compareData,
  ids: compareData.suppliers.map((s) => s.supplier_id),
  profile_id: "default",
  verdict: {
    focus: "overall",
    focus_label: "total risk index",
    method: "Total risk index from the data service, lower is better.",
    ranking: [
      { supplier_id: "SUPP_00731", score: 57 },
      { supplier_id: "SUPP_00012", score: 60 },
      { supplier_id: "SUPP_00450", score: 62 },
    ],
    winner: "SUPP_00731",
    runner_up: "SUPP_00012",
    margin: 3,
    deciding_factor: { field: "operational_resilience", winner_value: 52, runner_up_value: 91, weighted_gap: 3.9 },
    caveats: ["SUPP_00731 is still the worst of the group on labor_stability (65), credit_rating (76)"],
  },
};

/** A run_sql result wide and long enough to need "more columns" and "show all". */
const SQL_COLUMNS = [
  "supplier_id",
  "supplier_name",
  "total_risk_index",
  "total_risk_index_level",
  "financial_health",
  "quality_risk",
  "operational_resilience",
  "delivery_rating",
  "order_confirmation_rate",
  "po_volume_eur",
  "sourcing_risk_level",
] as const;
const SQL_MANY = {
  query: `SELECT ${SQL_COLUMNS.join(", ")} FROM suppliers WHERE total_risk_index < 20 ORDER BY total_risk_index LIMIT 20`,
  columns: [...SQL_COLUMNS],
  rows: filterData.suppliers.map((s) => SQL_COLUMNS.map((c) => (s as Record<string, unknown>)[c] ?? null)),
};

/** shortlist_memo as the skill stores it (markdown assembled by src/skills/shortlist-memo.ts, template narrative). */
const MEMO_MARKDOWN = {
  title: "Award recommendation: passenger doors",
  source: "template",
  recommended_id: "SUPP_00731",
  candidate_ids: ["SUPP_00012", "SUPP_00450", "SUPP_00731"],
  required_approvals: ["Buyer and category manager sign-off (four-eyes principle, award recommendation)"],
  red_flags: [{ supplier_id: "SUPP_00012", field: "operational_resilience", value: 91 }],
  unverified_numbers: [],
  markdown: [
    "# Award recommendation: passenger doors",
    "## Scope\nSourcing passenger doors with the default profile; 3 candidates passed the hard requirements (delivery_rating >= 85).",
    [
      "## Candidates",
      "| Supplier | Name | Total Risk Index | financial | operational_quality | compliance_governance | external_environment | supply_chain_structure | Delivery | PO volume |",
      "|---|---|---|---|---|---|---|---|---|---|",
      "| SUPP_00012 | Dynamic Group 434 | 60 (High) | 55.12 | 59.08 | 58.95 | 46.00 | 85.75 | 85.54% | 0.49 M EUR |",
      "| SUPP_00450 | Precision Partners 464 | 62 (High) | 62.38 | 51.42 | 64.86 | 64.95 | 66.50 | 86.06% | 3.1 M EUR |",
      "| SUPP_00731 | Strategic Logistics 386 | 57 (High) | 61.62 | 61.00 | 52.23 | 56.32 | 56.12 | 85.02% | 5.03 M EUR |",
    ].join("\n"),
    "## Risk by family\n- financial: best SUPP_00012\n- operational_quality: best SUPP_00450\n- compliance_governance: best SUPP_00731\n- external_environment: best SUPP_00012\n- supply_chain_structure: best SUPP_00731",
    "## Deciding factors\n- Overall: SUPP_00731 has the lowest total risk index: SUPP_00731 57.00 < SUPP_00012 60.00 < SUPP_00450 62.00.\n- Deciding factor vs SUPP_00012: operational_resilience 52 vs 91 (lower is better).",
    "## Open red flags\n- SUPP_00012: operational_resilience 91 (Critical)",
    "## Recommendation\nRecommend SUPP_00731 (Strategic Logistics 386): lowest total risk index of the three at 57, decided by operational resilience 52 against 91 for Dynamic Group 434. Its labor stability (65) and credit rating (76) are the weakest of the group, so ask for evidence on both before award. Price and delivery country are not in the dataset; add quotes before the decision.",
    "## Required approvals\n- Buyer and category manager sign-off (four-eyes principle, award recommendation)\n- Supplier risk management sign-off (High or Critical risk on the recommended supplier)\n- Head of procurement approval (high-spend supplier, strategic Kraljic quadrant)",
  ].join("\n\n"),
};

const RESEARCH_ONE = { ...RESEARCH_REPORT, risk_flags: one(RESEARCH_REPORT.risk_flags), sources: [], summary: "One finding so far: a voluntary brake pad recall in 2025, closed after a corrective action plan." };
const RESEARCH_EMPTY = { company: RESEARCH_REPORT.company, summary: null, overall_assessment: null, risk_flags: [], category_assessment: [], sources: [], limitations: null };
const job = (status: string, extra: Record<string, unknown> = {}) => ({
  kind: "research_job",
  job_id: "job_demo0001",
  company_name: "Example Rail Components",
  mode: "replay",
  status,
  progress: [
    { step: "resolve", message: "Looking up the legal entity." },
    { step: "search", message: "Searching news, registers and sanctions lists." },
  ],
  report: null,
  started_at: "2026-10-18T09:00:00Z",
  updated_at: "2026-10-18T09:00:20Z",
  ...extra,
});

export const STATE_FIXTURES: Record<string, unknown> = {
  state_filter_many: filterData,
  state_filter_one: { ...filterData, total_matching: 1, suppliers: one(filterData.suppliers) },
  state_filter_empty: { ...filterData, total_matching: 0, suppliers: [] },
  state_rank_many: rankData,
  state_rank_one: { ...rankData, total_matching: 1, ranking: one(rankData.ranking) },
  state_rank_empty: { ...rankData, total_matching: 0, ranking: [] },
  state_similar_many: similarData,
  state_similar_one: { ...similarData, similar: one(similarData.similar) },
  state_similar_empty: { ...similarData, total_matching: 0, similar: [] },
  state_compare_many: COMPARE_WITH_VERDICT,
  state_compare_one: { suppliers: one(compareData.suppliers), per_field: [], family_scores: one(compareData.family_scores), largest_differences: [] },
  state_compare_empty: { suppliers: [], per_field: [], family_scores: [], largest_differences: [] },
  state_explain_many: explainData,
  state_explain_one: { ...explainData, contributions: one(explainData.contributions), critical_fields: one(explainData.critical_fields) },
  state_explain_empty: { ...explainData, contributions: [], critical_fields: [] },
  state_card_one: { suppliers: one(getSuppliers.data.suppliers) },
  state_card_empty: { suppliers: [] },
  state_sql_many: SQL_MANY,
  state_sql_one: { query: runSql.meta.mock_input.query, columns: runSql.data.columns, rows: one(runSql.data.rows) },
  state_sql_empty: { query: runSql.meta.mock_input.query, columns: runSql.data.columns, rows: [] },
  state_memo_many: MEMO_MARKDOWN,
  state_memo_one: { title: "Award recommendation: brake pads", source: "template", unverified_numbers: ["41"], markdown: "# Award recommendation: brake pads\n\n## Recommendation\nRecommend Dynamic Partners 444: the only candidate that passed the hard requirements, with a total risk index of 6." },
  state_memo_empty: { title: "Memo" },
  state_research_many: RESEARCH_REPORT,
  state_research_one: RESEARCH_ONE,
  state_research_empty: RESEARCH_EMPTY,
  state_research_running: job("running"),
  state_research_choose: job("needs_disambiguation", {
    candidates: [
      { candidate_id: "c1", legal_name: "Example Rail Components GmbH", country: "DE", website: "https://example.com" },
      { candidate_id: "c2", legal_name: "Example Rail Components AG", country: "CH", website: "https://example.org" },
    ],
  }),
  state_research_failed: job("failed", { error: "The research service did not answer. Try again in a minute." }),
  state_guidance_many: GUIDANCE,
  state_guidance_one: { ...GUIDANCE, dimensions: one(GUIDANCE.dimensions), filters: one(GUIDANCE.filters) },
  state_guidance_empty: { ...GUIDANCE, dimensions: [], filters: [] },
  // brakes dataset, RFQ-02 (scripts/gen-brake-fixtures.ts)
  state_offerings_many: brake.offerings,
  state_offerings_one: { ...brake.offerings, total: 1, offerings: one(brake.offerings.offerings) },
  state_offerings_empty: { ...brake.offerings, total: 0, offerings: [] },
  state_rfq_many: brake.rfq,
  state_rfq_one: { ...brake.rfq, offers: brake.rfq.offers.filter((o) => o.supplier_id === "BRK_0046"), dual: null, cheapest_qualified: brake.rfq.award, gate_cost_eur: 0 },
  state_rfq_empty: { ...brake.rfq, offers: [], award: null, dual: null },
};

export type ReviewState = "many" | "one" | "empty";

/** One review entry per block: OpenUI Lang for the three states (same arguments, different handle), plus extra states. */
export interface ReviewEntry {
  block: string;
  label: string;
  states: Record<ReviewState, string>;
  /** State captions when "many / one / empty" does not fit the block (Text, Stack). */
  labels?: Partial<Record<ReviewState, string>>;
  /** Extra states; `job` renders a research job snapshot directly (through the Renderer it would poll and 404). */
  extra?: Array<{ label: string; source?: string; job?: string }>;
}

const states = (make: (handle: string) => string, kind: string): Record<ReviewState, string> => ({
  many: make(`state_${kind}_many`),
  one: make(`state_${kind}_one`),
  empty: make(`state_${kind}_empty`),
});

export const REVIEW: ReviewEntry[] = [
  { block: "Guidance", label: "what_matters", states: states((h) => `root = Guidance("${h}")`, "guidance") },
  { block: "RankedList", label: "filter_suppliers", states: states((h) => `root = RankedList("${h}")`, "filter") },
  { block: "RankedList", label: "rank_with_profile", states: states((h) => `root = RankedList("${h}")`, "rank") },
  { block: "RankedList", label: "find_similar", states: states((h) => `root = RankedList("${h}")`, "similar") },
  { block: "Table", label: "run_sql", states: states((h) => `root = Table("${h}")`, "sql") },
  { block: "OfferingTable", label: "find_offerings (brakes)", states: states((h) => `root = OfferingTable("${h}")`, "offerings") },
  { block: "RfqBoard", label: "qualify_for_rfq (brakes)", states: states((h) => `root = RfqBoard("${h}")`, "rfq") },
  { block: "CompareGrid", label: "compare_suppliers", states: states((h) => `root = CompareGrid("${h}")`, "compare") },
  {
    block: "Verdict",
    label: "compare_suppliers, server verdict",
    states: states((h) => `root = Verdict("${h}")`, "compare"),
    extra: [{ label: "family financial", source: `root = Verdict("state_compare_many", "financial")` }],
  },
  { block: "RadarProfile", label: "compare_suppliers family_scores", states: states((h) => `root = RadarProfile("${h}")`, "compare") },
  { block: "ContributionWaterfall", label: "explain_supplier", states: states((h) => `root = ContributionWaterfall("${h}")`, "explain") },
  {
    block: "SupplierCard",
    label: "explain_supplier, get_suppliers",
    states: { many: `root = SupplierCard("state_explain_many")`, one: `root = SupplierCard("state_card_one")`, empty: `root = SupplierCard("state_card_empty")` },
  },
  { block: "Memo", label: "shortlist_memo", states: states((h) => `root = Memo("${h}")`, "memo"), extra: [{ label: "structured memo", source: `root = Memo("${FIXTURE_IDS.memo}")` }] },
  {
    block: "RiskFlagList",
    label: "research report and job",
    states: states((h) => `root = RiskFlagList("${h}")`, "research"),
    extra: [
      { label: "job running", job: "state_research_running" },
      { label: "job needs a choice", job: "state_research_choose" },
      { label: "job failed", job: "state_research_failed" },
    ],
  },
  { block: "SourceList", label: "research report sources", states: states((h) => `root = SourceList("${h}")`, "research") },
  {
    block: "Text",
    label: "narration",
    labels: { many: "Default", one: "Warning", empty: "Empty content" },
    states: {
      many: `root = Text("All three shortlisted suppliers are **High** on the total risk index, so none is low-risk. Dynamic Group 434 is lowest on financial risk.")`,
      one: `root = Text("Price is not in the dataset, so this compares risk only.", "warning")`,
      empty: `root = Text("")`,
    },
  },
  {
    block: "Stack",
    label: "layout, named arguments normalized",
    labels: { many: "Several blocks", one: "One block", empty: "No blocks" },
    states: {
      many: `root = Stack([intro, grid, verdict])
intro = Text("Three shortlisted suppliers, compared under the **default** profile.")
grid = CompareGrid(resultId="state_compare_many", fields=["total_risk_index", "financial_health", "credit_rating"])
verdict = Verdict(resultId="state_compare_many")`,
      one: `root = Stack([RankedList("state_filter_one")])`,
      empty: `root = Stack([])`,
    },
    extra: [{ label: "expired handle", source: `root = RankedList("filter_expired00")` }],
  },
];
