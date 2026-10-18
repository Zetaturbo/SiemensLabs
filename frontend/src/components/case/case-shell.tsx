"use client";
import Link from "next/link";
import { useParams, useSelectedLayoutSegment } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useCases } from "@/lib/cases/store";
import { startCasePersistence } from "@/lib/cases/actions";
import { CaseProvider, partById } from "./case-context";
import { ChatSlot, buildWorkflowContext, type CaseView } from "./chat-slot";
import { Spinner, ui } from "./primitives";
import { StageRail } from "./stage-rail";
import { SupplierDrawer } from "./supplier-drawer";
import { CURRENT_USER, useCaseUi } from "./ui-store";

const VIEWS: Record<string, CaseView> = { shortlist: "shortlist", finalists: "finalists", memo: "memo" };

/**
 * Frame for /cases/[caseId]/*: stage rail on top, the stage view in the middle, chat slot on the
 * right, supplier drawer as overlay. Creates the case on first visit when the id is
 * `case_<partId>` for a known train part (profile from train-parts.json).
 */
export function CaseShell({ children }: { children: ReactNode }) {
  const params = useParams<{ caseId: string }>();
  const caseId = decodeURIComponent(params.caseId);
  const segment = useSelectedLayoutSegment();
  const view: CaseView = (segment && VIEWS[segment]) || "explorer";
  const c = useCases((s) => s.cases[caseId]);
  const selected = useCaseUi((s) => s.selectedSupplier);
  const [chatOpen, setChatOpen] = useState(true);
  const partId = caseId.replace(/^case_/, "");
  const part = partById(partId);

  useEffect(() => {
    startCasePersistence();
    const st = useCases.getState();
    if (!st.cases[caseId] && part) st.createCase(part.id, part.profile, CURRENT_USER);
  }, [caseId, part]);

  useEffect(() => {
    useCaseUi.getState().closeSupplier();
  }, [caseId]);

  if (!c) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-sm">
        {part ? (
          <span className="flex items-center gap-2">
            <Spinner /> Opening the {part.label.toLowerCase()} case…
          </span>
        ) : (
          <div className="space-y-2 text-center">
            <p>
              No sourcing case <span className="font-mono">{caseId}</span>.
            </p>
            <Link className="underline" href="/cases">
              All cases
            </Link>
          </div>
        )}
      </main>
    );
  }

  return (
    <CaseProvider caseId={caseId}>
      <div className="flex h-dvh flex-col overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <StageRail c={c} view={view} chatOpen={chatOpen} onToggleChat={() => setChatOpen((o) => !o)} />
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-auto">{children}</main>
          <ChatSlot open={chatOpen} context={buildWorkflowContext(c, view, selected, part?.label)} />
        </div>
        <SupplierDrawer />
      </div>
    </CaseProvider>
  );
}

export function CaseShellFallback() {
  return (
    <main className={`flex flex-1 items-center justify-center gap-2 p-8 text-sm ${ui.muted}`}>
      <Spinner /> Loading case…
    </main>
  );
}
