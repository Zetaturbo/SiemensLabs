import { z } from "zod/v4";
import { defineSkill } from "./types";
import { FAMILIES, PROFILE_IDS, RISK_SCORES, dataOrThrow, fmt, normalizeIds, supplierIdSchema } from "./shared";
import { computeVerdict, type Verdict } from "./verdict";
import { familyMembers, getMetadata, weightOf } from "@/lib/prompt/metadata";

const FOCUS = ["overall", ...FAMILIES, ...RISK_SCORES, "delivery_rating", "order_confirmation_rate", "order_change_rate"] as const;

interface CompareData {
  suppliers: Array<Record<string, unknown>>;
  per_field: Array<{ field: string; best: string | null; worst: string | null; spread: number; direction?: string }>;
  family_scores: Array<Record<string, unknown> & { supplier_id: string }>;
  largest_differences: string[];
}

interface CompareResult extends CompareData {
  ids: string[];
  profile_id: string;
  verdict: Verdict;
  handle: string;
}

export const compareSuppliers = defineSkill({
  name: "compare_suppliers",
  description:
    "Compares 2 to 20 named suppliers side by side and decides which is best on a focus (overall, a risk family such as financial, or one field), " +
    "naming the deciding factor and trade-offs. Use when the buyer names supplier ids or says 'these', 'my shortlist', 'which of them'. " +
    "'Financial risk' = focus financial (financial_health + credit_rating). With no ids, the workflow shortlist is used. " +
    "Do not use to search the whole dataset (filter_suppliers) or to explain why one supplier scores high (explain_supplier). " +
    "Renders a verdict with a comparison grid and radar.",
  priority: "core",
  stage: "shortlist",
  input: z.object({
    ids: z.array(supplierIdSchema).max(20).default([]).describe("Supplier ids to compare; empty = workflow shortlist"),
    focus: z.enum(FOCUS).default("overall").describe("What 'best' means: overall, a risk family (financial = financial risk), or one field"),
    profile_id: z.enum(PROFILE_IDS).optional().describe("Weight profile for focus overall; default = workflow profile"),
  }),
  run: async (input, ctx): Promise<CompareResult> => {
    const ids = normalizeIds(input.ids.length ? input.ids : ctx.workflow.shortlist);
    if (ids.length < 2) throw new Error("compare_suppliers needs at least 2 supplier ids (none given and the shortlist has fewer than 2)");
    const profile_id = input.profile_id ?? ctx.workflow.profile_id ?? "default";
    const [data, meta] = await Promise.all([dataOrThrow<CompareData>("compare_suppliers", { ids, fields: null, profile_id }), getMetadata()]);

    let fields: Array<{ field: string; weight: number }>;
    let scores: Record<string, number> | undefined;
    let focusLabel: string = input.focus;
    if (input.focus === "overall") {
      const profiles =
        profile_id === "default" ? null : await dataOrThrow<{ profiles: Array<{ profile_id: string; weights: Record<string, number> }> }>("list_profiles", {});
      const weights = profiles?.profiles.find((p) => p.profile_id === profile_id)?.weights;
      fields = weights
        ? Object.entries(weights).filter(([f]) => RISK_SCORES.includes(f as never)).map(([field, weight]) => ({ field, weight }))
        : RISK_SCORES.map((field) => ({ field, weight: weightOf(meta, field) }));
      const key = data.suppliers.every((s) => typeof s.profile_score === "number") ? "profile_score" : "total_risk_index";
      scores = Object.fromEntries(data.suppliers.map((s) => [String(s.supplier_id), Number(s[key])]));
      focusLabel =
        key === "total_risk_index"
          ? "overall risk (Total Risk Index)"
          : profile_id === "default"
            ? "overall risk (default profile score = unrounded Total Risk Index)"
            : `overall risk (${profile_id} profile score)`;
    } else if ((FAMILIES as readonly string[]).includes(input.focus)) {
      fields = familyMembers(meta, input.focus);
      const fam = data.family_scores.filter((f) => typeof f[input.focus] === "number");
      if (fam.length === data.suppliers.length) scores = Object.fromEntries(fam.map((f) => [f.supplier_id, Number(f[input.focus])]));
      focusLabel = input.focus === "financial" ? "financial risk (financial_health + credit_rating)" : `${input.focus} risk family`;
    } else {
      fields = [{ field: input.focus, weight: 1 }];
    }
    const verdict = computeVerdict({ suppliers: data.suppliers, fields, scores, focus: input.focus, focusLabel });
    // ids actually compared (the data service may reject or reorder; mocks return a fixed trio)
    const result = { ...data, ids: data.suppliers.map((s) => String(s.supplier_id)), profile_id, verdict };
    return { ...result, handle: ctx.putResult(result) };
  },
  summarize: (r) => {
    const v = r.verdict;
    const rank = v.ranking.map((x) => `${x.supplier_id} ${fmt(x.score, 2)}`).join(" < ");
    const d = v.deciding_factor;
    const deciding = d
      ? `Deciding factor vs ${v.runner_up}: ${d.field} (${fmt(d.winner_value)} vs ${fmt(d.runner_up_value)}).`
      : "No single deciding factor.";
    const caveats = v.caveats.length ? ` Trade-offs: ${v.caveats.join("; ")}.` : "";
    return `Compared ${r.ids.length} suppliers on ${v.focus_label}. Best: ${v.winner} (lower is better: ${rank}). ${deciding}${caveats} Largest spreads overall: ${r.largest_differences.join(", ")}.`;
  },
  view: (r, handle) => (r.ids.length <= 3 ? `root = Verdict("${handle}")` : `root = CompareGrid("${handle}")`),
  examples: [
    "Which of SUPP_00012, SUPP_00450 and SUPP_00731 has the lowest financial risk?",
    "Compare my shortlist",
    "Which of these has the best quality score?",
  ],
  workedExamples: [
    {
      question: "Which of SUPP_00012, SUPP_00450 and SUPP_00731 has the lowest financial risk?",
      input: { ids: ["SUPP_00012", "SUPP_00450", "SUPP_00731"], focus: "financial" },
    },
    { question: "Which of my shortlisted suppliers is safest overall?", input: { ids: [], focus: "overall" } },
  ],
});
