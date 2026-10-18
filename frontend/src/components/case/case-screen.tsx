"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { conditionLabel } from "@/components/ui-blocks/condition-label";
import type { FilterCondition } from "@/lib/data-api/types";
import type { UiAction } from "@/components/chat/ui-actions";
import { requirementsTouched, setHardRequirements, setResearchJob, startCasePersistence } from "@/lib/cases/actions";
import { useCases } from "@/lib/cases/store";
import type { SourcingCase } from "@/lib/cases/types";
import { useShortlistRanking } from "@/components/shortlist/ranking";
import { AwardDialog } from "./award-dialog";
import { advanceTop, boardStep } from "./board-step";
import { CaseBoard } from "./case-board";
import { partById, useProfiles, type TrainPart } from "./case-context";
import { nextQuestion, openingMessage, stageSuggestions } from "./case-guide";
import { useCaseView } from "./case-view";
import { ContextRail } from "./context-rail";
import { profileKnockouts } from "./domain";
import { FilterChips } from "./filter-chips";
import { Spinner } from "./primitives";
import { ProgressBar, type BarAction } from "./progress-bar";
import { CURRENT_USER, CURRENT_USER_ID } from "./ui-store";

/** The screen fills its container (the shell's content area); it never sizes itself to the viewport. */
const FRAME = "h-full min-h-0";

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
 * /cases/[caseId]: the chat is the product. The stage as a progress bar across the top (with the one "Next"
 * action and the Chat / Board switch), the context rail on the left, filter chips and the chat on the right; every
 * table or comparison is a block inside the conversation. The board (`?view=board`) is the same case as a classic
 * working view: candidates, shortlist comparison and a Continue step. Creates the case on first visit when the id is
 * `case_<partId>` for a known train part (profile from train-parts.json).
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

  // The buyer is in this case now: the presence the rail (and the other buyers) see.
  useEffect(() => {
    useCases.getState().moveTo(CURRENT_USER_ID, c.id);
  }, [c.id]);

  // Built once from the case as it was opened (with the knock-out preset it is about to get); no LLM call.
  const [opening] = useState(() =>
    openingMessage(requirementsTouched(c) || c.hardRequirements.length ? c : { ...c, hardRequirements: profileKnockouts(undefined, c.profileId) }, part),
  );
  const stageNext = useMemo(() => nextQuestion(c, part), [c, part]);
  const suggestions = useMemo(() => stageSuggestions(c, part), [c, part]);
  // The screen's part of workflow.view; the chat adds the blocks it shows. No form fields here besides the composer.
  const chatView = useMemo(() => ({ screen: "case chat", filters_shown: (c.hardRequirements as FilterCondition[]).map(conditionLabel) }), [c.hardRequirements]);

  // One next question on screen: the model's latest nudge, else the stage's own. The bar asks it through the chat.
  const ask = useRef<((text: string) => void) | null>(null);
  const [modelNext, setModelNext] = useState<string | null>(null);
  const next = modelNext ?? stageNext;
  const onNext = useCallback((q: string) => ask.current?.(q), []);

  const onAction = useCallback(
    (a: UiAction) => {
      if (a.type === "start_research" && a.supplier_id && a.job_id) setResearchJob(c.id, a.supplier_id, a.job_id, CURRENT_USER.name);
    },
    [c.id],
  );

  // Chat or board, on the same case store. The chat stays mounted while the board is open, so its messages survive.
  const [view, setView] = useCaseView(c.id);
  const ranking = useShortlistRanking(c);
  const step = boardStep(c);
  const [awarding, setAwarding] = useState(false);
  const askInChat = useCallback(
    (q: string) => {
      setView("chat");
      ask.current?.(q);
    },
    [setView],
  );
  const runStep = () => {
    if (step.kind === "advance") advanceTop(c, ranking.order, CURRENT_USER.name);
    else if (step.kind === "award") setAwarding(true);
    else if (step.kind === "memo") askInChat("Show the decision memo");
  };
  const barAction: BarAction | null = view === "board" ? { label: step.label, disabled: step.disabled, run: runStep } : null;

  return (
    <div data-case-screen data-view={view} className={`flex ${FRAME} flex-col overflow-hidden bg-canvas text-ink`}>
      <ProgressBar c={c} next={next} onNext={onNext} view={view} onViewChange={setView} action={barAction} />
      <div className="flex min-h-0 flex-1">
        <ContextRail c={c} part={part} />
        {view === "board" && (
          <CaseBoard c={c} profiles={profiles} ranking={ranking} step={step} onContinue={runStep} onResearch={(id, name) => askInChat(`Research ${name} (${id})`)} />
        )}
        <section aria-label="Assistant" hidden={view !== "chat"} className={view === "chat" ? "flex min-w-0 flex-1 flex-col" : "hidden"}>
          <FilterChips c={c} />
          <ChatPanel
            caseId={c.id}
            variant="page"
            who={`Assistant (${CURRENT_USER.name})`}
            suggestions={suggestions}
            primary={stageNext}
            onNextChange={setModelNext}
            askRef={ask}
            view={chatView}
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
      <AwardDialog c={c} ranked={ranking.order} open={awarding} onClose={() => setAwarding(false)} />
    </div>
  );
}
