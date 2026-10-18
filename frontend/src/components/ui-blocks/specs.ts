import { z } from "zod/v4";

/**
 * Prop schemas and model-facing descriptions of every block, kept free of React so the
 * chat route (React Server layer) can build the prompt and parse OpenUI Lang.
 * src/lib/openui/library.tsx joins each spec with its renderer from the block file.
 * Positional order in OpenUI Lang = key order of the props object.
 */
export const FAMILY_ENUM = ["financial", "operational_quality", "compliance_governance", "external_environment", "supply_chain_structure"] as const;

export const specs = {
  Text: {
    name: "Text",
    description:
      "Short narration in light Markdown (bold, lists, links): one or two sentences that frame the blocks. " +
      'Only cite numbers that appeared in a tool summary; use tone "warning" for missing data (price, country, category).',
    props: z.object({
      content: z.string().describe("Markdown text"),
      tone: z.enum(["default", "muted", "warning"]).optional().describe("Visual tone"),
    }),
  },
  RankedList: {
    name: "RankedList",
    description:
      "Ranked supplier list with an inline total-risk bar, level chip and a pin-to-shortlist button per row. " +
      "Use for filter_suppliers, rank_with_profile (shows profile score and rank change) and find_similar results.",
    props: z.object({
      resultId: z.string().describe("Handle of a filter_suppliers, rank_with_profile or find_similar result"),
      title: z.string().optional().describe("Optional heading; defaults to the match count or profile"),
      limit: z.number().optional().describe("Rows shown before 'Show all' (default 10)"),
    }),
  },
  CompareGrid: {
    name: "CompareGrid",
    description:
      "Side-by-side comparison of up to 20 suppliers: suppliers as columns, risk dimensions as rows, cells colored by level, " +
      "best and worst marked per dimension. Use for compare_suppliers results.",
    props: z.object({
      resultId: z.string().describe("Handle of a compare_suppliers result"),
      title: z.string().optional().describe("Optional heading"),
      fields: z.array(z.string()).optional().describe('Optional subset of dimension field names to show, e.g. ["financial_health", "credit_rating"]'),
    }),
  },
  Verdict: {
    name: "Verdict",
    description:
      "Decision block for a comparison: the winner for one risk family, the deciding factor and caveats, derived from a compare_suppliers result. " +
      "Pair it with CompareGrid when the buyer asks which supplier is best.",
    props: z.object({
      resultId: z.string().describe("Handle of a compare_suppliers result"),
      family: z
        .enum([...FAMILY_ENUM, "overall"])
        .optional()
        .describe(
          "Omit to show the verdict compare_suppliers computed for the buyer's focus. Give a family to decide on that family instead ('financial' = financial_health + credit_rating, 'overall' = total_risk_index)",
        ),
    }),
  },
  ContributionWaterfall: {
    name: "ContributionWaterfall",
    description:
      "Waterfall explaining one supplier's total risk index: each field's weighted contribution versus the dataset mean, sorted, red up and green down. " +
      "Use for explain_supplier results (why is this score high).",
    props: z.object({
      resultId: z.string().describe("Handle of an explain_supplier result"),
      limit: z.number().optional().describe("Number of largest contributions shown before grouping the rest (default 8)"),
    }),
  },
  RadarProfile: {
    name: "RadarProfile",
    description:
      "Radar chart of the five risk-family scores (financial, operational quality, compliance and governance, external environment, supply chain structure) " +
      "for one or more suppliers. Use for compare_suppliers results to show profile shape.",
    props: z.object({
      resultId: z.string().describe("Handle of a compare_suppliers result (uses family_scores)"),
      supplierIds: z.array(z.string()).optional().describe("Optional subset of supplier ids to plot (max 6)"),
      title: z.string().optional().describe("Optional heading"),
    }),
  },
  SupplierCard: {
    name: "SupplierCard",
    description:
      "Compact card for one supplier: total risk index with level and percentile, top risk drivers, Critical fields, delivery and volume facts, " +
      "pin, explain, alternatives and research actions. Use for explain_supplier or get_suppliers results.",
    props: z.object({
      resultId: z.string().describe("Handle of an explain_supplier, get_suppliers or compare_suppliers result"),
      supplierId: z.string().optional().describe("Which supplier to show when the result holds several"),
    }),
  },
  Memo: {
    name: "Memo",
    description:
      "Shortlist or award justification memo rendered as a document with sections, a recommendation box and an export-to-Markdown button. Use for shortlist_memo results.",
    props: z.object({
      resultId: z.string().describe("Handle of a shortlist_memo result"),
    }),
  },
  RiskFlagList: {
    name: "RiskFlagList",
    description:
      "Web research findings for a real company: overall assessment, risk flags with severity chips, dates and source links, and the qualitative category assessment. " +
      "Use for research_company report results.",
    props: z.object({
      resultId: z.string().describe("Handle of a research report result"),
      minSeverity: z.enum(["low", "moderate", "elevated", "high"]).optional().describe("Hide flags below this severity"),
    }),
  },
  SourceList: {
    name: "SourceList",
    description: "Numbered list of web sources (title, publisher, access date, link) behind a research report or memo.",
    props: z.object({
      resultId: z.string().describe("Handle of a research report or memo result"),
      title: z.string().optional().describe("Optional heading"),
    }),
  },
  Table: {
    name: "Table",
    description: "Generic sortable table of columns and rows. Use for run_sql results and any tabular answer no other block fits.",
    props: z.object({
      resultId: z.string().describe("Handle of a run_sql result (columns + rows) or any result holding a list of records"),
      title: z.string().optional().describe("Optional heading"),
      maxRows: z.number().optional().describe("Rows shown before 'Show all' (default 25)"),
    }),
  },
} as const;

export const STACK_DESCRIPTION =
  "Layout root: renders its children top to bottom. Use it whenever the answer has more than one block; put a short Text first when narration helps.";

export type BlockName = keyof typeof specs;
export type BlockProps<N extends BlockName> = z.infer<(typeof specs)[N]["props"]>;
