"use client";
import { ArrowRight } from "lucide-react";
import { Button } from "@/design-system/react";
import type { SourcingCase } from "@/lib/cases/types";
import { BlockEnvProvider } from "@/components/ui-blocks/block-context";
import { CandidatesPane } from "@/components/explorer/candidates-pane";
import type { ShortlistRanking } from "@/components/shortlist/ranking";
import { ShortlistPane } from "@/components/shortlist/shortlist-pane";
import type { BoardStep } from "./board-step";
import { useMetadata } from "./case-context";
import type { Profile } from "./domain";
import { CURRENT_USER } from "./ui-store";

/**
 * A case as a classic working view (the Suppliers page), on the same case store as the case chat: candidate pool on
 * the left (40 %), shortlist comparison on the right (60 %), one primary Continue action bottom right with the stage's
 * next step.
 * The pin buttons are the blocks' PinButton, so a pin here is the same write as a pin in a chat block.
 */
export function CaseBoard({
  c,
  profiles,
  ranking,
  step,
  onContinue,
  onResearch,
}: {
  c: SourcingCase;
  profiles: Profile[];
  ranking: ShortlistRanking;
  step: BoardStep;
  onContinue: () => void;
  onResearch: (id: string, name: string) => void;
}) {
  const { meta } = useMetadata();
  const profile = profiles.find((p) => p.profile_id === c.profileId);
  return (
    <BlockEnvProvider caseId={c.id} who={CURRENT_USER.name}>
      <section aria-label="Board" data-case-board className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(22rem,2fr)_minmax(0,3fr)]">
          <CandidatesPane c={c} meta={meta} profile={profile} />
          <div className="flex min-h-0 min-w-0 flex-col border-l border-subtle">
            <ShortlistPane c={c} meta={meta} profiles={profiles} ranking={ranking} onResearch={onResearch} />
          </div>
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-subtle px-5 py-3">
          <Button data-continue variant="primary" size="md" pill trailing={<ArrowRight />} disabled={step.disabled} onClick={onContinue}>
            {step.label}
          </Button>
        </footer>
      </section>
    </BlockEnvProvider>
  );
}
