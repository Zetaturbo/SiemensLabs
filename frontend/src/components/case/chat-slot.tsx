"use client";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChatPanel } from "@/components/chat/chat-panel";
import type { UiAction } from "@/components/chat/ui-actions";
import { setResearchJob } from "@/lib/cases/actions";
import type { SourcingCase } from "@/lib/cases/types";
import type { FilterCondition } from "@/lib/data-api/types";
import { cn } from "@/lib/utils";
import type { WorkflowContext as Section7Context } from "@/skills/types";
import { CURRENT_USER, useCaseUi } from "./ui-store";

export type CaseView = "explorer" | "shortlist" | "finalists" | "memo";
type WorkflowStep = Section7Context["workflow_step"];

/** Workflow steps as in ARCHITECTURE.md section 3 (the chat route rejects other names). */
function stepFor(view: CaseView, c: SourcingCase): WorkflowStep {
  switch (view) {
    case "explorer":
      return c.hardRequirements.length ? "ranking" : "requirements";
    case "shortlist":
      return "compare";
    case "finalists":
      return "deep_dive";
    case "memo":
      return "decide";
  }
}

/** WorkflowContext per ARCHITECTURE.md section 7, sent by the chat on every turn. */
export function buildWorkflowContext(c: SourcingCase, view: CaseView, selectedSupplier: string | null, partLabel?: string) {
  return {
    workflow_step: stepFor(view, c),
    case_id: c.id,
    part_id: c.partId,
    case_stage: c.stage,
    profile_id: c.profileId,
    hard_requirements: c.hardRequirements as FilterCondition[],
    shortlist: c.shortlist,
    finalists: c.finalists,
    selected_supplier: selectedSupplier,
    buyer_inputs: { category: partLabel ?? c.partId },
  };
}

export type WorkflowContext = ReturnType<typeof buildWorkflowContext>;

/**
 * The case's assistant: ChatPanel on the case store. Shortlist, profile, stage and assign_part actions are
 * applied by the panel through src/lib/cases/actions.ts (same store as the screens); this slot wires the
 * view-level actions: open_supplier opens the drawer, start_research records the job and opens the public
 * record tab, open_compare goes to the shortlist board.
 */
export function ChatSlot({ context, open }: { context: WorkflowContext | null; open: boolean }) {
  const router = useRouter();
  const caseId = context?.case_id ?? null;
  const onAction = useCallback(
    (a: UiAction) => {
      const ui = useCaseUi.getState();
      if (a.type === "open_supplier") ui.openSupplier(a.id);
      else if (a.type === "start_research" && a.supplier_id) {
        if (caseId && a.job_id) setResearchJob(caseId, a.supplier_id, a.job_id, CURRENT_USER.name);
        ui.openSupplier(a.supplier_id, "public_record");
      } else if (a.type === "open_compare" && caseId) router.push(`/cases/${encodeURIComponent(caseId)}/shortlist`);
    },
    [caseId, router],
  );
  return (
    <aside
      id="case-chat-slot"
      data-slot="chat"
      aria-label="Assistant"
      className={cn("min-h-0 w-[400px] shrink-0 flex-col border-l border-subtle bg-surface", open ? "hidden lg:flex" : "hidden")}
    >
      {caseId && context ? (
        <ChatPanel caseId={caseId} context={context} onAction={onAction} who={`Assistant (${CURRENT_USER.name})`} title="Assistant" className="bg-surface" />
      ) : null}
    </aside>
  );
}
