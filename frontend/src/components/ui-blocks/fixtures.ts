import compareSuppliers from "@/lib/data-api/mocks/compare_suppliers.json";
import explainSupplier from "@/lib/data-api/mocks/explain_supplier.json";
import filterSuppliers from "@/lib/data-api/mocks/filter_suppliers.json";
import findSimilar from "@/lib/data-api/mocks/find_similar.json";
import getSuppliers from "@/lib/data-api/mocks/get_suppliers.json";
import rankWithProfile from "@/lib/data-api/mocks/rank_with_profile.json";
import runSql from "@/lib/data-api/mocks/run_sql.json";
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
};

/** One gallery entry per block: the OpenUI Lang a skill would emit, rendered against a fixture. */
export const GALLERY: Array<{ block: string; source: string; note: string }> = [
  { block: "RankedList", source: `root = RankedList("${FIXTURE_IDS.filter}")`, note: "filter_suppliers mock: 5,904 matching, 20 shown" },
  { block: "RankedList", source: `root = RankedList("${FIXTURE_IDS.rank}", null, 6)`, note: "rank_with_profile mock (safety_critical), rank change vs default" },
  { block: "RankedList", source: `root = RankedList("${FIXTURE_IDS.similar}")`, note: "find_similar mock (SUPP_00450, lower geopolitical + environmental)" },
  { block: "CompareGrid", source: `root = CompareGrid("${FIXTURE_IDS.compare}")`, note: "compare_suppliers mock (3 suppliers)" },
  { block: "Verdict", source: `root = Verdict("${FIXTURE_IDS.compare}", "financial")`, note: "derived from per_field + family_scores" },
  { block: "Verdict", source: `root = Verdict("${FIXTURE_IDS.compare}", "overall")`, note: "same result, decided on total_risk_index" },
  { block: "RadarProfile", source: `root = RadarProfile("${FIXTURE_IDS.compare}")`, note: "family_scores" },
  { block: "ContributionWaterfall", source: `root = ContributionWaterfall("${FIXTURE_IDS.explain}")`, note: "explain_supplier mock (SUPP_00018)" },
  { block: "SupplierCard", source: `root = SupplierCard("${FIXTURE_IDS.explain}")`, note: "explain_supplier mock" },
  { block: "SupplierCard", source: `root = SupplierCard("${FIXTURE_IDS.suppliers}", "SUPP_00450")`, note: "get_suppliers mock, picked by id" },
  { block: "Table", source: `root = Table("${FIXTURE_IDS.sql}", "Suppliers per risk level")`, note: "run_sql mock" },
  { block: "RiskFlagList", source: `root = RiskFlagList("${FIXTURE_IDS.research}")`, note: "placeholder research report (fictional company)" },
  { block: "SourceList", source: `root = SourceList("${FIXTURE_IDS.research}")`, note: "sources of the same report" },
  { block: "Memo", source: `root = Memo("${FIXTURE_IDS.memo}")`, note: "memo fixture (numbers from the compare mock)" },
  {
    block: "Stack",
    source: `root = Stack([intro, grid, verdict])
intro = Text("Three shortlisted suppliers, compared under the **default** profile.")
grid = CompareGrid(resultId="${FIXTURE_IDS.compare}", fields=["total_risk_index", "financial_health", "credit_rating"])
verdict = Verdict(resultId="${FIXTURE_IDS.compare}")`,
    note: "Stack + Text; named arguments are normalized to positional",
  },
  { block: "Text", source: `root = Text("Price is not in the dataset, so this compares risk only.", "warning")`, note: "warning tone" },
  { block: "Error state", source: `root = RankedList("filter_expired00")`, note: "unknown handle: 404 from /api/results" },
];
