import { z } from "zod/v4";
import type { Dataset } from "@/lib/data-api/datasets";
import { defineSkill, type SkillContext } from "./types";
import { dataOrThrow, fmt } from "./shared";

interface SqlResult {
  query: string;
  columns: string[];
  rows: unknown[][];
  handle: string;
}

const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|attach|copy|pragma|install|load|export|grant|truncate)\b/i;

async function runQuery(raw: string, ctx: SkillContext, dataset?: Dataset): Promise<SqlResult> {
  const query = raw.trim().replace(/;+\s*$/, "");
  if (!/^(select|with)\b/i.test(query) || query.includes(";") || FORBIDDEN.test(query)) {
    throw new Error("run_sql only accepts one read-only SELECT statement");
  }
  const data = await dataOrThrow<{ columns: string[]; rows: unknown[][] }>("run_sql", { query }, dataset);
  const result = { query, ...data };
  return { ...result, handle: ctx.putResult(result) };
}

const summarize = (r: SqlResult) => {
  const show = r.rows.slice(0, 5).map((row) => r.columns.map((c, i) => `${c}=${fmt(row[i], 2)}`).join(", "));
  return `Query returned ${r.rows.length} row(s) [${r.columns.join(", ")}]: ${show.join(" | ") || "no rows"}${r.rows.length > 5 ? " | ..." : ""}.`;
};

export const runSql = defineSkill({
  name: "run_sql",
  description:
    "Runs one read-only SQL SELECT on table `suppliers` (one row per supplier, snake_case columns as in the field list, levels as *_level text columns, max 200 rows). " +
    "Use for counts, averages, distributions, group-bys, shares and other aggregate questions ('how many', 'average', 'per level', 'what share'), " +
    "or any data question no other skill covers. Do not use to list or show which suppliers meet conditions (filter_suppliers), " +
    "or when compare_suppliers, explain_supplier or rank_with_profile fits. Renders a table.",
  priority: "core",
  stage: "any",
  input: z.object({
    query: z.string().min(10).describe("One SELECT statement on table suppliers, e.g. SELECT COUNT(*) AS n FROM suppliers WHERE ..."),
  }),
  run: async (input, ctx): Promise<SqlResult> => runQuery(input.query, ctx),
  summarize,
  view: (_r, handle) => `root = Table("${handle}")`,
  examples: [
    "How many suppliers have a Critical compliance score and volume above 10 M EUR?",
    "What is the average delivery rating per sourcing risk level?",
    "How many suppliers are in each Total Risk level?",
  ],
  workedExamples: [
    {
      question: "How many suppliers have a Critical compliance score and volume above 10 M EUR?",
      input: { query: "SELECT COUNT(*) AS n FROM suppliers WHERE compliance_risk_level = 'Critical' AND po_volume_eur > 10000000" },
    },
  ],
});

/** run_sql on the brakes dataset: the three service views; live only (NOT_AVAILABLE without the data service). */
export const runSqlBrakes = defineSkill({
  name: "run_sql",
  description:
    "Last resort for brake aggregates no other skill answers (group-bys, sums across offerings): one read-only SELECT on the live data service views " +
    "supplier_offerings (offering_id, supplier_id, product_type, application, material, copper_free, unit_price_eur, moq_units, lead_time_days, annual_capacity_units), " +
    "supplier_profiles (supplier_id, country, region, supplier_status, certifications text[]) and suppliers (risk scores, levels, delivery_rating, po_volume_eur); " +
    "join on supplier_id and keep to brake suppliers (supplier_id LIKE 'BRK_%'), max 200 rows. Needs the live service; if it answers not available, say so. " +
    "Prefer find_offerings, qualify_for_rfq, filter_suppliers and explain_supplier. Renders a table.",
  priority: "core",
  stage: "any",
  input: z.object({
    query: z.string().min(10).describe("One SELECT on supplier_offerings / supplier_profiles / suppliers, joined on supplier_id"),
  }),
  run: async (input, ctx): Promise<SqlResult> => runQuery(input.query, ctx, "brakes"),
  summarize,
  view: (_r, handle) => `root = Table("${handle}")`,
  examples: ["Average unit price per application across brake offerings"],
  workedExamples: [],
});
