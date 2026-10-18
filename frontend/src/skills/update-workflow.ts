import { z } from "zod/v4";
import { defineSkill, type UiAction, type CaseStage, type WorkflowContext } from "./types";
import { PROFILE_IDS, conditionSchema, conditionText, mergeConditions, normalizeIds, normalizeSupplierId, type Condition } from "./shared";

const ACTIONS = [
  "add_to_shortlist",
  "remove_from_shortlist",
  "set_profile",
  "open_supplier",
  "open_compare",
  "assign_part",
  "set_case_stage",
  "add_hard_requirements",
  "remove_hard_requirements",
] as const;

interface WorkflowUpdate {
  actions: UiAction[];
  rejected: string[];
  handle: string;
}

/** Flat schema (one object per action) because open-weight models handle it better than a discriminated union. */
const actionSchema = z.object({
  action: z.enum(ACTIONS),
  ids: z.array(z.string()).optional().describe("Supplier ids for add_to_shortlist, remove_from_shortlist, open_compare"),
  supplier_id: z.string().optional().describe("For open_supplier"),
  profile_id: z.enum(PROFILE_IDS).optional().describe("For set_profile"),
  part_id: z.string().optional().describe("For assign_part, e.g. brake_system"),
  owner_name: z.string().optional().describe("For assign_part"),
  department: z.string().optional().describe("For assign_part"),
  case_id: z.string().optional().describe("For set_case_stage; default = current case"),
  stage: z.enum(["long_list", "shortlist", "finalists", "awarded"]).optional().describe("For set_case_stage"),
  conditions: z.array(conditionSchema).optional().describe("For add_hard_requirements: filters to add; one on a field already filtered replaces it"),
  fields: z.array(z.string()).optional().describe('For remove_hard_requirements: fields whose filters to drop, e.g. ["delivery_rating"]; empty = drop all'),
});

type Action = z.infer<typeof actionSchema>;

/** Filter changes act on a running list, so several requirement changes in one call compose. */
function toUiAction(a: Action, workflow: WorkflowContext, hard: { current: Condition[] }): UiAction | string {
  switch (a.action) {
    case "add_to_shortlist":
    case "remove_from_shortlist":
      return a.ids?.length ? { type: a.action, ids: normalizeIds(a.ids) } : `${a.action} needs ids`;
    case "open_compare":
      return { type: "open_compare", ids: a.ids?.length ? normalizeIds(a.ids) : undefined };
    case "open_supplier":
      return a.supplier_id || a.ids?.[0] ? { type: "open_supplier", id: normalizeSupplierId(a.supplier_id ?? a.ids![0]) } : "open_supplier needs supplier_id";
    case "set_profile":
      return a.profile_id ? { type: "set_profile", profile_id: a.profile_id } : "set_profile needs profile_id";
    case "assign_part": {
      const part_id = a.part_id ?? workflow.part_id;
      return part_id && a.owner_name ? { type: "assign_part", part_id, owner: { name: a.owner_name, department: a.department ?? "" } } : "assign_part needs part_id and owner_name";
    }
    case "set_case_stage": {
      const case_id = a.case_id ?? workflow.case_id;
      return case_id && a.stage ? { type: "set_case_stage", case_id, stage: a.stage as CaseStage } : "set_case_stage needs stage (and a case)";
    }
    case "add_hard_requirements":
      if (!a.conditions?.length) return "add_hard_requirements needs conditions";
      hard.current = mergeConditions(hard.current, a.conditions);
      return { type: "set_hard_requirements", conditions: hard.current };
    case "remove_hard_requirements": {
      const base = (f: string) => f.replace(/_level$/, "");
      const drop = new Set((a.fields ?? []).map(base));
      hard.current = drop.size ? hard.current.filter((c) => !drop.has(base(c.field))) : [];
      return { type: "set_hard_requirements", conditions: hard.current };
    }
  }
}

export const updateWorkflow = defineSkill({
  name: "update_workflow",
  description:
    "Changes the buyer's workspace: add or remove suppliers on the shortlist, switch the weight profile, open a supplier or the comparison view, " +
    "assign a train part to a buyer, move the sourcing case to another stage, or add or drop the case's filters (hard requirements) without listing suppliers. " +
    "Use only when the buyer asks to change, add, pin, remove, drop, open, assign or move something. Do not use to answer a question about suppliers. " +
    "Renders nothing; the UI applies the change.",
  priority: "core",
  stage: "any",
  input: z.object({ actions: z.array(actionSchema).min(1) }),
  run: async (input, ctx): Promise<WorkflowUpdate> => {
    const hard = { current: [...(ctx.workflow.hard_requirements as Condition[])] };
    const mapped = input.actions.map((a) => toUiAction(a, ctx.workflow, hard));
    const result = { actions: mapped.filter((m): m is UiAction => typeof m !== "string"), rejected: mapped.filter((m): m is string => typeof m === "string") };
    return { ...result, handle: ctx.putResult(result) };
  },
  summarize: (r) => {
    const changes = r.actions.map((a) =>
      a.type === "set_hard_requirements" ? `filters now ${a.conditions.map(conditionText).join(" AND ") || "none"}` : a.type + ("ids" in a && a.ids ? ` ${a.ids.join(", ")}` : ""),
    );
    return `Requested ${r.actions.length} UI change(s): ${changes.join("; ") || "none"}.` + (r.rejected.length ? ` Not applied: ${r.rejected.join("; ")}.` : "");
  },
  view: () => "",
  uiActions: (r) => r.actions,
  examples: ["Add SUPP_00012 and SUPP_00450 to my shortlist", "Switch to the safety-critical profile", "Move this case to finalists"],
  workedExamples: [
    { question: "Add SUPP_00012 and SUPP_00450 to my shortlist", input: { actions: [{ action: "add_to_shortlist", ids: ["SUPP_00012", "SUPP_00450"] }] } },
    { question: "Move this case to finalists", input: { actions: [{ action: "set_case_stage", stage: "finalists" }] } },
    { question: "Drop the delivery filter", input: { actions: [{ action: "remove_hard_requirements", fields: ["delivery_rating"] }] } },
  ],
});
