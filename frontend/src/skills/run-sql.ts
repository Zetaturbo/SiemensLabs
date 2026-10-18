import { z } from "zod/v4";
import { defineSkill } from "./types";
import { dataOrThrow, fmt } from "./shared";

interface SqlResult {
  query: string;
  columns: string[];
  rows: unknown[][];
  handle: string;
}

const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|attach|copy|pragma|install|load|export|grant|truncate)\b/i;

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
  run: async (input, ctx): Promise<SqlResult> => {
    const query = input.query.trim().replace(/;+\s*$/, "");
    if (!/^(select|with)\b/i.test(query) || query.includes(";") || FORBIDDEN.test(query)) {
      throw new Error("run_sql only accepts one read-only SELECT statement");
    }
    const data = await dataOrThrow<{ columns: string[]; rows: unknown[][] }>("run_sql", { query });
    const result = { query, ...data };
    return { ...result, handle: ctx.putResult(result) };
  },
  summarize: (r) => {
    const show = r.rows.slice(0, 5).map((row) => r.columns.map((c, i) => `${c}=${fmt(row[i], 2)}`).join(", "));
    return `Query returned ${r.rows.length} row(s) [${r.columns.join(", ")}]: ${show.join(" | ") || "no rows"}${r.rows.length > 5 ? " | ..." : ""}.`;
  },
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
