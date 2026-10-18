import { z } from "zod/v4";
import { defineSkill } from "./types";
import { PROFILE_IDS, conditionSchema, dataOrThrow, fmt, normalizeIds, supplierIdSchema, type Condition } from "./shared";

interface RankRow {
  rank: number;
  supplier_id: string;
  supplier_name?: string;
  profile_score: number;
  total_risk_index: number;
  default_rank: number;
  rank_change: number;
  top_contributors: Array<{ field: string; value: number; contribution: number }>;
}

interface RankResult {
  profile_id: string;
  weights?: Record<string, number>;
  total_matching?: number;
  ranking: RankRow[];
  scope: "ids" | "conditions";
  handle: string;
}

export const rankWithProfile = defineSkill({
  name: "rank_with_profile",
  description:
    "Re-ranks suppliers with a sourcing weight profile (safety_critical, strategic_system, commodity, lksg_due_diligence, default) or custom weights, " +
    "and shows how ranks move versus the default Total Risk Index. Use when the buyer describes the part's criticality ('safety-critical brake part', " +
    "'commodity', 'LkSG due diligence'), asks to weight some risks higher, or asks to rank the shortlist or the remaining suppliers. " +
    "Without ids or conditions it ranks the suppliers that pass the workflow's hard requirements. " +
    "Do not use for plain threshold filters (filter_suppliers) or to pick a winner among named suppliers (compare_suppliers). Renders a ranked list.",
  priority: "core",
  stage: "shortlist",
  input: z.object({
    profile_id: z.enum(PROFILE_IDS).describe("safety_critical: brakes, bogies, doors, signalling; strategic_system: high-value systems; commodity: standard parts; lksg_due_diligence: supply-chain law focus"),
    ids: z.array(supplierIdSchema).max(100).optional().describe("Rank only these suppliers, e.g. the shortlist"),
    conditions: z.array(conditionSchema).optional().describe("Rank suppliers matching these conditions"),
    custom_weights: z.record(z.string(), z.number()).optional().describe("Field -> weight overrides, only when the buyer gives explicit weights"),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  run: async (input, ctx): Promise<RankResult> => {
    const ids = input.ids?.length ? normalizeIds(input.ids) : null;
    const conditions: Condition[] | null = ids ? null : input.conditions?.length ? input.conditions : (ctx.workflow.hard_requirements as Condition[]);
    const data = await dataOrThrow<Omit<RankResult, "handle" | "scope">>("rank_with_profile", {
      ids,
      conditions,
      profile_id: input.profile_id,
      custom_weights: input.custom_weights ?? null,
      limit: input.limit,
    });
    const result = { ...data, scope: ids ? ("ids" as const) : ("conditions" as const) };
    return { ...result, handle: ctx.putResult(result) };
  },
  summarize: (r) => {
    const top = r.ranking
      .slice(0, 3)
      .map((x) => `#${x.rank} ${x.supplier_id} (profile score ${fmt(x.profile_score, 2)}, TRI ${x.total_risk_index}, default rank ${x.default_rank})`)
      .join("; ");
    const movers = [...r.ranking]
      .sort((a, b) => Math.abs(b.rank_change) - Math.abs(a.rank_change))
      .filter((x) => x.rank_change !== 0)
      .slice(0, 2)
      .map((x) => `${x.supplier_id} ${x.rank_change > 0 ? "up" : "down"} ${Math.abs(x.rank_change)}`)
      .join(", ");
    const pool = r.total_matching != null ? ` out of ${r.total_matching}` : "";
    return `Ranked ${r.ranking.length}${pool} suppliers with profile ${r.profile_id} (lower score is better). ${top}. Biggest moves vs default: ${movers || "none"}.`;
  },
  view: (_r, handle) => `root = RankedList("${handle}")`,
  uiActions: (r, _input, workflow) => (r.profile_id !== workflow.profile_id ? [{ type: "set_profile", profile_id: r.profile_id }] : []),
  examples: [
    "This is a safety-critical brake part, weight quality and safety higher",
    "Rank my shortlist for LkSG due diligence",
    "Treat this as a commodity part and re-rank",
  ],
  workedExamples: [
    { question: "This is a safety-critical brake part, weight quality and safety higher", input: { profile_id: "safety_critical" } },
    {
      question: "Rank SUPP_00012, SUPP_00450 and SUPP_00731 with the strategic system profile",
      input: { profile_id: "strategic_system", ids: ["SUPP_00012", "SUPP_00450", "SUPP_00731"] },
    },
  ],
});
