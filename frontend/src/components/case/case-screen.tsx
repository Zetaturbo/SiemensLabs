"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { conditionLabel } from "@/components/ui-blocks/condition-label";
import type { FilterCondition } from "@/lib/data-api/types";
import type { UiAction } from "@/components/chat/ui-actions";
import { requirementsTouched, setHardRequirements, setResearchJob, startCasePersistence } from "@/lib/cases/actions";
import { useCases } from "@/lib/cases/store";
import type { SourcingCase } from "@/lib/cases/types";
import { partById, useProfiles, type TrainPart } from "./case-context";
import { openingMessage, stageSuggestions } from "./case-guide";
import { ContextRail } from "./context-rail";
import { profileKnockouts } from "./domain";
import { FilterChips } from "./filter-chips";
import { Spinner } from "./primitives";
import { CURRENT_USER } from "./ui-store";

/** Height below the AppShell top bar (h-12). */
const FRAME = "h-[calc(100dvh-3rem)]";

// Whether the saved cases have been restored in this tab (startCasePersistence is idempotent).
let restored = false;
const restoreListeners = new Set<() => void>();
function restoreCases() {
  startCasePersistence();
  if (restored) return;
  restored = true;
  restoreListeners.forEach((l) => l());
}
const onRestored = (l: () => void) => {
  restoreListeners.add(l);
  return () => restoreListeners.delete(l);
};
const isRestored = () => restored;

/**
 * /cases/[caseId]: the chat is the product. Context rail on the left, filter chips and the chat on
 * the right; every table or comparison is a block inside the conversation. Creates the case on
 * first visit when the id is `case_<partId>` for a known train part (profile from train-parts.json).
 */
export function CaseScreen() {
  const params = useParams<{ caseId: string }>();
  const caseId = decodeURIComponent(params.caseId);
  const part = partById(caseId.replace(/^case_/, ""));
  const c = useCases((s) => s.cases[caseId]);
  // Cases are restored from localStorage before the workspace mounts, so the opening message reflects the saved case.
  const ready = useSyncExternalStore(onRestored, isRestored, () => false);

  useEffect(() => {
    restoreCases();
    const st = useCases.getState();
    if (!st.cases[caseId] && part) st.createCase(part.id, part.profile, CURRENT_USER);
  }, [caseId, part]);

  if (!c || !ready) {
    return (
      <div className={`flex ${FRAME} items-center justify-center p-8 text-base text-subtext`}>
        {part || !ready ? (
          <span className="flex items-center gap-2">
            <Spinner /> Opening the {part ? part.label.toLowerCase() : "sourcing"} case
          </span>
        ) : (
          <div className="space-y-2 text-center">
            <p>
              No sourcing case <span className="font-mono">{caseId}</span>.
            </p>
            <Link className="text-ink underline underline-offset-2" href="/train">
              Open the train map
            </Link>
          </div>
        )}
      </div>
    );
  }

  return <CaseWorkspace key={caseId} c={c} part={part} />;
}

export function CaseScreenFallback() {
  return (
    <div className={`flex ${FRAME} items-center justify-center gap-2 p-8 text-base text-subtext`}>
      <Spinner /> Loading case
    </div>
  );
}

function CaseWorkspace({ c, part }: { c: SourcingCase; part?: TrainPart }) {
  const { profiles, loading: profilesLoading } = useProfiles();
  const profile = profiles.find((p) => p.profile_id === c.profileId);

  // The profile's knock-out rules preset the filters until the buyer (or the chat) sets any.
  useEffect(() => {
    if (profilesLoading) return;
    const cur = useCases.getState().cases[c.id];
    if (!cur || requirementsTouched(cur)) return;
    const preset = profileKnockouts(profile, cur.profileId);
    if (preset.length) setHardRequirements(c.id, preset, CURRENT_USER.name, `preset from ${cur.profileId} knock-outs`);
  }, [c.id, profilesLoading, profile]);

  // Built once from the case as it was opened (with the knock-out preset it is about to get); no LLM call.
  const [opening] = useState(() =>
    openingMessage(requirementsTouched(c) || c.hardRequirements.length ? c : { ...c, hardRequirements: profileKnockouts(undefined, c.profileId) }, part),
  );
  const suggestions = useMemo(() => stageSuggestions(c, part), [c, part]);
  // The screen's part of workflow.view; the chat adds the blocks it shows. No form fields here besides the composer.
  const view = useMemo(() => ({ screen: "case chat", filters_shown: (c.hardRequirements as FilterCondition[]).map(conditionLabel) }), [c.hardRequirements]);

  const onAction = useCallback(
    (a: UiAction) => {
      if (a.type === "start_research" && a.supplier_id && a.job_id) setResearchJob(c.id, a.supplier_id, a.job_id, CURRENT_USER.name);
    },
    [c.id],
  );

  return (
    <div className={`flex ${FRAME} overflow-hidden bg-canvas text-ink`}>
      <ContextRail c={c} part={part} />
      <section aria-label="Assistant" className="flex min-w-0 flex-1 flex-col">
        <FilterChips c={c} />
        <ChatPanel
          caseId={c.id}
          variant="page"
          who={`Assistant (${CURRENT_USER.name})`}
          suggestions={suggestions}
          view={view}
          onAction={onAction}
          placeholder="Ask"
          intro={
            <p data-opening className="text-md text-subtext">
              {opening}
            </p>
          }
          className="min-h-0 flex-1"
        />
      </section>
    </div>
  );
}
