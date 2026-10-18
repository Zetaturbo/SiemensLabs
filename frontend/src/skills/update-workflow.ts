import { z } from "zod/v4";
import { defineSkill, type UiAction, type CaseStage } from "./types";
import { PROFILE_IDS, normalizeIds, normalizeSupplierId } from "./shared";

const ACTIONS = ["add_to_shortlist", "remove_from_shortlist", "set_profile", "open_supplier", "open_compare", "assign_part", "set_case_stage"] as const;

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
});

function toUiAction(a: z.infer<typeof actionSchema>, caseId: string | undefined, partId: string | undefined): UiAction | string {
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
      const part_id = a.part_id ?? partId;
      return part_id && a.owner_name ? { type: "assign_part", part_id, owner: { name: a.owner_name, department: a.department ?? "" } } : "assign_part needs part_id and owner_name";
    }
    case "set_case_stage": {
      const case_id = a.case_id ?? caseId;
      return case_id && a.stage ? { type: "set_case_stage", case_id, stage: a.stage as CaseStage } : "set_case_stage needs stage (and a case)";
    }
  }
}

export const updateWorkflow = defineSkill({
  name: "update_workflow",
  description:
    "Changes the buyer's workspace: add or remove suppliers on the shortlist, switch the weight profile, open a supplier or the comparison view, " +
    "assign a train part to a buyer, or move the sourcing case to another stage. Use only when the buyer asks to change, add, pin, remove, open, " +
    "assign or move something. Do not use to answer a question about suppliers. Renders nothing; the UI applies the change.",
  priority: "core",
  stage: "any",
  input: z.object({ actions: z.array(actionSchema).min(1) }),
  run: async (input, ctx): Promise<WorkflowUpdate> => {
    const mapped = input.actions.map((a) => toUiAction(a, ctx.workflow.case_id, ctx.workflow.part_id));
    const result = { actions: mapped.filter((m): m is UiAction => typeof m !== "string"), rejected: mapped.filter((m): m is string => typeof m === "string") };
    return { ...result, handle: ctx.putResult(result) };
  },
  summarize: (r) =>
    `Requested ${r.actions.length} UI change(s): ${r.actions.map((a) => a.type + ("ids" in a && a.ids ? ` ${a.ids.join(", ")}` : "")).join("; ") || "none"}.` +
    (r.rejected.length ? ` Not applied: ${r.rejected.join("; ")}.` : ""),
  view: () => "",
  uiActions: (r) => r.actions,
  examples: ["Add SUPP_00012 and SUPP_00450 to my shortlist", "Switch to the safety-critical profile", "Move this case to finalists"],
  workedExamples: [
    { question: "Add SUPP_00012 and SUPP_00450 to my shortlist", input: { actions: [{ action: "add_to_shortlist", ids: ["SUPP_00012", "SUPP_00450"] }] } },
    { question: "Move this case to finalists", input: { actions: [{ action: "set_case_stage", stage: "finalists" }] } },
  ],
});
