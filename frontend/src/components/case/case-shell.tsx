"use client";
import Link from "next/link";
import { useParams, useSelectedLayoutSegment } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useCases } from "@/lib/cases/store";
import { startCasePersistence } from "@/lib/cases/actions";
import { CaseProvider, partById } from "./case-context";
import { ChatSlot, buildWorkflowContext, type CaseView } from "./chat-slot";
import { Spinner } from "./primitives";
import { StageRail } from "./stage-rail";
import { SupplierDrawer } from "./supplier-drawer";
import { CURRENT_USER, useCaseUi } from "./ui-store";

const VIEWS: Record<string, CaseView> = { shortlist: "shortlist", finalists: "finalists", memo: "memo" };

/** Fills the app frame's content area (<main>), never the viewport. */
const FRAME = "h-full min-h-0";

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
  const part = partById(caseId.replace(/^case_/, ""));

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
      <div className={`flex ${FRAME} items-center justify-center p-8 text-base text-subtext`}>
        {part ? (
          <span className="flex items-center gap-2">
            <Spinner /> Opening the {part.label.toLowerCase()} case
          </span>
        ) : (
          <div className="space-y-2 text-center">
            <p>
              No sourcing case <span className="font-mono">{caseId}</span>.
            </p>
            <Link className="text-ink underline underline-offset-2" href="/cases">
              All cases
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <CaseProvider caseId={caseId}>
      <div className={`flex ${FRAME} flex-col overflow-hidden bg-canvas text-ink`}>
        <StageRail c={c} view={view} chatOpen={chatOpen} onToggleChat={() => setChatOpen((o) => !o)} />
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-auto bg-sunken/50">{children}</div>
          <ChatSlot open={chatOpen} context={buildWorkflowContext(c, view, selected, part?.label)} />
        </div>
        <SupplierDrawer />
      </div>
    </CaseProvider>
  );
}

export function CaseShellFallback() {
  return (
    <div className={`flex ${FRAME} items-center justify-center gap-2 p-8 text-base text-subtext`}>
      <Spinner /> Loading case
    </div>
  );
}
