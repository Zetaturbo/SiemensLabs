"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Avatar } from "@/design-system/react";
import { stageIndex } from "@/lib/cases/actions";
import type { SourcingCase } from "@/lib/cases/types";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import { cn } from "@/lib/utils";
import type { TrainPart } from "./case-context";
import { STAGE_STEPS, groupLabel, nextStep } from "./case-guide";
import type { FilterResult } from "./domain";
import { TrainSilhouette } from "./train-silhouette";

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-lg font-semibold tabular-nums tracking-[-0.02em] text-ink">{value}</div>
      <div className="text-2xs text-tertiary">{label}</div>
    </div>
  );
}

/** Left rail of the case screen: part, train, stage, three numbers, owner, next step. Nothing else. */
export function ContextRail({ c, part }: { c: SourcingCase; part?: TrainPart }) {
  const matching = useDataTool<FilterResult>("filter_suppliers", { conditions: c.hardRequirements, limit: 1, fields: ["supplier_id"] });
  const total = matching.data?.total_matching;
  const current = stageIndex(c.stage);

  return (
    <aside aria-label="Case" className="flex w-[300px] shrink-0 flex-col gap-6 overflow-y-auto border-r border-subtle bg-surface px-5 py-5">
      <div>
        <p className="text-2xs font-medium uppercase tracking-wide text-tertiary">{part ? groupLabel(part.group) : "Sourcing case"}</p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-[-0.03em] text-ink">{part?.label ?? c.partId}</h1>
        <TrainSilhouette partId={c.partId} className="mt-3 w-full" />
      </div>

      <ol aria-label="Stages" className="flex flex-col">
        {STAGE_STEPS.map((s, i) => {
          const idx = stageIndex(s.stage);
          const done = idx < current;
          const isCurrent = idx === current;
          return (
            <li key={s.stage} className="relative flex items-center gap-3 py-1.5" aria-current={isCurrent ? "step" : undefined}>
              {i < STAGE_STEPS.length - 1 && <span aria-hidden className={cn("absolute left-[5px] top-[22px] h-[calc(100%-10px)] w-px", done ? "bg-ink" : "bg-line")} />}
              <span
                aria-hidden
                className={cn(
                  "relative size-[11px] shrink-0 rounded-full border",
                  done ? "border-ink bg-ink" : isCurrent ? "border-ink bg-surface ring-[3px] ring-[var(--lw-focus-ring)]" : "border-line bg-surface",
                )}
              >
                {isCurrent && <span className="absolute inset-[2px] rounded-full bg-ink" />}
              </span>
              <span className={cn("text-sm", isCurrent ? "font-semibold text-ink" : done ? "text-subtext" : "text-tertiary")}>{s.label}</span>
            </li>
          );
        })}
      </ol>

      <div className="grid grid-cols-3 gap-3 border-y border-subtle py-4">
        <Stat value={typeof total === "number" ? total.toLocaleString("en-US") : "–"} label="matching" />
        <Stat value={String(c.shortlist.length)} label="pinned" />
        <Stat value={String(c.finalists.length)} label="finalists" />
      </div>

      <div className="flex flex-col gap-3 text-sm">
        {c.owner ? (
          <div className="flex items-center gap-2">
            <Avatar name={c.owner.name} size="sm" className="rounded-full" />
            <div className="min-w-0 leading-tight">
              <div className="truncate font-medium text-ink">{c.owner.name}</div>
              <div className="truncate text-xs text-tertiary">{c.owner.department}</div>
            </div>
          </div>
        ) : (
          <div className="text-subtext">Unassigned</div>
        )}
        <p className="text-ink">
          <span className="text-tertiary">Next: </span>
          {nextStep(c)}
        </p>
      </div>

      <Link href="/train" className="mt-auto inline-flex items-center gap-1 text-xs text-tertiary hover:text-ink">
        Open train map <ArrowUpRight className="size-3" />
      </Link>
    </aside>
  );
}
