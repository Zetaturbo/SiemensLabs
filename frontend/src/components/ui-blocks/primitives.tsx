"use client";
import type { ReactNode } from "react";
import type { Level } from "@/lib/data-api/types";
import { useCases } from "@/lib/cases/store";
import { useResult, type ResultError } from "@/lib/hooks/use-result";
import { useBlockEnv } from "./block-context";
import { levelOf } from "./fields";

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

export const LEVEL_STYLE: Record<Level, { chip: string; bar: string; cell: string; text: string }> = {
  Low: {
    chip: "bg-emerald-500/15 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300",
    bar: "bg-emerald-500",
    cell: "bg-emerald-500/10 dark:bg-emerald-500/15",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  Medium: {
    chip: "bg-amber-400/20 text-amber-800 ring-amber-500/30 dark:text-amber-200",
    bar: "bg-amber-400",
    cell: "bg-amber-400/15 dark:bg-amber-400/15",
    text: "text-amber-800 dark:text-amber-200",
  },
  High: {
    chip: "bg-orange-500/15 text-orange-800 ring-orange-500/30 dark:text-orange-300",
    bar: "bg-orange-500",
    cell: "bg-orange-500/15 dark:bg-orange-500/20",
    text: "text-orange-800 dark:text-orange-300",
  },
  Critical: {
    chip: "bg-red-500/15 text-red-700 ring-red-500/30 dark:text-red-300",
    bar: "bg-red-500",
    cell: "bg-red-500/15 dark:bg-red-500/25",
    text: "text-red-700 dark:text-red-300",
  },
};

export function LevelChip({ level, className }: { level: Level | null | undefined; className?: string }) {
  if (!level) return null;
  return (
    <span className={cx("inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset", LEVEL_STYLE[level].chip, className)}>
      {level}
    </span>
  );
}

/** Inline 0-100 risk bar with faint band ticks at 25/50/75. */
export function RiskBar({ value, level, className, width = "w-24" }: { value: number | null | undefined; level?: Level | null; className?: string; width?: string }) {
  if (typeof value !== "number") return <span className="text-zinc-400">–</span>;
  const lv = level ?? levelOf(value) ?? "Low";
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <span className={cx("relative h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800", width)} aria-hidden>
        <span className={cx("absolute inset-y-0 left-0 rounded-full", LEVEL_STYLE[lv].bar)} style={{ width: `${pct}%` }} />
        {[25, 50, 75].map((t) => (
          <span key={t} className="absolute inset-y-0 w-px bg-white/70 dark:bg-zinc-950/70" style={{ left: `${t}%` }} />
        ))}
      </span>
      <span className="w-7 text-right font-mono text-xs tabular-nums">{Number.isInteger(value) ? value : value.toFixed(1)}</span>
    </span>
  );
}

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
    <section
      data-block={block}
      className={cx("w-full min-w-0 rounded-lg border border-zinc-200 bg-white text-sm text-zinc-900 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100", className)}
    >
      {(title || actions || subtitle) && (
        <header className="flex items-start justify-between gap-3 border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
          <div className="min-w-0">
            {title && <h3 className="truncate text-[13px] font-semibold leading-5">{title}</h3>}
            {subtitle && <p className="text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}

export function BlockSkeleton({ block, rows = 4, title }: { block: string; rows?: number; title?: string }) {
  return (
    <BlockFrame block={block} title={title}>
      <div className="animate-pulse space-y-2" aria-busy="true" aria-label="Loading result">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-3 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-3 flex-1 rounded bg-zinc-100 dark:bg-zinc-800/60" />
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
      className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
    >
      <span>
        {error?.expired ? "This result has expired." : error?.message ?? "Could not load this result."}
        {resultId && <span className="ml-1 font-mono text-[10px] text-zinc-400">{resultId}</span>}
      </span>
      {onRetry && !error?.expired && (
        <button type="button" onClick={onRetry} className="rounded px-2 py-0.5 font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800">
          Retry
        </button>
      )}
    </div>
  );
}

export function BlockEmpty({ block, title, message }: { block: string; title?: string; message: string }) {
  return (
    <BlockFrame block={block} title={title}>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{message}</p>
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
  children,
}: {
  block: string;
  resultId?: string | null;
  data?: T;
  title?: string;
  skeletonRows?: number;
  children: (data: T) => ReactNode;
}) {
  const r = useResult<T>(resultId, { data });
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
  const title = !caseId || !hasCase ? "Open a sourcing case to pin suppliers" : pinned ? "Remove from shortlist" : full ? "Shortlist is full (20)" : "Pin to shortlist";
  return (
    <button
      type="button"
      title={title}
      aria-pressed={pinned}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!caseId) return;
        if (pinned) unpin(caseId, supplierId, who);
        else pin(caseId, supplierId, who);
      }}
      className={cx(
        "inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium ring-1 ring-inset transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        pinned
          ? "bg-sky-600 text-white ring-sky-600 hover:bg-sky-700"
          : "text-zinc-600 ring-zinc-300 hover:bg-zinc-100 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800",
        className,
      )}
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M4 2.5h8v11L8 10.5l-4 3z" strokeLinejoin="round" />
      </svg>
      {pinned ? "Pinned" : "Pin"}
    </button>
  );
}

export function SmallButton({ children, onClick, title, disabled }: { children: ReactNode; onClick: () => void; title?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}

export function SupplierLink({ id, children }: { id: string; children: ReactNode }) {
  const { dispatch } = useBlockEnv();
  return (
    <button
      type="button"
      onClick={() => dispatch({ type: "open_supplier", id })}
      className="min-w-0 truncate text-left hover:underline"
      title={`Open ${id}`}
    >
      {children}
    </button>
  );
}
