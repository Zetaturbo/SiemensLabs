import parts from "@/config/train-parts.json";
import type { FilterCondition } from "@/lib/data-api/types";
import type { SourcingCase, Stage } from "@/lib/cases/types";
import type { WorkflowContext } from "@/skills/types";

type Step = WorkflowContext["workflow_step"];

/** Case stage -> workflow step (ARCHITECTURE.md section 3). The long list splits on whether knock-outs exist. */
export function stepForStage(stage: Stage | undefined, hasRequirements: boolean): Step {
  switch (stage) {
    case "long_list":
      return hasRequirements ? "ranking" : "requirements";
    case "shortlist":
      return "compare";
    case "finalists":
      return "deep_dive";
    case "awarded":
      return "decide";
    default:
      return "define";
  }
}

const partLabel = (partId: string | undefined) => parts.parts.find((p) => p.id === partId)?.label;

/**
 * The context sent with every chat turn, built from the shared case store.
 * Unknown cases still produce a valid context (default profile, empty shortlist).
 */
export function buildWorkflowContext(
  c: SourcingCase | undefined,
  opts: { caseId: string; selectedSupplier?: string | null; workflowStep?: Step; buyerInputs?: WorkflowContext["buyer_inputs"] } = { caseId: "" },
): WorkflowContext {
  const hard = (c?.hardRequirements ?? []) as FilterCondition[];
  const shortlist = c ? [...c.shortlist, ...c.finalists.filter((id) => !c.shortlist.includes(id))] : [];
  const category = partLabel(c?.partId);
  return {
    workflow_step: opts.workflowStep ?? stepForStage(c?.stage, hard.length > 0),
    profile_id: c?.profileId ?? "default",
    hard_requirements: hard,
    shortlist,
    selected_supplier: opts.selectedSupplier ?? null,
    buyer_inputs: { ...(category ? { category } : {}), ...(opts.buyerInputs ?? {}) },
    case_id: opts.caseId || c?.id,
    part_id: c?.partId,
    // Finalists and the award travel on their own, so "the finalists" and "this supplier" resolve in later stages.
    case_stage: c?.stage,
    finalists: c?.finalists ?? [],
    awarded_supplier: c?.awardedSupplier ?? null,
    ...(c?.decision && c.decision.supplier === c.awardedSupplier && c.decision.rationale ? { decision: c.decision.rationale } : {}),
    // Case state for "where are we", "what happened so far", "who is on this": answered from here, without a tool.
    ...(c?.owner ? { owner: `${c.owner.name}, ${c.owner.department}` } : {}),
    ...(c?.matching && c.matching.filtersKey === JSON.stringify(c.hardRequirements) ? { matching_count: c.matching.count } : {}),
    ...(c ? { case_log: c.log.slice(-6).map((e) => `${e.at.slice(0, 10)} · ${e.who}: ${e.what}`) } : {}),
  };
}
