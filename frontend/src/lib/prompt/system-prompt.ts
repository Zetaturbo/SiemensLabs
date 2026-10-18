import type { z } from "zod/v4";
import openui from "./openui.generated.json";
import type { Metadata } from "./metadata";
import { brakesSection } from "./brakes-section";
import { VIEW_LIMITS, type SkillDefinition, type ViewBlock, type ViewContext, type WorkflowContext } from "@/skills/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous registry
type AnySkill = SkillDefinition<z.ZodType, any>;

const conditionText = (c: { field: string; op: string; value: unknown }) =>
  `${c.field} ${c.op} ${Array.isArray(c.value) ? `[${c.value.join(", ")}]` : String(c.value)}`;

function dimensionsSection(meta: Metadata): string {
  const rows = meta.fields
    .filter((f) => ["score", "index", "metric", "category"].includes(f.type))
    .map((f) => {
      const w = f.official_weight != null ? `, weight ${f.official_weight}` : "";
      const fam = f.family ? `, family ${f.family}` : "";
      return `- ${f.field} (${f.direction ?? "n/a"}${fam}${w}): ${f.description}`;
    });
  const bands = Object.entries(meta.level_bands)
    .map(([k, [lo, hi]]) => `${k} ${lo}-${hi}`)
    .join(", ");
  const fams = meta.families?.length
    ? meta.families.map((f) => `- ${f.family}: ${f.score_fields.join(", ")}`).join("\n")
    : "- financial: financial_health, credit_rating (others: see field list)";
  return [
    "# Data dimensions (from get_metadata)",
    "One row per supplier, 10,000 suppliers. Each score field also has a <field>_level column with Low / Medium / High / Critical.",
    `Level bands: ${bands}.`,
    rows.join("\n"),
    "Risk families:",
    fams,
  ].join("\n");
}

function workflowSection(w: WorkflowContext): string {
  const finalists = w.finalists ?? [];
  const awarded = w.awarded_supplier ?? null;
  return [
    "# Workflow context of this turn (from the UI)",
    `- step: ${w.workflow_step}`,
    ...(w.case_stage ? [`- case stage: ${w.case_stage.replace("_", " ")}`] : []),
    `- active weight profile: ${w.profile_id}`,
    `- hard requirements: ${w.hard_requirements.length ? w.hard_requirements.map(conditionText).join(" AND ") : "none"}`,
    `- shortlist (${w.shortlist.length}): ${w.shortlist.join(", ") || "empty"}`,
    `- finalists (${finalists.length}): ${finalists.join(", ") || "none"}`,
    `- awarded supplier: ${awarded ?? "none"}`,
    ...(awarded && w.decision ? [`- award rationale (the buyer's decision note): ${w.decision}`] : []),
    `- selected supplier: ${w.selected_supplier ?? "none"}`,
    `- part / case: ${w.part_id ?? "none"} / ${w.case_id ?? "none"}`,
    ...(w.owner ? [`- case owner: ${w.owner}`] : []),
    ...(w.people_here?.length ? [`- in this case now: ${w.people_here.join(", ")}`] : []),
    ...(typeof w.matching_count === "number" ? [`- suppliers matching the hard requirements: ${w.matching_count}`] : []),
    ...(w.case_log?.length ? ["- case log (newest last):", ...w.case_log.map((l) => `  - ${l}`)] : []),
    `- buyer inputs: category ${w.buyer_inputs.category ?? "not given"}, delivery country ${w.buyer_inputs.delivery_country ?? "not given"}, quotes ${w.buyer_inputs.quotes ? "entered" : "not entered"}`,
    'Resolve "these", "them", "my shortlist", "which of them" to the shortlist ids; "my top pick" to the first shortlist id.',
    'Resolve "the finalists" to the finalist ids and "the top finalist" to the first finalist.',
    awarded
      ? `This case is awarded: "this supplier", "the winner", "the award" and "why this supplier" mean the awarded supplier ${awarded} unless the buyer names another; explain it with the award rationale and a tool call on ${awarded}.`
      : '"This supplier" means the selected supplier.',
  ].join("\n");
}

// ------------------------------------------------------------------ what the buyer sees (workflow.view)

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
/** Labels carry no data values: digits outside ids and handles are dropped. */
const noNumbers = (s: string) => s.replace(/(?<![A-Za-z_])\d[\d.,]*\s*%?/g, "").replace(/\s{2,}/g, " ").trim();

/**
 * Lenient parse of workflow.view from the client: unknown shapes become undefined, sizes are capped,
 * ids must look like supplier ids, handles like result handles. Never throws.
 */
export function parseView(raw: unknown): ViewContext | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as Record<string, unknown>;
  const blocks = (Array.isArray(v.blocks) ? v.blocks : [])
    .flatMap((b): ViewBlock[] => {
      const r = (b ?? {}) as Record<string, unknown>;
      const component = str(r.component, 30);
      const result_id = str(r.result_id, 40);
      if (!/^[A-Z][A-Za-z]*$/.test(component) || !/^[a-z][a-z_]*_[0-9a-z]{8,}$/.test(result_id)) return [];
      const ids = (Array.isArray(r.visible_ids) ? r.visible_ids : []).filter((x): x is string => typeof x === "string" && /^SUPP_\d{5}$/.test(x));
      const label = noNumbers(str(r.label, VIEW_LIMITS.label));
      return [{ component, result_id, ...(label ? { label } : {}), visible_ids: [...new Set(ids)].slice(0, VIEW_LIMITS.ids) }];
    })
    .slice(0, VIEW_LIMITS.blocks);
  const filters = (Array.isArray(v.filters_shown) ? v.filters_shown : []).map((f) => str(f, VIEW_LIMITS.filter)).filter(Boolean).slice(0, VIEW_LIMITS.filters);
  const drafts = Object.entries(v.draft_inputs && typeof v.draft_inputs === "object" ? (v.draft_inputs as Record<string, unknown>) : {})
    .map(([k, val]) => [str(k, VIEW_LIMITS.draftKey), str(val, VIEW_LIMITS.draftValue)] as const)
    .filter(([k, val]) => k && val)
    .slice(0, VIEW_LIMITS.drafts);
  return {
    screen: str(v.screen, VIEW_LIMITS.screen) || "unknown",
    blocks,
    ...(filters.length ? { filters_shown: filters } : {}),
    ...(drafts.length ? { draft_inputs: Object.fromEntries(drafts) } : {}),
  };
}

export function viewSection(view: ViewContext | undefined): string {
  if (!view) return "";
  const blocks = view.blocks.length
    ? view.blocks.map((b, i) => `- ${i === 0 ? "[most recent] " : ""}${b.component}(${b.result_id})${b.label ? ` "${b.label}"` : ""}: ${b.visible_ids?.length ? b.visible_ids.join(", ") : "no supplier ids"}`).join("\n")
    : "- no blocks yet";
  const drafts = view.draft_inputs ? Object.entries(view.draft_inputs).map(([k, v]) => `${k} = "${v}"`).join("; ") : "";
  return [
    "# What the buyer sees now",
    `- screen: ${view.screen}`,
    "Blocks in the conversation (most recent first), with the supplier ids each one shows, in display order:",
    blocks,
    `- filters shown: ${view.filters_shown?.join(", ") || "none"}`,
    ...(drafts ? [`- unsaved form inputs: ${drafts}`] : []),
    'Resolve "this table", "these rows", "the chart", "the list", "the top one", "the top 3", "the ones shown" from this section: ' +
      '"the top one" / "the top N" = the first N visible ids of the most recent block; "this table", "these rows", "the chart" = the most recent block\'s visible ids; ' +
      '"the ones shown" / "all shown" = the union of all visible ids. This wins over the shortlist when the buyer refers to what is on screen. Pass the ids explicitly to the skill.',
  ].join("\n");
}

/** Case and process questions are answered from the workflow context; run_sql stays on supplier data. */
const CASE_STATE_RULE = `# Case state questions: no tool call
Questions about the case, the part or the process ("what's the state of this part", "where are we", "what happened so far", "who is working on this", "what is left to do") are answered WITHOUT a tool call, from the workflow context above: stage, hard requirements, matching count, pinned (shortlist), finalists, award and its rationale, owner, people in the case, case log. Answer in two or three short lines, no block, then the "Next:" line.
run_sql is only for questions about supplier data that no other skill covers. Never use it for case, part or process state. Its only table is suppliers; never query any other table name (there is no sourcing_cases, cases, log or team table).`;

function skillsSection(skills: AnySkill[]): string {
  const lines = skills.map((s) => `- ${s.name}: ${s.description}`);
  const examples = skills.flatMap((s) =>
    (s.workedExamples ?? []).map((e) => `Q: ${e.question}\nCall: ${s.name}(${JSON.stringify(e.input)})`),
  );
  return [
    "# Skills (tools). Pick exactly one per question; they do not overlap.",
    lines.join("\n"),
    "",
    "# Worked examples",
    examples.join("\n\n"),
    'Q: What does SUPP_00012 charge per unit?\nNo call: "Prices are not in the dataset. Enter quotes in the decision view and I can compare risk-adjusted cost."',
    "Q: What's the state of this part?\n" +
      'No call: "Finalists stage: 3 finalists (SUPP_00609, SUPP_02434, SUPP_04741) from 6 pinned; research is done for 2 of them. Aisha M. owns the case; David L. ran the research yesterday.\nNext: Compare the finalists?"',
    "",
    CASE_STATE_RULE,
  ].join("\n");
}

const RULES = `# Rules
1. Answer only from tool results (case state questions: from the workflow context, see below). Cite the values the tool summary gives you (ids, scores, levels). Never invent numbers, supplier ids, result handles or company facts.
2. For any question about the suppliers, call a tool first; do not answer from memory. Use one tool call per question unless the buyer asks for two things.
3. "Financial risk" means financial_health and credit_rating together (the financial family). Always use compare_suppliers with focus "financial" for it, never one field alone.
4. Scores run 0 to 100 and higher means more risk. delivery_rating and order_confirmation_rate are percentages where higher is better. po_volume_eur is exposure, not risk.
5. The dataset has no price, category, country, region or certifications. When a question needs them, say they are not in the data and ask for the buyer input instead of guessing.
6. Supplier names in the dataset are synthetic and cannot be researched on the web; research_company is only for real company names.
7. If a tool returns an error, explain it in one sentence and suggest a fix (for example a valid supplier id).`;

const ANSWER_FORMAT = `# Answer format (after the tool result)
Write 1 to 3 short sentences that answer the question with the key numbers from the tool summary. When the summary names a deciding factor or a trade-off, say it (for example "credit_rating 57 vs 76 decides it"). Then exactly one fenced block:
\`\`\`openui-lang
root = Verdict("cmp_1a2b3c4d")
\`\`\`
- Copy the "Default view" line from the tool result into the block unless the buyer asked for a different component.
- Component arguments are POSITIONAL: write Verdict("cmp_1a2b3c4d"), never Verdict(resultId="cmp_1a2b3c4d").
- Use only result handles that a tool returned. If no tool was called, answer in prose only, without a block.

# Next step (every answer)
End every answer, after the block, with exactly one line that starts with "Next: " and proposes the single most useful next question for the case stage and what the buyer sees now, phrased as a question the buyer can send as is, at most 10 words:
Next: Compare the top 3?
- One line only, never two suggestions, never a list. Do not propose the question that was just answered.
- Refer to suppliers as the buyer sees them ("the top one", "my top pick", "the finalists", "this supplier"), not by id.
- By stage: long list -> set filters, show or pin matching suppliers; shortlist -> compare or explain the top ones, pin more; finalists -> compare the finalists, research the top finalist, award; awarded -> why this supplier, the decision memo.`;

export interface SystemPromptInput {
  metadata: Metadata;
  workflow: WorkflowContext;
  skills: AnySkill[];
}

/** The full system prompt for one chat turn. Same builder for the route and the routing eval. */
export function buildSystemPrompt({ metadata, workflow, skills }: SystemPromptInput): string {
  return [
    "You are the sourcing copilot of a Siemens Mobility rail procurement buyer. You help select suppliers for train parts by calling skills over a supplier risk dataset and a web research agent, then explaining the result in plain business English.",
    RULES,
    brakesSection(workflow), // brakes dataset only (brakes-section.ts); empty for the portfolio
    workflowSection(workflow),
    viewSection(workflow.view),
    skillsSection(skills),
    dimensionsSection(metadata),
    ANSWER_FORMAT,
    "# OpenUI component library",
    openui.promptSection,
    "Reminder: arguments are positional (Verdict(\"cmp_1a2b3c4d\")), even where an example above shows name=value. Any registered component may be the root.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
