"use client";
import type { ReactNode } from "react";
import { Bookmark, BookmarkCheck, RotateCw } from "lucide-react";
import { Badge, Card, IconButton, Skeleton, Tooltip } from "@/design-system/react";
import { cn } from "@/lib/utils";
import type { Level } from "@/lib/data-api/types";
import { useCases } from "@/lib/cases/store";
import { useResult, type ResultError } from "@/lib/hooks/use-result";
import { useBlockEnv } from "./block-context";
import { levelOf } from "./fields";

export { cn };

/**
 * Risk colors are the only strong colors in the data UI (globals.css --risk-*).
 * Class strings are spelled out so Tailwind sees them.
 */
export const LEVEL_STYLE: Record<Level, { chip: string; bar: string; cell: string; text: string; fill: string }> = {
  Low: {
    chip: "bg-[var(--risk-low-soft)] text-[var(--risk-low)]",
    bar: "bg-[var(--risk-low)]",
    cell: "bg-[var(--risk-low-soft)]",
    text: "text-[var(--risk-low)]",
    fill: "var(--risk-low)",
  },
  Medium: {
    chip: "bg-[var(--risk-medium-soft)] text-[var(--risk-medium)]",
    bar: "bg-[var(--risk-medium)]",
    cell: "bg-[var(--risk-medium-soft)]",
    text: "text-[var(--risk-medium)]",
    fill: "var(--risk-medium)",
  },
  High: {
    chip: "bg-[var(--risk-high-soft)] text-[var(--risk-high)]",
    bar: "bg-[var(--risk-high)]",
    cell: "bg-[var(--risk-high-soft)]",
    text: "text-[var(--risk-high)]",
    fill: "var(--risk-high)",
  },
  Critical: {
    chip: "bg-[var(--risk-critical-soft)] text-[var(--risk-critical)]",
    bar: "bg-[var(--risk-critical)]",
    cell: "bg-[var(--risk-critical-soft)]",
    text: "text-[var(--risk-critical)]",
    fill: "var(--risk-critical)",
  },
};

/** Text colors for "better" / "worse" deltas, reusing the risk scale. */
export const BETTER = "text-[var(--risk-low)]";
export const WORSE = "text-[var(--risk-critical)]";

export function LevelChip({ level, className }: { level: Level | null | undefined; className?: string }) {
  if (!level) return null;
  return (
    <Badge size="sm" className={cn("justify-center font-semibold uppercase tracking-wide", LEVEL_STYLE[level].chip, className)}>
      {level}
    </Badge>
  );
}

/** Inline 0-100 risk bar with faint band ticks at 25/50/75. */
export function RiskBar({ value, level, className, width = "w-24" }: { value: number | null | undefined; level?: Level | null; className?: string; width?: string }) {
  if (typeof value !== "number") return <span className="text-tertiary">–</span>;
  const lv = level ?? levelOf(value) ?? "Low";
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className={cn("relative h-1.5 overflow-hidden rounded-full bg-sunken", width)} aria-hidden>
        <span className={cn("absolute inset-y-0 left-0 rounded-full", LEVEL_STYLE[lv].bar)} style={{ width: `${pct}%` }} />
        {[25, 50, 75].map((t) => (
          <span key={t} className="absolute inset-y-0 w-px bg-surface/80" style={{ left: `${t}%` }} />
        ))}
      </span>
      <span className="tabular w-7 text-right font-mono text-xs">{Number.isInteger(value) ? value : value.toFixed(1)}</span>
    </span>
  );
}

/** Compact block chrome: hairline card, 13 px base, 12 px padding. */
export function BlockFrame({
  title,
  subtitle,
  actions,
  children,
  className,
  block,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  block: string;
}) {
  return (
    <Card data-block={block} radius="lg" className={cn("w-full min-w-0 text-sm", className)}>
      {(title || actions || subtitle) && (
        <header className="flex items-start justify-between gap-3 border-b border-subtle px-3 py-2">
          <div className="min-w-0">
            {title && <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>}
            {subtitle && <p className="text-xs text-subtext">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className="p-3">{children}</div>
    </Card>
  );
}

export function BlockSkeleton({ block, rows = 4, title }: { block: string; rows?: number; title?: string }) {
  return (
    <BlockFrame block={block} title={title}>
      <div className="space-y-2" aria-busy="true" aria-label="Loading result">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 flex-1" />
          </div>
        ))}
      </div>
    </BlockFrame>
  );
}

export function BlockError({ block, error, resultId, onRetry }: { block: string; error?: ResultError; resultId?: string | null; onRetry?: () => void }) {
  return (
    <div data-block={block} role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-subtext">
      <span>
        {error?.expired ? "This result has expired. Ask again to refresh it." : error?.message ?? "Could not load this result."}
        {resultId && <span className="ml-1.5 font-mono text-2xs text-tertiary">{resultId}</span>}
      </span>
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
      <p className="text-xs text-subtext">{message}</p>
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
  return <>{children(r.data)}</>;
}

/** Pin/unpin a supplier on the current case's shortlist (max 20, enforced by the store). */
export function PinButton({ supplierId, className }: { supplierId: string; className?: string }) {
  const { caseId, who } = useBlockEnv();
  const pinned = useCases((s) => (caseId ? s.cases[caseId]?.shortlist.includes(supplierId) ?? false : false));
  const full = useCases((s) => (caseId ? (s.cases[caseId]?.shortlist.length ?? 0) >= 20 : false));
  const hasCase = useCases((s) => (caseId ? Boolean(s.cases[caseId]) : false));
  const pin = useCases((s) => s.pin);
  const unpin = useCases((s) => s.unpin);
  const disabled = !caseId || !hasCase || (!pinned && full);
  const label = !caseId || !hasCase ? "Open a sourcing case to pin" : pinned ? "Remove from shortlist" : full ? "Shortlist is full (20)" : "Pin to shortlist";
  return (
    <Tooltip label={label} side="left">
      <IconButton
        aria-label={label}
        aria-pressed={pinned}
        size="sm"
        variant={pinned ? "primary" : "ghost"}
        disabled={disabled}
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          if (!caseId) return;
          if (pinned) unpin(caseId, supplierId, who);
          else pin(caseId, supplierId, who);
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

/** Small uppercase section label inside a block. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mb-1 text-2xs font-medium uppercase tracking-wide text-tertiary", className)}>{children}</p>;
}

/** Monospace tabular number. */
export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("tabular font-mono", className)}>{children}</span>;
}
