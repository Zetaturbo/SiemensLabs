"use client";
import type { ReactNode } from "react";
import type { Envelope } from "@/lib/data-api/types";
import { isLevel, levelOf, type Level } from "./domain";

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

// Shared surface tokens (light + dark) so every screen reads as one system.
export const ui = {
  panel: "rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
  subtle: "bg-zinc-50 dark:bg-zinc-900/60",
  border: "border-zinc-200 dark:border-zinc-800",
  muted: "text-zinc-500 dark:text-zinc-400",
  faint: "text-zinc-400 dark:text-zinc-500",
  input:
    "rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100",
  btn: "inline-flex items-center justify-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
  btnPrimary:
    "inline-flex items-center justify-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40",
  btnDanger:
    "inline-flex items-center justify-center gap-1 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950",
  btnGhost:
    "inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800",
  th: "px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400",
  td: "px-2 py-1.5",
};

const LEVEL_CHIP: Record<Level, string> = {
  Low: "bg-emerald-100 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20",
  Medium: "bg-amber-100 text-amber-900 ring-amber-600/20 dark:bg-amber-400/15 dark:text-amber-200 dark:ring-amber-300/20",
  High: "bg-orange-100 text-orange-900 ring-orange-600/20 dark:bg-orange-500/20 dark:text-orange-200 dark:ring-orange-400/20",
  Critical: "bg-red-100 text-red-800 ring-red-600/20 dark:bg-red-600/25 dark:text-red-200 dark:ring-red-400/30",
};

/** Heatmap cell fills by level (text stays in ink colors). */
export const LEVEL_CELL: Record<Level, string> = {
  Low: "bg-emerald-500/15 dark:bg-emerald-500/20",
  Medium: "bg-amber-400/25 dark:bg-amber-400/20",
  High: "bg-orange-500/30 dark:bg-orange-500/30",
  Critical: "bg-red-600/40 dark:bg-red-600/45",
};

const LEVEL_MARK: Record<Level, string> = { Low: "○", Medium: "◐", High: "◕", Critical: "●" };

/** A score with its level as background fill (heatmap style); the level name is in the tooltip. */
export function ScoreCell({ value, level, label, className }: { value: unknown; level?: unknown; label?: string; className?: string }) {
  const v = typeof value === "number" ? value : null;
  const l: Level | null = isLevel(level) ? level : levelOf(v);
  if (v === null) return <span className={ui.faint}>–</span>;
  return (
    <span
      className={cx("inline-block min-w-[2.25rem] rounded px-1 py-0.5 text-center tabular-nums", l ? LEVEL_CELL[l] : "", className)}
      title={`${label ? `${label}: ` : ""}${Math.round(v)}${l ? ` (${l})` : ""}`}
    >
      {Math.round(v)}
      {l === "Critical" && <span aria-hidden className="ml-0.5 text-[9px]">●</span>}
    </span>
  );
}

export function LevelChip({ level, score, className }: { level?: unknown; score?: number | null; className?: string }) {
  const l: Level | null = isLevel(level) ? level : levelOf(score ?? null);
  if (!l && (score === null || score === undefined)) return <span className={ui.faint}>–</span>;
  return (
    <span
      className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums ring-1 ring-inset", l ? LEVEL_CHIP[l] : "bg-zinc-100 text-zinc-700 ring-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700", className)}
      title={l ?? undefined}
    >
      {l && <span aria-hidden>{LEVEL_MARK[l]}</span>}
      {score !== null && score !== undefined ? <span>{Math.round(score)}</span> : null}
      <span>{l ?? ""}</span>
    </span>
  );
}

export function Badge({ children, tone = "neutral", className, title }: { children: ReactNode; tone?: "neutral" | "blue" | "green" | "amber" | "red" | "violet"; className?: string; title?: string }) {
  const tones = {
    neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
    green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200",
    red: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
    violet: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
  };
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-label="loading" className={cx("inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600 dark:border-zinc-700 dark:border-t-blue-400", className)} />;
}

export function ErrorNote({ error, what }: { error: Envelope<unknown>["error"]; what?: string }) {
  if (!error) return null;
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
      {what ? <strong className="font-medium">{what}: </strong> : null}
      {error.message} <span className="opacity-60">({error.code})</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className={cx("rounded-md border border-dashed px-3 py-6 text-center text-xs", ui.border, ui.muted)}>{children}</div>;
}

export function SectionTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-2 flex items-center justify-between gap-2", className)}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">{children}</h3>
      {right}
    </div>
  );
}

export function MockBadge({ meta }: { meta: Record<string, unknown> | undefined }) {
  const src = typeof meta?.source === "string" ? meta.source : null;
  if (!src?.startsWith("mock")) return null;
  return (
    <Badge tone="violet" title={`Answered by the dev mock engine (${src}). Values are from the dataset, counts depend on the pool.`}>
      {src.includes("csv") ? "mock: dataset CSV" : src.includes("fixtures") ? "mock: fixtures" : "mock"}
    </Badge>
  );
}
