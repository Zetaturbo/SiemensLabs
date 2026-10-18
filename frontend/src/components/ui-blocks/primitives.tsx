"use client";
import type { ReactNode } from "react";
import { Bookmark, BookmarkCheck, RotateCw } from "lucide-react";
import { Card, IconButton, Skeleton, Tooltip } from "@/design-system/react";
import { cn } from "@/lib/utils";
import type { Level } from "@/lib/data-api/types";
import { pinToShortlist } from "@/lib/cases/actions";
import { useCases } from "@/lib/cases/store";
import { useResult, type ResultError } from "@/lib/hooks/use-result";
import { ReportVisible, useBlockEnv } from "./block-context";
import { levelOf } from "./fields";

export { cn };

/**
 * Minimal block primitives. Rules every block follows:
 * - one title line in the base size, no subtitle; provenance goes into the quiet corner dot (InfoDot);
 * - text never below text-sm (the design system's small size); numbers in Geist Mono (Num);
 * - risk levels as a colour dot plus the word (LevelDot), colours only via --risk-*;
 * - at most two quiet actions per block; per-row actions appear on hover (PinButton reveal).
 */
export const LEVEL_STYLE: Record<Level, { bar: string; text: string; fill: string }> = {
  Low: { bar: "bg-[var(--risk-low)]", text: "text-[var(--risk-low)]", fill: "var(--risk-low)" },
  Medium: { bar: "bg-[var(--risk-medium)]", text: "text-[var(--risk-medium)]", fill: "var(--risk-medium)" },
  High: { bar: "bg-[var(--risk-high)]", text: "text-[var(--risk-high)]", fill: "var(--risk-high)" },
  Critical: { bar: "bg-[var(--risk-critical)]", text: "text-[var(--risk-critical)]", fill: "var(--risk-critical)" },
};

/** A small round marker (risk level, best value, status). */
export function Dot({ fill, className, label }: { fill: string; className?: string; label?: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ background: fill }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

/** Risk level as a colour dot plus the word (no filled pill). */
export function LevelDot({ level, label, className }: { level: Level | null | undefined; label?: ReactNode; className?: string }) {
  if (!level) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-ink", className)}>
      <Dot fill={LEVEL_STYLE[level].fill} />
      {label ?? level}
    </span>
  );
}

/** Kept for older imports: the level chip is now a dot plus the word. */
export const LevelChip = LevelDot;

/** Monospace tabular number. */
export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("tabular font-mono", className)}>{children}</span>;
}

/** 0-100 bar in the level colour, followed by the number in Geist Mono. */
export function RiskBar({
  value,
  level,
  className,
  width = "w-24",
  digits,
}: {
  value: number | null | undefined;
  level?: Level | null;
  className?: string;
  width?: string;
  digits?: number;
}) {
  if (typeof value !== "number") return <span className="text-sm text-tertiary">–</span>;
  const lv = level ?? levelOf(value) ?? "Low";
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <span className={cn("relative h-1.5 overflow-hidden rounded-full bg-sunken", width)} aria-hidden>
        <span className={cn("absolute inset-y-0 left-0 min-w-0.5 rounded-full", LEVEL_STYLE[lv].bar)} style={{ width: `${pct}%` }} />
      </span>
      <Num className="w-10 text-right text-sm text-ink">{digits !== undefined ? value.toFixed(digits) : Number.isInteger(value) ? value : value.toFixed(1)}</Num>
    </span>
  );
}

/** The single quiet dot in a block's corner; hover or focus shows the note. */
export function InfoDot({ note, tone = "neutral" }: { note: ReactNode; tone?: "neutral" | "warning" }) {
  return (
    <Tooltip label={note} side="left" className="w-72 whitespace-normal text-left text-sm font-normal leading-snug">
      <button
        type="button"
        aria-label={typeof note === "string" ? note : "About this result"}
        className="flex size-6 shrink-0 items-center justify-center rounded-full outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-[var(--lw-focus-ring)]"
      >
        <span className={cn("size-1.5 rounded-full", tone === "warning" ? "bg-[var(--risk-high)]" : "bg-placeholder")} aria-hidden />
      </button>
    </Tooltip>
  );
}

/**
 * Block chrome: a hairline card with one title line in the base size, an optional quiet dot in the
 * corner that carries provenance in a tooltip (source, method, query, caveats), and at most two quiet actions.
 * The card is a container, so a block adapts to the column it is rendered in (@md:, @lg:).
 */
export function BlockFrame({
  title,
  note,
  noteTone = "neutral",
  actions,
  children,
  className,
  block,
}: {
  title?: ReactNode;
  /** Provenance or a caveat, shown on hover over a quiet dot in the corner. */
  note?: ReactNode;
  noteTone?: "neutral" | "warning";
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  block: string;
}) {
  const header = Boolean(title || actions || note);
  return (
    <Card data-block={block} radius="lg" className={cn("@container w-full min-w-0 text-sm text-ink", className)}>
      {header && (
        <header className="flex min-h-12 items-center gap-2 px-4 pt-3">
          <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-ink" title={typeof title === "string" ? title : undefined}>
            {title}
          </h3>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
          {note && <InfoDot note={note} tone={noteTone} />}
        </header>
      )}
      <div className={cn("px-4 pb-4", header ? "pt-2" : "pt-4")}>{children}</div>
    </Card>
  );
}

/** Quiet text button for "Show all", "More columns" and similar toggles. */
export function MoreButton({ children, onClick, className }: { children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("mt-2 rounded-md text-sm font-medium text-subtext outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-[var(--lw-focus-ring)]", className)}
    >
      {children}
    </button>
  );
}

export function BlockSkeleton({ block, rows = 4, title }: { block: string; rows?: number; title?: string }) {
  return (
    <BlockFrame block={block} title={title}>
      <div className="space-y-3" aria-busy="true" aria-label="Loading result">
        {Array.from({ length: Math.min(rows, 5) }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3.5 flex-1" />
          </div>
        ))}
      </div>
    </BlockFrame>
  );
}

export function BlockError({ block, error, resultId, onRetry }: { block: string; error?: ResultError; resultId?: string | null; onRetry?: () => void }) {
  return (
    <div
      data-block={block}
      role="alert"
      title={resultId ?? undefined}
      className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-sm text-subtext"
    >
      <span>{error?.expired ? "This result has expired. Ask again to refresh it." : error?.message ?? "Could not load this result."}</span>
      {onRetry && !error?.expired && (
        <IconButton aria-label="Retry" size="sm" onClick={onRetry}>
          <RotateCw />
        </IconButton>
      )}
    </div>
  );
}

export function BlockEmpty({ block, title, message }: { block: string; title?: string; message: string }) {
  return (
    <BlockFrame block={block} title={title}>
      <p className="text-sm text-subtext">{message}</p>
    </BlockFrame>
  );
}

/**
 * Loading/error gate shared by all blocks: fetches by handle (or uses `data`), shows a skeleton
 * while loading and a small error state if the handle expired, then renders children(data).
 */
export function WithResult<T>({
  block,
  resultId,
  data,
  title,
  skeletonRows,
  pollMs,
  pollWhile,
  children,
}: {
  block: string;
  resultId?: string | null;
  data?: T;
  title?: string;
  skeletonRows?: number;
  /** Poll live results (research jobs) while pollWhile(data) is true. */
  pollMs?: number;
  pollWhile?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  const r = useResult<T>(resultId, { data, pollMs, pollWhile });
  if (r.status === "error") return <BlockError block={block} error={r.error} resultId={resultId} onRetry={r.refresh} />;
  if (r.data === undefined || r.data === null) {
    if (!resultId && data === undefined) return <BlockError block={block} resultId={null} />;
    return <BlockSkeleton block={block} rows={skeletonRows} title={title} />;
  }
  return (
    <>
      {children(r.data)}
      <ReportVisible block={block} resultId={resultId} data={r.data} />
    </>
  );
}

/** Pin/unpin a supplier on the current case's shortlist (max 20, enforced by the store). */
export function PinButton({
  supplierId,
  className,
  reveal,
}: {
  supplierId: string;
  className?: string;
  /** Row action: hidden until the row (a `group`) is hovered; stays visible once pinned. */
  reveal?: boolean;
}) {
  const { caseId, who } = useBlockEnv();
  const pinned = useCases((s) => (caseId ? s.cases[caseId]?.shortlist.includes(supplierId) ?? false : false));
  const full = useCases((s) => (caseId ? (s.cases[caseId]?.shortlist.length ?? 0) >= 20 : false));
  const hasCase = useCases((s) => (caseId ? Boolean(s.cases[caseId]) : false));
  const unpin = useCases((s) => s.unpin);
  const disabled = !caseId || !hasCase || (!pinned && full);
  const label = !caseId || !hasCase ? "Open a sourcing case to pin" : pinned ? "Remove from shortlist" : full ? "Shortlist is full (20)" : "Pin to shortlist";
  return (
    <Tooltip label={label} side="left" className="text-sm">
      <IconButton
        aria-label={label}
        aria-pressed={pinned}
        size="sm"
        variant="ghost"
        disabled={disabled}
        className={cn(
          pinned && "text-ink",
          !pinned && "text-tertiary hover:text-ink",
          reveal && !pinned && "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
          className,
        )}
        onClick={(e) => {
          e.stopPropagation();
          if (!caseId) return;
          if (pinned) unpin(caseId, supplierId, who);
          else pinToShortlist(caseId, supplierId, who);
        }}
      >
        {pinned ? <BookmarkCheck /> : <Bookmark />}
      </IconButton>
    </Tooltip>
  );
}

export function SupplierLink({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const { dispatch } = useBlockEnv();
  return (
    <button
      type="button"
      onClick={() => dispatch({ type: "open_supplier", id })}
      className={cn("min-w-0 truncate text-left text-ink underline-offset-2 hover:underline", className)}
      title={`Open ${id}`}
    >
      {children}
    </button>
  );
}
