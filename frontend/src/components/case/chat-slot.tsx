"use client";
import type { SourcingCase } from "@/lib/cases/types";
import { cn } from "@/lib/utils";

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

export type WorkflowContext = ReturnType<typeof buildWorkflowContext>;

/**
 * Placeholder where the ChatPanel (branch feat/ui-blocks-chat) mounts. Integration: render
 * <ChatPanel context={context} /> inside this <aside> instead of the placeholder body.
 */
export function ChatSlot({ context, open }: { context: WorkflowContext | null; open: boolean }) {
  return (
    <aside
      id="case-chat-slot"
      data-slot="chat"
      aria-label="Assistant"
      className={cn("min-h-0 w-[360px] shrink-0 flex-col border-l border-subtle bg-surface", open ? "hidden lg:flex" : "hidden")}
    >
      <div className="flex h-10 items-center border-b border-subtle px-3 text-sm font-semibold">Assistant</div>
      <div className="flex flex-1 flex-col gap-3 overflow-auto p-3 text-sm">
        <p className="text-subtext">The chat panel mounts here. It receives this workflow context on every turn.</p>
        {context && (
          <pre className="overflow-auto rounded-lg border border-subtle bg-sunken p-2 font-mono text-[10px] leading-snug text-subtext">{JSON.stringify(context, null, 2)}</pre>
        )}
      </div>
    </aside>
  );
}
