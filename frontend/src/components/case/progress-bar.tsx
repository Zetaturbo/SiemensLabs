"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Avatar, Button, SegmentedControl } from "@/design-system/react";
import { stageIndex } from "@/lib/cases/actions";
import type { SourcingCase } from "@/lib/cases/types";
import { useDataTool } from "@/lib/hooks/use-data-tool";
// The train map's stage colours (CSS variables), so a case reads the same on the map and in the case.
import { STAGE_CSS } from "@/components/train/palette";
import { cn } from "@/lib/utils";
import { STAGE_STEPS, logByStage, shortDate, type LogEntry, type LoggedStage } from "./case-guide";
import type { CaseView } from "./case-view";
import type { FilterResult } from "./domain";

/** Ids inside a log line in mono, the rest as text. */
function LogText({ what }: { what: string }) {
  const parts = what.split(/(SUPP_\d{5})/g);
  return (
    <>
      {parts.map((p, i) =>
        /^SUPP_\d{5}$/.test(p) ? (
          <span key={i} className="font-mono text-2xs text-ink">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

const MAX_ENTRIES = 6;

/** Quiet popover under a past stage: who did what there, when, with which ids (newest last). */
function StagePopover({ label, entries, onClose }: { label: string; entries: LogEntry[]; onClose: () => void }) {
  const shown = entries.slice(-MAX_ENTRIES);
  return (
    <div
      role="dialog"
      aria-label={`${label}: what happened`}
      className="absolute left-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-subtle bg-surface p-3 text-xs shadow-lg"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-tertiary">{label}</p>
      {shown.length === 0 ? (
        <p className="text-subtext">Nothing logged in this stage.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {entries.length > shown.length && <li className="text-2xs text-tertiary">{entries.length - shown.length} earlier</li>}
          {shown.map((e, i) => (
            <li key={i} className="flex gap-2">
              <Avatar name={e.who} size="xs" className="mt-px rounded-full" />
              <div className="min-w-0">
                <p className="text-subtext">
                  <span className="font-medium text-ink">{e.who}</span> · {shortDate(e.at)}
                </p>
                <p className="break-words text-subtext">
                  <LogText what={e.what} />
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The board's own next step, shown in the bar instead of the chat's question while the board is open. */
export interface BarAction {
  label: string;
  disabled?: boolean;
  run: () => void;
}

const VIEW_ITEMS: Array<{ value: CaseView; label: string }> = [
  { value: "chat", label: "Chat" },
  { value: "board", label: "Board" },
];

/**
 * The case's stage as a progress bar across the top: four segments filled up to the current stage in that stage's
 * colour (the train map's ramp: blue while in progress, green once awarded), the counts under their segment, the
 * "Next" step as the screen's one primary action and the Chat / Board switch at the right end. In the chat the Next
 * step is a question sent to the chat; on the board it is the board's Continue step (`action`), same text and effect.
 * Past stages open a popover with their part of the case log.
 */
export function ProgressBar({
  c,
  next,
  onNext,
  view,
  onViewChange,
  action,
}: {
  c: SourcingCase;
  next: string;
  onNext: (question: string) => void;
  view: CaseView;
  onViewChange: (view: CaseView) => void;
  action?: BarAction | null;
}) {
  const matching = useDataTool<FilterResult>("filter_suppliers", { conditions: c.hardRequirements, limit: 1, fields: ["supplier_id"] });
  const total = matching.data?.total_matching;
  const current = stageIndex(c.stage);
  const log = useMemo(() => logByStage(c), [c]);
  const [open, setOpen] = useState<LoggedStage | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const counts: Partial<Record<LoggedStage, { value: string; label: string }>> = {
    long_list: { value: typeof total === "number" ? total.toLocaleString("en-US") : "–", label: "matching" },
    shortlist: { value: String(c.shortlist.length), label: "pinned" },
    finalists: { value: String(c.finalists.length), label: c.finalists.length === 1 ? "finalist" : "finalists" },
  };

  return (
    <div ref={root} data-progress-bar className="flex shrink-0 items-center gap-6 border-b border-subtle bg-surface px-4 py-2.5">
      <ol aria-label="Case stages" className="grid min-w-0 flex-1 grid-cols-4 gap-2">
        {STAGE_STEPS.map((s) => {
          const idx = stageIndex(s.stage);
          const filled = idx <= current;
          const isCurrent = idx === current;
          const past = idx < current;
          const count = counts[s.stage];
          const body = (
            <>
              <span
                aria-hidden
                className={cn("block h-1.5 w-full rounded-full transition-colors", !filled && "bg-sunken")}
                style={filled ? { background: STAGE_CSS[c.stage] } : undefined}
              />
              <span className="mt-1.5 flex min-w-0 items-baseline gap-2">
                <span className={cn("truncate text-xs", isCurrent ? "font-medium text-ink" : past ? "text-subtext" : "text-tertiary")}>
                  {s.label}
                  {isCurrent && <span className="sr-only"> (current stage)</span>}
                </span>
                {count && (
                  <span className="shrink-0 text-2xs text-tertiary" title={`${count.value} ${count.label}`}>
                    <span className={cn("font-mono tabular-nums", filled ? "text-subtext" : "text-tertiary")}>{count.value}</span> {count.label}
                  </span>
                )}
              </span>
            </>
          );
          return (
            <li key={s.stage} className="relative min-w-0" aria-current={isCurrent ? "step" : undefined} data-stage={s.stage}>
              {past ? (
                <button
                  type="button"
                  aria-expanded={open === s.stage}
                  aria-haspopup="dialog"
                  title={`What happened in ${s.label.toLowerCase()}`}
                  onClick={() => setOpen((o) => (o === s.stage ? null : s.stage))}
                  className="block w-full rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--lw-focus-ring)] [&:hover>span:first-child]:opacity-80"
                >
                  {body}
                </button>
              ) : (
                <div>{body}</div>
              )}
              {open === s.stage && <StagePopover label={s.label} entries={log[s.stage]} onClose={() => setOpen(null)} />}
            </li>
          );
        })}
      </ol>
      <Button
        data-next-action
        variant="primary"
        size="sm"
        pill
        className="max-w-[40%] shrink-0"
        trailing={<ArrowRight />}
        disabled={action?.disabled}
        onClick={() => (action ? action.run() : onNext(next))}
        title={action ? action.label : `Ask: ${next}`}
      >
        <span className="text-primary-fg/70">Next:</span>
        <span className="truncate">{action ? action.label : next}</span>
      </Button>
      <SegmentedControl size="sm" aria-label="Case view" items={VIEW_ITEMS} value={view} onValueChange={onViewChange} className="shrink-0" />
    </div>
  );
}
