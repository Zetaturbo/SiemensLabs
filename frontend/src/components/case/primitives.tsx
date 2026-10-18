"use client";
import type { ReactNode } from "react";
import { Alert, Badge, Spinner as DsSpinner } from "@/design-system/react";
import type { Envelope } from "@/lib/data-api/types";
import { cn } from "@/lib/utils";
import { LEVEL_VAR } from "./chart-theme";
import { isLevel, levelOf, type Level } from "./domain";

export { cn as cx };

/** Class tokens on top of the design system, so every case screen reads as one system. */
export const ui = {
  muted: "text-subtext",
  faint: "text-tertiary",
  border: "border-subtle",
  subtle: "bg-sunken",
  panel: "rounded-xl border border-subtle bg-surface",
  eyebrow: "text-2xs font-medium uppercase tracking-wide text-tertiary",
  num: "font-mono tabular-nums",
  input:
    "h-8 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink outline-none transition-colors placeholder:text-placeholder hover:border-strong focus:border-brand focus:ring-2 focus:ring-[var(--lw-focus-ring)]",
};

/** Risk level as a soft chip: score (mono) and level name. */
export function LevelChip({ level, score, className, size = "sm" }: { level?: unknown; score?: number | null; className?: string; size?: "sm" | "md" }) {
  const l: Level | null = isLevel(level) ? level : levelOf(score ?? null);
  if (!l && (score === null || score === undefined)) return <span className={ui.faint}>–</span>;
  const c = l ? LEVEL_VAR[l] : null;
  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md font-medium", size === "sm" ? "h-5 px-1.5 text-2xs" : "h-6 px-2 text-xs", !c && "bg-sunken text-subtext", className)}
      style={c ? { background: c.bg, color: c.fg } : undefined}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {score !== null && score !== undefined ? <span className="font-mono tabular-nums">{Math.round(score)}</span> : null}
      {l ? <span>{l}</span> : null}
    </span>
  );
}

/** A score with its level as soft background fill (heatmap style); level name in the tooltip. */
export function ScoreCell({ value, level, label, className, emphasis }: { value: unknown; level?: unknown; label?: string; className?: string; emphasis?: "best" | "worst" }) {
  const v = typeof value === "number" ? value : null;
  const l: Level | null = isLevel(level) ? level : levelOf(v);
  if (v === null) return <span className={ui.faint}>–</span>;
  const c = l ? LEVEL_VAR[l] : null;
  return (
    <span
      className={cn(
        "inline-flex min-w-[2.25rem] items-center justify-center rounded-md px-1 py-0.5 font-mono text-xs tabular-nums text-ink",
        emphasis === "best" && "ring-1 ring-inset ring-[var(--risk-low)]",
        emphasis === "worst" && "ring-1 ring-inset ring-[var(--risk-critical)]",
        className,
      )}
      style={c ? { background: c.bg } : undefined}
      title={`${label ? `${label}: ` : ""}${Math.round(v)}${l ? ` (${l})` : ""}${emphasis ? ` · ${emphasis} in comparison` : ""}`}
    >
      {Math.round(v)}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <DsSpinner size="sm" tone="subtle" className={className} />;
}

export function ErrorNote({ error, what }: { error: Envelope<unknown>["error"]; what?: string }) {
  if (!error) return null;
  return (
    <Alert tone="danger" title={what ? `${what} failed` : "Request failed"} className="p-2.5 text-sm">
      {error.message} <span className="font-mono text-2xs text-subtext">({error.code})</span>
    </Alert>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-subtext">{children}</div>;
}

export function SectionTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2 flex items-center justify-between gap-2", className)}>
      <h3 className={ui.eyebrow}>{children}</h3>
      {right}
    </div>
  );
}

export function MockBadge({ meta }: { meta: Record<string, unknown> | undefined }) {
  const src = typeof meta?.source === "string" ? meta.source : null;
  if (!src?.startsWith("mock")) return null;
  return (
    <Badge tone="outline" size="sm" title={`Answered by the dev mock engine (${src}). Values come from the dataset CSV.`}>
      {src.includes("csv") ? "mock data · CSV" : src.includes("fixtures") ? "mock data · fixtures" : "mock data"}
    </Badge>
  );
}

/** Small label/value stat (numbers in mono). */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-sunken px-2.5 py-2">
      <div className={ui.eyebrow}>{label}</div>
      <div className="mt-0.5 truncate font-mono text-md tabular-nums text-ink">{value}</div>
      {hint ? <div className="truncate text-2xs text-subtext">{hint}</div> : null}
    </div>
  );
}
