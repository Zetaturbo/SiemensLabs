import type { z } from "zod/v4";
import openui from "./openui.generated.json";
import type { Metadata } from "./metadata";
import type { SkillDefinition, WorkflowContext } from "@/skills/types";

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
  return [
    "# Workflow context of this turn (from the UI)",
    `- step: ${w.workflow_step}`,
    `- active weight profile: ${w.profile_id}`,
    `- hard requirements: ${w.hard_requirements.length ? w.hard_requirements.map(conditionText).join(" AND ") : "none"}`,
    `- shortlist (${w.shortlist.length}): ${w.shortlist.join(", ") || "empty"}`,
    `- selected supplier: ${w.selected_supplier ?? "none"}`,
    `- part / case: ${w.part_id ?? "none"} / ${w.case_id ?? "none"}`,
    `- buyer inputs: category ${w.buyer_inputs.category ?? "not given"}, delivery country ${w.buyer_inputs.delivery_country ?? "not given"}, quotes ${w.buyer_inputs.quotes ? "entered" : "not entered"}`,
    'Resolve "these", "them", "my shortlist", "which of them" to the shortlist ids; "this supplier" to the selected supplier.',
  ].join("\n");
}

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
  ].join("\n");
}

const RULES = `# Rules
1. Answer only from tool results. Cite the values the tool summary gives you (ids, scores, levels). Never invent numbers, supplier ids, result handles or company facts.
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
- Use only result handles that a tool returned. If no tool was called, answer in prose only, without a block.`;

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
    workflowSection(workflow),
    skillsSection(skills),
    dimensionsSection(metadata),
    ANSWER_FORMAT,
    "# OpenUI component library",
    openui.promptSection,
    "Reminder: arguments are positional (Verdict(\"cmp_1a2b3c4d\")), even where an example above shows name=value. Any registered component may be the root.",
  ].join("\n\n");
}
