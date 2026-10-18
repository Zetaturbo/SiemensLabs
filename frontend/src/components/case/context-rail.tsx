"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Box, Cpu, Disc3, DoorOpen, PanelLeftClose, PanelLeftOpen, Zap, type LucideIcon } from "lucide-react";
import { Avatar, IconButton } from "@/design-system/react";
import { stageIndex } from "@/lib/cases/actions";
import type { SourcingCase } from "@/lib/cases/types";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import { cn } from "@/lib/utils";
import type { TrainPart } from "./case-context";
import { STAGE_STEPS, groupLabel, nextStep, stageLabel } from "./case-guide";
import type { FilterResult } from "./domain";
import { TrainSilhouette } from "./train-silhouette";

const GROUP_ICON: Record<string, LucideIcon> = { running_gear: Disc3, traction: Zap, structure: Box, body_systems: DoorOpen, control: Cpu };
const COLLAPSED_KEY = "sri.caseRail.collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-md font-semibold tabular-nums text-ink">{value}</div>
      <div className="text-2xs text-tertiary">{label}</div>
    </div>
  );
}

/**
 * Left rail of the case screen: part, train, stage, three numbers, owner, next step. Collapses to a 48 px strip
 * (part icon + stage dot); the choice is remembered per browser. Rendered client-only (the case screen waits for
 * the store), so reading localStorage in the initial state does not cause a hydration mismatch.
 */
export function ContextRail({ c, part }: { c: SourcingCase; part?: TrainPart }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const matching = useDataTool<FilterResult>("filter_suppliers", { conditions: c.hardRequirements, limit: 1, fields: ["supplier_id"] });
  const total = matching.data?.total_matching;
  const current = stageIndex(c.stage);
  const Icon = (part && GROUP_ICON[part.group]) || Box;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // storage unavailable: the state just is not remembered
    }
  };

  if (collapsed) {
    return (
      <aside aria-label="Case" data-collapsed className="flex w-12 shrink-0 flex-col items-center gap-4 border-r border-subtle bg-surface py-3">
        <IconButton aria-label="Expand case panel" size="sm" variant="ghost" onClick={toggle}>
          <PanelLeftOpen />
        </IconButton>
        <span title={part?.label ?? c.partId} className="text-ink">
          <Icon className="size-4" />
        </span>
        <span title={stageLabel(c.stage)} aria-label={`Stage: ${stageLabel(c.stage)}`} className="relative size-[9px] rounded-full border border-ink">
          <span className="absolute inset-[1.5px] rounded-full bg-ink" />
        </span>
      </aside>
    );
  }

  return (
    <aside aria-label="Case" className="flex w-60 shrink-0 flex-col gap-5 overflow-y-auto border-r border-subtle bg-surface px-4 py-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-2xs font-medium uppercase tracking-wide text-tertiary">{part ? groupLabel(part.group) : "Case"}</p>
            <h1 className="truncate text-lg font-semibold tracking-[-0.03em] text-ink">{part?.label ?? c.partId}</h1>
          </div>
          <IconButton aria-label="Collapse case panel" size="sm" variant="ghost" onClick={toggle} className="-mr-1.5 shrink-0">
            <PanelLeftClose />
          </IconButton>
        </div>
        <TrainSilhouette partId={c.partId} className="mt-3 w-full" />
      </div>

      <ol aria-label="Stages" className="flex flex-col">
        {STAGE_STEPS.map((s, i) => {
          const idx = stageIndex(s.stage);
          const done = idx < current;
          const isCurrent = idx === current;
          return (
            <li key={s.stage} className="relative flex items-center gap-3 py-1" aria-current={isCurrent ? "step" : undefined}>
              {i < STAGE_STEPS.length - 1 && <span aria-hidden className={cn("absolute left-[4.5px] top-[18px] h-[calc(100%-8px)] w-px", done ? "bg-ink" : "bg-line")} />}
              <span
                aria-hidden
                className={cn("relative size-[10px] shrink-0 rounded-full border", done ? "border-ink bg-ink" : isCurrent ? "border-ink bg-surface" : "border-line bg-surface")}
              >
                {isCurrent && <span className="absolute inset-[1.5px] rounded-full bg-ink" />}
              </span>
              <span className={cn("text-sm", isCurrent ? "font-medium text-ink" : "text-tertiary")}>{s.label}</span>
            </li>
          );
        })}
      </ol>

      <div className="grid grid-cols-3 gap-2">
        <Stat value={typeof total === "number" ? total.toLocaleString("en-US") : "–"} label="matching" />
        <Stat value={String(c.shortlist.length)} label="pinned" />
        <Stat value={String(c.finalists.length)} label="finalists" />
      </div>

      <div className="flex flex-col gap-3 text-sm">
        {c.owner ? (
          <div className="flex items-center gap-2">
            <Avatar name={c.owner.name} size="xs" className="rounded-full" />
            <span className="truncate text-ink">{c.owner.name}</span>
          </div>
        ) : (
          <span className="text-tertiary">Unassigned</span>
        )}
        <p className="text-ink">
          <span className="text-tertiary">Next: </span>
          {nextStep(c)}
        </p>
      </div>

      <Link href="/train" className="mt-auto inline-flex items-center gap-1 text-xs text-tertiary hover:text-ink">
        Train map <ArrowUpRight className="size-3" />
      </Link>
    </aside>
  );
}
