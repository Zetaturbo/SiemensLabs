"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Button, Select, Tooltip, buttonVariants } from "@/design-system/react";
import { startCasePersistence } from "@/lib/cases/actions";
import { useCases } from "@/lib/cases/store";
import type { SourcingCase } from "@/lib/cases/types";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import { AwardDialog } from "@/components/case/award-dialog";
import { MIN_PINNED, advanceTop, boardStep } from "@/components/case/board-step";
import { PARTS, partById, useMetadata, useProfiles } from "@/components/case/case-context";
import { stageLabel } from "@/components/case/case-guide";
import { Spinner } from "@/components/case/primitives";
import { CURRENT_USER } from "@/components/case/ui-store";
import { CandidatesPane } from "@/components/explorer/candidates-pane";
import { useShortlistRanking } from "@/components/shortlist/ranking";
import { ShortlistPane } from "@/components/shortlist/shortlist-pane";
import { BlockEnvProvider } from "@/components/ui-blocks/block-context";

// Whether the saved cases have been restored in this tab (startCasePersistence is idempotent).
let restored = false;
const listeners = new Set<() => void>();
function restoreCases() {
  startCasePersistence();
  if (restored) return;
  restored = true;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const nf = new Intl.NumberFormat("en-US");
const STATS_INPUT = { fields: ["total_risk_index"], conditions: [] };

/** The dataset at a glance as one quiet line: suppliers and weighting profiles. */
function DatasetLine() {
  const stats = useDataTool<{ stats?: Array<{ field: string; count?: number; level_counts?: Record<string, number> | null }> }>("get_dataset_stats", STATS_INPUT);
  const profiles = useDataTool<{ profiles?: unknown[] }>("list_profiles", {});
  const tri = stats.data?.stats?.find((s) => s.field === "total_risk_index");
  const suppliers = tri?.count ?? (tri?.level_counts ? Object.values(tri.level_counts).reduce((a, b) => a + b, 0) : null);
  const nProfiles = profiles.data?.profiles?.length ?? null;
  return (
    <p className="mt-1 text-base text-subtext">
      <span className="font-mono tabular-nums text-ink">{suppliers === null ? "–" : nf.format(suppliers)}</span> suppliers in the dataset ·{" "}
      <span className="font-mono tabular-nums text-ink">{nProfiles ?? "–"}</span> weighting profiles
    </p>
  );
}

const caseHref = (id: string, ask?: string) => `/cases/${encodeURIComponent(id)}${ask ? `?ask=${encodeURIComponent(ask)}` : ""}`;

/**
 * /suppliers: the classic working view, the backup to the case chat. A case picker (the 13 sourcing cases; `?case=<id>`,
 * else the most recently updated), then the board for that case: candidates on the left, the shortlist comparison on the
 * right, Continue with the stage's next step. Everything writes to the case store, so the case chat shows the same pins,
 * filters and stage. Research and the decision memo open the case's chat with the question (`?ask=`).
 */
export function SuppliersBoard() {
  const ready = useSyncExternalStore(subscribe, () => restored, () => false);
  const cases = useCases((s) => s.cases);
  const params = useSearchParams();

  useEffect(() => {
    restoreCases();
  }, []);

  const options = useMemo(
    () =>
      Object.values(cases)
        .sort((a, b) => PARTS.findIndex((p) => p.id === a.partId) - PARTS.findIndex((p) => p.id === b.partId))
        .map((c) => ({ value: c.id, label: `${partById(c.partId)?.label ?? c.partId} · ${stageLabel(c.stage)}` })),
    [cases],
  );
  const fromUrl = params.get("case");
  const mostRecent = useMemo(() => Object.values(cases).reduce<SourcingCase | null>((m, c) => (!m || c.updatedAt > m.updatedAt ? c : m), null)?.id ?? null, [cases]);
  // The default is fixed once per visit, so pinning in another case does not swap the board under the buyer.
  const [initial] = useState(() => mostRecent);
  // A pick wins until the URL names another case (a link, back and forward).
  const [picked, setPicked] = useState<{ id: string; url: string | null } | null>(null);
  const chosen = picked && picked.url === fromUrl ? picked.id : null;
  const caseId = (chosen && cases[chosen] ? chosen : null) ?? (fromUrl && cases[fromUrl] ? fromUrl : initial && cases[initial] ? initial : mostRecent);
  const c = caseId ? cases[caseId] : undefined;

  const pick = (id: string) => {
    setPicked({ id, url: fromUrl });
    const url = new URL(window.location.href);
    url.searchParams.set("case", id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  return (
    <div data-suppliers-board className="flex flex-col bg-canvas">
      <header className="flex shrink-0 flex-col gap-4 px-8 pb-4 pt-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.015em] text-ink">Suppliers</h1>
          <DatasetLine />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select size="md" align="start" aria-label="Sourcing case" options={options} value={caseId ?? undefined} onValueChange={pick} placeholder="Choose a case" className="min-w-72" />
          {c && (
            <Link href={caseHref(c.id)} className={buttonVariants({ variant: "secondary", size: "md" })}>
              Open the case chat <ArrowUpRight className="size-4 text-subtext" />
            </Link>
          )}
        </div>
      </header>
      {/* A fixed height, so the panes scroll inside the frame, their headers stay put and Continue stays in view. */}
      <div className="mx-8 mb-8 flex h-[max(34rem,calc(100dvh-14.5rem))] shrink-0 overflow-hidden rounded-xl border border-subtle">
        {!ready || !c ? (
          <div className="flex flex-1 items-center justify-center gap-2 bg-surface text-base text-subtext">
            <Spinner /> {ready ? "No sourcing case" : "Loading cases"}
          </div>
        ) : (
          <CaseBoardFor key={c.id} c={c} />
        )}
      </div>
    </div>
  );
}

function CaseBoardFor({ c }: { c: SourcingCase }) {
  const router = useRouter();
  const { profiles } = useProfiles();
  const { meta } = useMetadata();
  const profile = profiles.find((p) => p.profile_id === c.profileId);
  const ranking = useShortlistRanking(c);
  const step = boardStep(c);
  const [awarding, setAwarding] = useState(false);
  const openChat = useCallback((ask: string) => router.push(caseHref(c.id, ask)), [router, c.id]);
  const onContinue = () => {
    if (step.kind === "advance") advanceTop(c, ranking.order, CURRENT_USER.name);
    else if (step.kind === "award") setAwarding(true);
    else if (step.kind === "memo") openChat("Show the decision memo");
  };
  const continueButton = (
    <Button data-continue variant="primary" size="md" pill trailing={<ArrowRight />} disabled={step.disabled} onClick={onContinue}>
      {step.label}
    </Button>
  );
  return (
    <>
      <BlockEnvProvider caseId={c.id} who={CURRENT_USER.name}>
        <section aria-label="Board" data-case-board className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
          <div className="grid min-h-0 flex-1 grid-cols-2">
            <CandidatesPane c={c} meta={meta} profile={profile} />
            <div className="flex min-h-0 min-w-0 flex-col border-l border-subtle">
              <ShortlistPane c={c} meta={meta} profiles={profiles} ranking={ranking} onResearch={(id, name) => openChat(`Research ${name} (${id})`)} />
            </div>
          </div>
          <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-subtle px-4 py-3">
            {step.disabled ? (
              <Tooltip label={`Pin at least ${MIN_PINNED} suppliers to continue`} side="left" className="text-sm font-normal">
                {continueButton}
              </Tooltip>
            ) : (
              continueButton
            )}
          </footer>
        </section>
      </BlockEnvProvider>
      <AwardDialog c={c} ranked={ranking.order} open={awarding} onClose={() => setAwarding(false)} />
    </>
  );
}
