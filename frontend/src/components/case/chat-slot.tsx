"use client";
import type { SourcingCase } from "@/lib/cases/types";
import { cx, ui } from "./primitives";

export type CaseView = "explorer" | "shortlist" | "finalists" | "memo";

const STEP: Record<CaseView, string> = { explorer: "hard_requirements", shortlist: "compare", finalists: "deep_dive", memo: "decide" };

/** WorkflowContext per ARCHITECTURE.md section 7, sent by the chat on every turn. */
export function buildWorkflowContext(c: SourcingCase, view: CaseView, selectedSupplier: string | null, partLabel?: string) {
  return {
    workflow_step: STEP[view],
    case_id: c.id,
    case_stage: c.stage,
    profile_id: c.profileId,
    hard_requirements: c.hardRequirements,
    shortlist: c.shortlist,
    finalists: c.finalists,
    selected_supplier: selectedSupplier,
    buyer_inputs: { category: partLabel ?? c.partId, delivery_country: null, quotes: null },
  };
}

/**
 * Placeholder where the ChatPanel (branch feat/ui-blocks-chat) mounts. Integration: render
 * <ChatPanel context={workflowContext} /> inside this <aside> instead of the placeholder body.
 */
export function ChatSlot({ context, open }: { context: ReturnType<typeof buildWorkflowContext> | null; open: boolean }) {
  return (
    <aside
      id="case-chat-slot"
      data-slot="chat"
      aria-label="Assistant"
      className={cx("min-h-0 w-[360px] shrink-0 flex-col border-l", ui.border, ui.subtle, open ? "hidden lg:flex" : "hidden")}
    >
      <div className={cx("border-b px-3 py-2 text-xs font-semibold", ui.border)}>Assistant</div>
      <div className="flex flex-1 flex-col gap-3 overflow-auto p-3 text-xs">
        <p className={ui.muted}>The chat panel mounts here. It receives the workflow context below on every turn.</p>
        {context && (
          <pre className={cx("overflow-auto rounded-md border p-2 font-mono text-[10px] leading-snug", ui.border, "bg-white dark:bg-zinc-950")}>
            {JSON.stringify(context, null, 2)}
          </pre>
        )}
      </div>
    </aside>
  );
}
