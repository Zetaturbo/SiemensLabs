import { z } from "zod/v4";
import { defineSkill, type WorkflowContext } from "./types";
import { FAMILIES, RISK_SCORES, conditionText, dataOrThrow, datasetOf, fmt, fmtEur, normalizeIds, normalizeSupplierId, supplierIdSchema } from "./shared";
import { computeVerdict, type Verdict } from "./verdict";
import { familyMembers, getMetadata, weightOf } from "@/lib/prompt/metadata";
import { writeProse } from "@/lib/llm/prose";
import { seedCases } from "@/lib/cases/seed";

type Row = Record<string, unknown> & { supplier_id: string };

interface MemoFacts {
  scope: Record<string, unknown>;
  candidates: Array<Record<string, unknown>>;
  overall: Verdict;
  financial: Verdict;
  family_winners: Record<string, string | null>;
  red_flags: Array<{ supplier_id: string; field: string; value: number }>;
  recommended: { supplier_id: string; reason: string; top_drivers: string[] };
  missing_data: string[];
  required_approvals: string[];
  /** The recorded award decision and buyer notes of the case, when present. */
  decision: { supplier: string; rationale: string; at: string } | null;
  buyer_notes: string[];
}

interface MemoResult {
  title: string;
  markdown: string;
  source: "llm" | "template";
  recommended_id: string;
  candidate_ids: string[];
  required_approvals: string[];
  red_flags: MemoFacts["red_flags"];
  unverified_numbers: string[];
  facts: MemoFacts;
  handle: string;
}

const P75_SPEND = 1_953_091;

function approvals(rec: Row, facts: Pick<MemoFacts, "red_flags">, wf: WorkflowContext, familyScores: Record<string, unknown> | undefined): string[] {
  const out = ["Buyer and category manager sign-off (four-eyes principle, award recommendation)"];
  const tri = Number(rec.total_risk_index);
  if (tri >= 50 || facts.red_flags.some((f) => f.supplier_id === rec.supplier_id)) out.push("Supplier risk management sign-off (High or Critical risk on the recommended supplier)");
  if (wf.profile_id === "safety_critical") out.push("Quality and safety engineering approval (safety-critical part: IRIS / ISO 22163 evidence, first article inspection)");
  if (wf.profile_id === "lksg_due_diligence" || Number(familyScores?.compliance_governance ?? 0) >= 50) out.push("Compliance review (LkSG due diligence, documented risk analysis)");
  if (Number(rec.po_volume_eur) >= P75_SPEND) out.push("Head of procurement approval (high-spend supplier, strategic Kraljic quadrant)");
  return out;
}

/**
 * The memo is assembled from deterministic sections (candidates table, risk by family, deciding factors,
 * red flags, approvals: exact numbers and directions) and two narrative sections the LLM writes from a
 * short fact sheet (scope and recommendation). Deciding factors stay deterministic because the model
 * tended to flip directions ("better" vs "worse") when it phrased them.
 */
const NARRATIVE = ["Scope", "Recommendation"] as const;
type Narrative = Record<(typeof NARRATIVE)[number], string>;

const MEMO_INSTRUCTIONS = `You write the narrative parts of an award recommendation memo (Vergabeempfehlung) for rail procurement at Siemens Mobility.
English, concise, factual, for a category manager who must sign it. Use ONLY the fact sheet. Every number you write must appear in the fact sheet exactly as written; do not add, average or derive numbers, and never invent prices, countries, certifications or company facts.
Scores run 0 to 100, higher = more risk. Financial risk is the financial family score given in the fact sheet (financial_health and credit_rating weighted together); quote that score, never a sum.
Output exactly two Markdown sections with these level-2 headings and nothing else:
## Scope
(2 sentences: what is sourced, profile, hard requirements, how many candidates)
## Recommendation
(3 to 4 sentences: the recommended supplier and why it leads (quote the deciding factor with its two values), the open red flags to resolve before award, and the missing data the buyer must still provide)
If the fact sheet records a decision, the Recommendation says the case was awarded to that supplier on that date and restates its rationale.`;

function decidingFactors(f: MemoFacts): string {
  const d = f.overall.deciding_factor;
  const fd = f.financial.deciding_factor;
  return [
    `- Overall: ${f.overall.winner} has the lowest ${f.overall.focus_label}: ${f.overall.ranking.map((r) => `${r.supplier_id} ${fmt(r.score, 2)}`).join(" < ")}.`,
    d ? `- Deciding factor vs ${f.overall.runner_up}: ${d.field} ${d.winner_value} vs ${d.runner_up_value} (lower is better).` : "- No single deciding factor.",
    `- Financial risk (financial_health + credit_rating, family score): ${f.financial.ranking.map((r) => `${r.supplier_id} ${fmt(r.score, 2)}`).join(" < ")}${fd ? `; decided by ${fd.field} ${fd.winner_value} vs ${fd.runner_up_value}` : ""}.`,
    ...f.financial.caveats.map((c) => `- Trade-off: ${c}.`),
  ].join("\n");
}

function factSheet(f: MemoFacts): string {
  const d = f.overall.deciding_factor;
  const fd = f.financial.deciding_factor;
  return [
    `Part / case: ${f.scope.part_id ?? "n/a"} / ${f.scope.case_id ?? "n/a"}; category: ${f.scope.category ?? "not given"}; profile: ${f.scope.profile_id}.`,
    `Hard requirements: ${(f.scope.hard_requirements as string[]).join(" AND ") || "none"}. Candidates: ${f.candidates.map((c) => `${c.supplier_id} (TRI ${c.total_risk_index}, ${c.total_risk_level}; financial_health ${c.financial_health}, credit_rating ${c.credit_rating})`).join(", ")}.`,
    `Overall (${f.overall.focus_label}, lower is better): ${f.overall.ranking.map((r) => `${r.supplier_id} ${r.score}`).join(" < ")}.`,
    d ? `Deciding factor vs ${f.overall.runner_up}: ${d.field} ${d.winner_value} vs ${d.runner_up_value}.` : "No single deciding factor.",
    `Financial risk (financial family score, lower is better): ${f.financial.ranking.map((r) => `${r.supplier_id} ${r.score}`).join(" < ")}${fd ? `; deciding factor ${fd.field} ${fd.winner_value} vs ${fd.runner_up_value} for ${f.financial.runner_up}` : ""}.`,
    ...f.financial.caveats.map((c) => `Trade-off: ${c}.`),
    `Best per family: ${Object.entries(f.family_winners).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
    `Recommended: ${f.recommended.supplier_id} (${f.recommended.reason}).${f.recommended.top_drivers.length ? ` Its top risk drivers: ${f.recommended.top_drivers.join(", ")}.` : ""}`,
    `Open red flags (Critical scores): ${f.red_flags.map((r) => `${r.supplier_id} ${r.field} ${r.value}`).join(", ") || "none"}.`,
    `Missing data: ${f.missing_data.join("; ")}.`,
    ...(f.decision ? [`Decision recorded: awarded to ${f.decision.supplier} on ${f.decision.at.slice(0, 10)}. Rationale: ${f.decision.rationale}`] : []),
    ...(f.buyer_notes.length ? [`Buyer notes: ${f.buyer_notes.join("; ")}.`] : []),
  ].join("\n");
}

function templateNarrative(f: MemoFacts): Narrative {
  return {
    Scope: `Sourcing ${f.scope.part_id ?? f.scope.category ?? "the part"} with the ${f.scope.profile_id} profile; ${f.candidates.length} candidates passed the hard requirements (${(f.scope.hard_requirements as string[]).join(" AND ") || "none"}).`,
    Recommendation: `Recommend ${f.recommended.supplier_id}: ${f.recommended.reason}. Resolve the open red flags above before award. Missing data: ${f.missing_data.join("; ")}.`,
  };
}

/** Pulls the narrative sections out of the LLM text; null when any is missing. */
function parseNarrative(text: string): Narrative | null {
  const out: Partial<Narrative> = {};
  for (const [i, h] of NARRATIVE.entries()) {
    const next = NARRATIVE[i + 1];
    const m = text.match(new RegExp(`##\\s*${h}\\s*\\n([\\s\\S]*?)${next ? `(?=##\\s*${next})` : "$"}`, "i"));
    if (!m || !m[1].trim()) return null;
    out[h] = m[1].trim();
  }
  return out as Narrative;
}

function assembleMemo(title: string, f: MemoFacts, n: Narrative): string {
  const famScore = (c: Record<string, unknown>, fam: string) => fmt((c.family_scores as Record<string, unknown> | null)?.[fam], 2);
  const rows = f.candidates.map(
    (c) => `| ${c.supplier_id} | ${c.supplier_name ?? ""} | ${c.total_risk_index} (${c.total_risk_level}) | ${FAMILIES.map((fam) => famScore(c, fam)).join(" | ")} | ${fmt(c.delivery_rating, 2)}% | ${c.po_volume} |`,
  );
  const flags = f.red_flags.length ? f.red_flags.map((r) => `- ${r.supplier_id}: ${r.field} ${r.value} (Critical)`).join("\n") : "- None: no Critical scores among the candidates.";
  return [
    `# ${title}`,
    `## Scope\n${n.Scope}`,
    `## Candidates\n| Supplier | Name | Total Risk Index | ${FAMILIES.join(" | ")} | Delivery | PO volume |\n|${"---|".repeat(5 + FAMILIES.length)}\n${rows.join("\n")}`,
    `## Risk by family\n${FAMILIES.map((fam) => `- ${fam}: best ${f.family_winners[fam] ?? "n/a"}`).join("\n")}`,
    `## Deciding factors\n${decidingFactors(f)}`,
    `## Open red flags\n${flags}`,
    `## Recommendation\n${n.Recommendation}`,
    ...(f.decision ? [`## Decision\nAwarded to ${f.decision.supplier} on ${f.decision.at.slice(0, 10)}. ${f.decision.rationale}`] : []),
    ...(f.buyer_notes.length ? [`## Buyer notes\n${f.buyer_notes.map((x) => `- ${x}`).join("\n")}`] : []),
    `## Required approvals\n${f.required_approvals.map((a) => `- ${a}`).join("\n")}`,
  ].join("\n\n");
}

/** Numbers in the LLM's prose that do not occur in the fact sheet (a cheap hallucination check). */
function unverifiedNumbers(prose: string, sheet: string): string[] {
  const nums = prose.replace(/SUPP_\d{5}|BRK_\d{4}/g, "").match(/\d+(?:\.\d+)?/g) ?? [];
  return [...new Set(nums.filter((n) => Number(n) > 9 && !sheet.includes(n)))].slice(0, 20);
}

export const shortlistMemo = defineSkill({
  name: "shortlist_memo",
  description:
    "Drafts the award recommendation memo for the shortlist: scope, candidates, risk per family with numbers, deciding factors, open red flags, " +
    "recommendation and required approvals. Use when the buyer asks to write, draft or generate a memo, justification, award recommendation, " +
    "Vergabeempfehlung or decision summary. Uses the workflow shortlist unless ids are given. " +
    "Do not use to just compare (compare_suppliers) or to explain one supplier (explain_supplier). Renders an editable memo.",
  priority: "core",
  stage: "finalists",
  input: z.object({
    ids: z.array(supplierIdSchema).max(20).default([]).describe("Candidates; empty = workflow shortlist"),
    recommended_id: supplierIdSchema.optional().describe("Only if the buyer named the supplier to recommend"),
  }),
  run: async (input, ctx): Promise<MemoResult> => {
    const wf = ctx.workflow;
    const dataset = datasetOf(wf);
    const ids = normalizeIds(input.ids.length ? input.ids : wf.shortlist, dataset);
    if (ids.length < 2) throw new Error("shortlist_memo needs at least 2 candidates (the shortlist has fewer than 2)");
    const profile_id = wf.profile_id || "default";
    const [cmp, meta] = await Promise.all([
      dataOrThrow<{ suppliers: Row[]; family_scores: Array<Record<string, unknown> & { supplier_id: string }> }>("compare_suppliers", { ids, fields: null, profile_id }, dataset),
      getMetadata(),
    ]);
    const rows = cmp.suppliers;
    const famBy = new Map(cmp.family_scores.map((f) => [f.supplier_id, f]));
    const overall = computeVerdict({
      suppliers: rows,
      fields: RISK_SCORES.map((field) => ({ field, weight: weightOf(meta, field) })),
      scores: Object.fromEntries(rows.map((r) => [r.supplier_id, Number(r.profile_score ?? r.total_risk_index)])),
      focus: "overall",
      focusLabel: profile_id === "default" ? "overall risk (default profile score, the unrounded Total Risk Index)" : `overall risk (${profile_id} profile score)`,
    });
    const famVerdict = (family: string) =>
      computeVerdict({
        suppliers: rows,
        fields: familyMembers(meta, family),
        scores: Object.fromEntries(rows.map((r) => [r.supplier_id, Number(famBy.get(r.supplier_id)?.[family])])),
        focus: family,
        focusLabel: family,
      });
    const financial = famVerdict("financial");
    const family_winners = Object.fromEntries(FAMILIES.map((f) => [f, famVerdict(f).winner]));
    const red_flags = rows.flatMap((r) =>
      RISK_SCORES.filter((f) => r[`${f}_level`] === "Critical" || Number(r[f]) >= 75).map((f) => ({ supplier_id: r.supplier_id, field: f, value: Number(r[f]) })),
    );
    const recId = input.recommended_id ? normalizeSupplierId(input.recommended_id, dataset) : overall.winner ?? ids[0];
    const rec = rows.find((r) => r.supplier_id === recId) ?? rows[0];

    let topDrivers: string[] = [];
    try {
      const ex = await dataOrThrow<{ supplier_id: string; contributions: Array<{ field: string; value: number; contribution_vs_mean: number }> }>(
        "explain_supplier",
        { id: rec.supplier_id, profile_id },
        dataset,
      );
      if (ex.supplier_id === rec.supplier_id) topDrivers = ex.contributions.slice(0, 3).map((c) => `${c.field} ${c.value} (+${fmt(c.contribution_vs_mean, 2)} vs mean)`);
    } catch {
      // explain is optional context for the memo
    }

    // The workflow carries no decision or notes, so they come from the seeded case, and only while it still matches
    // (decide step, same recommended supplier, notes about these candidates).
    const seeded = seedCases.find((c) => c.id === wf.case_id);
    const decision = seeded?.decision && wf.workflow_step === "decide" && seeded.decision.supplier === rec.supplier_id ? seeded.decision : null;
    const buyer_notes = (seeded?.notes ?? []).filter((x) => (x.match(/SUPP_\d{5}/g) ?? []).every((id) => ids.includes(id)));

    const d = overall.deciding_factor;
    const facts: MemoFacts = {
      scope: {
        case_id: wf.case_id ?? null,
        part_id: wf.part_id ?? null,
        category: wf.buyer_inputs.category ?? null,
        delivery_country: wf.buyer_inputs.delivery_country ?? null,
        profile_id,
        hard_requirements: wf.hard_requirements.map(conditionText),
        candidate_count: rows.length,
      },
      candidates: rows.map((r) => ({
        supplier_id: r.supplier_id,
        supplier_name: r.supplier_name,
        total_risk_index: r.total_risk_index,
        total_risk_level: r.total_risk_index_level ?? r.total_risk_level,
        profile_score: r.profile_score,
        delivery_rating: r.delivery_rating,
        order_confirmation_rate: r.order_confirmation_rate,
        po_volume: fmtEur(r.po_volume_eur),
        sourcing_risk_level: r.sourcing_risk_level,
        financial_health: r.financial_health,
        credit_rating: r.credit_rating,
        family_scores: famBy.get(r.supplier_id) ?? null,
      })),
      overall,
      financial,
      family_winners,
      red_flags,
      recommended: {
        supplier_id: rec.supplier_id,
        reason:
          rec.supplier_id === overall.winner
            ? `lowest ${overall.focus_label} among the candidates${d ? `; deciding factor ${d.field} (${d.winner_value} vs ${d.runner_up_value} for ${overall.runner_up})` : ""}`
            : "named by the buyer",
        top_drivers: topDrivers,
      },
      missing_data: [
        ...(wf.buyer_inputs.quotes ? [] : ["price / quotes (not in the dataset, not entered)"]),
        ...(wf.buyer_inputs.delivery_country ? [] : ["delivery country"]),
        "certifications (IRIS / ISO 22163, EN 15085) are not in the dataset",
      ],
      required_approvals: [],
      decision,
      buyer_notes,
    };
    facts.required_approvals = approvals(rec, facts, wf, famBy.get(rec.supplier_id));

    const title = `Award recommendation: ${wf.part_id ?? wf.buyer_inputs.category ?? "sourcing case"}`;
    const sheet = factSheet(facts);
    const prose = await writeProse({ instructions: MEMO_INSTRUCTIONS, prompt: `Fact sheet:\n${sheet}`, abortSignal: ctx.abortSignal });
    const narrative = prose ? parseNarrative(prose) : null;
    const markdown = assembleMemo(title, facts, narrative ?? templateNarrative(facts));
    const result = {
      title,
      markdown,
      source: narrative ? ("llm" as const) : ("template" as const),
      recommended_id: rec.supplier_id,
      candidate_ids: rows.map((r) => r.supplier_id),
      required_approvals: facts.required_approvals,
      red_flags,
      unverified_numbers: narrative ? unverifiedNumbers(Object.values(narrative).join("\n"), sheet) : [],
      facts,
    };
    return { ...result, handle: ctx.putResult(result) };
  },
  summarize: (r) =>
    `Drafted the award memo (${r.source === "llm" ? "LLM prose from computed facts" : "template"}) for ${r.candidate_ids.length} candidates; ` +
    `recommends ${r.recommended_id}. ${r.red_flags.length} open red flags (Critical scores). ${r.required_approvals.length} approvals required.` +
    (r.unverified_numbers.length ? ` ${r.unverified_numbers.length} numbers in the draft could not be traced to the facts; ask the buyer to review them.` : ""),
  view: (_r, handle) => `root = Memo("${handle}")`,
  examples: ["Write the shortlist memo", "Draft the award recommendation for my finalists"],
  workedExamples: [{ question: "Write the shortlist memo", input: { ids: [] } }],
});
