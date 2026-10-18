"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Box, Cpu, Disc3, DoorOpen, PanelLeftClose, PanelLeftOpen, Zap, type LucideIcon } from "lucide-react";
import { Avatar, IconButton, Tooltip } from "@/design-system/react";
import { PartThumbnail } from "@/components/train";
import { useTrainUi } from "@/components/train/store";
import { usePeopleInCase, useRecentActivity } from "@/lib/cases/selectors";
import type { SourcingCase } from "@/lib/cases/types";
import { cn } from "@/lib/utils";
import { partById, type TrainPart } from "./case-context";
import { describeLog, groupLabel, relativeTime, stageLabel } from "./case-guide";
import { CURRENT_USER } from "./ui-store";

const GROUP_ICON: Record<string, LucideIcon> = { running_gear: Disc3, traction: Zap, structure: Box, body_systems: DoorOpen, control: Cpu };
const COLLAPSED_KEY = "sri.caseRail.collapsed";
/** The rail fits the 240 x 160 part view plus its 16 px gutters and the 1 px border. */
const THUMB = { width: 240, height: 160 };
const RECENT = 5;

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Re-render once a minute so relative times ("4 min") stay true. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

const eyebrow = "text-2xs font-medium uppercase tracking-wide text-tertiary";

/** Opens the train map with this part selected (the map reads its selection from its own store). */
function useOpenOnMap(partId: string) {
  const router = useRouter();
  return () => {
    useTrainUi.getState().select(partId, { fly: true });
    router.push("/train");
  };
}

/**
 * Left rail of the case screen: the part in 3D (click opens the train map on it), part and group, owner, who is in
 * the case now, the team's recent activity across all cases, and the train map link. Collapses to a 48 px strip;
 * the choice is remembered per browser. Rendered client-only (the case screen waits for the store), so reading
 * localStorage in the initial state does not cause a hydration mismatch.
 */
export function ContextRail({ c, part }: { c: SourcingCase; part?: TrainPart }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const present = usePeopleInCase(c.id).filter((p) => p.name !== CURRENT_USER.name);
  const recent = useRecentActivity(RECENT);
  const now = useMinuteClock();
  const openOnMap = useOpenOnMap(c.partId);
  const down = useRef<{ x: number; y: number } | null>(null);
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
        {present.length > 0 && (
          <span title={`In this case now: ${present.map((p) => p.name).join(", ")}`} className="font-mono text-2xs tabular-nums text-tertiary">
            +{present.length}
          </span>
        )}
      </aside>
    );
  }

  return (
    <aside aria-label="Case" className="flex w-[273px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-subtle bg-surface px-4 py-4">
      <div className="flex flex-col gap-3">
        {/* A drag turns the part; a click (no movement) opens the train map on it. The link below does the same by keyboard. */}
        <div
          data-part-thumbnail
          title="Drag to turn · click to open on the train map"
          className="cursor-pointer"
          onPointerDown={(e) => {
            down.current = { x: e.clientX, y: e.clientY };
          }}
          onClick={(e) => {
            const d = down.current;
            if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
            openOnMap();
          }}
        >
          <PartThumbnail partId={c.partId} size={THUMB} interactive />
        </div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-[-0.03em] text-ink">{part?.label ?? c.partId}</h1>
            <p className="text-xs text-tertiary">{part ? groupLabel(part.group) : "Case"}</p>
          </div>
          <IconButton aria-label="Collapse case panel" size="sm" variant="ghost" onClick={toggle} className="-mr-1.5 shrink-0">
            <PanelLeftClose />
          </IconButton>
        </div>
        {c.owner ? (
          <div className="flex items-center gap-2 text-sm" title={`Owner: ${c.owner.name}, ${c.owner.department}`}>
            <Avatar name={c.owner.name} size="xs" className="rounded-full" />
            <span className="truncate text-ink">{c.owner.name}</span>
            <span className="truncate text-xs text-tertiary">owner</span>
          </div>
        ) : (
          <span className="text-sm text-tertiary">Unassigned</span>
        )}
      </div>

      <section aria-label="In this case now">
        <h2 className={cn(eyebrow, "mb-2")}>In this case now</h2>
        {present.length ? (
          <div className="flex items-center gap-2">
            <ul className="flex -space-x-1.5">
              {present.map((p) => (
                <li key={p.id}>
                  <Tooltip label={`${p.name} · ${p.role}`} side="bottom">
                    <Avatar name={p.name} size="sm" className="rounded-full ring-2 ring-[var(--lw-surface)]" aria-label={p.name} />
                  </Tooltip>
                </li>
              ))}
            </ul>
            <span className="truncate text-xs text-subtext">{present.map((p) => p.name.split(" ")[0]).join(", ")}</span>
          </div>
        ) : (
          <p className="text-xs text-tertiary">Only you</p>
        )}
      </section>

      <section aria-label="Recent activity" className="min-h-0">
        <h2 className={cn(eyebrow, "mb-2")}>Recent</h2>
        <ol className="flex flex-col gap-2.5">
          {recent.map((e, i) => {
            const where = partById(e.partId)?.label ?? e.partId;
            return (
              <li key={`${e.caseId}:${e.at}:${i}`}>
                <Link href={`/cases/${encodeURIComponent(e.caseId)}`} className="group flex gap-2 text-xs leading-snug">
                  <Avatar name={e.who} size="xs" className="mt-px rounded-full" />
                  <span className="min-w-0 text-subtext">
                    <span className="font-medium text-ink">{e.who}</span> {describeLog(e.what)} in{" "}
                    <span className={cn("group-hover:underline", e.caseId === c.id ? "text-subtext" : "text-ink")}>{where}</span>
                    <span className="text-tertiary"> · {relativeTime(e.at, now)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <Link href="/train" onClick={() => useTrainUi.getState().select(c.partId, { fly: true })} className="mt-auto inline-flex items-center gap-1 text-xs text-tertiary hover:text-ink">
        Open train map <ArrowUpRight className="size-3" />
      </Link>
    </aside>
  );
}
