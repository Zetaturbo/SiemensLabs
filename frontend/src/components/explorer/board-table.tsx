"use client";
import type { ReactNode } from "react";
import { Bookmark, ChevronDown } from "lucide-react";
import { Button, IconButton, Tooltip } from "@/design-system/react";
import type { Level } from "@/lib/data-api/types";
import { cn } from "@/lib/utils";
import { Dot, LEVEL_STYLE, Num } from "@/components/ui-blocks/primitives";

/**
 * The Suppliers page's table pieces, shared by the candidates table and the real brake manufacturers list so both read
 * the same: header in the small type (text-sm, subtext), numbers right aligned in Geist Mono, a level as a dot plus the
 * word, a name that truncates with a tooltip, row hover, a sticky header inside the scrolling pane, a pin per row that is
 * always visible (outlined off, filled on), and "Show more" as a real button.
 */

/** Rows shown before "Show more". */
export const BOARD_PAGE = 8;

export const boardTableClass = "w-full table-fixed border-collapse text-sm";

/** Sticky header row inside the scrolling pane (its rule is an inset shadow, which sticks with it; a collapsed border would not). */
export const boardHeadClass = "sticky top-0 z-10 bg-surface";

export function HeadCell({ children, align = "left", hint, className }: { children?: ReactNode; align?: "left" | "right"; hint?: string; className?: string }) {
  return (
    <th scope="col" className={cn("h-9 whitespace-nowrap px-2 shadow-[inset_0_-1px_0_var(--lw-border-subtle)] align-middle text-sm font-medium text-subtext first:pl-4 last:pr-4", align === "right" ? "text-right" : "text-left", className)}>
      {hint ? (
        <Tooltip label={hint} side="bottom" className="text-sm font-normal">
          <span tabIndex={0} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--lw-focus-ring)]">
            {children}
          </span>
        </Tooltip>
      ) : (
        children
      )}
    </th>
  );
}

export function Cell({ children, align = "left", className }: { children?: ReactNode; align?: "left" | "right"; className?: string }) {
  return <td className={cn("h-12 px-2 align-middle first:pl-4 last:pr-4", align === "right" && "text-right", className)}>{children}</td>;
}

/** Body row: hairline divider and hover; a marked row (pinned, selected) keeps a quiet wash. */
export function BodyRow({ children, marked, ...data }: { children: ReactNode; marked?: boolean } & Record<`data-${string}`, string>) {
  return (
    <tr {...data} className={cn("border-b border-subtle transition-colors last:border-0 hover:bg-hover", marked && "bg-sunken/60")}>
      {children}
    </tr>
  );
}

/** Name on the first line (truncates, full name in a tooltip), a quiet second line (id, country). */
export function NameCell({ name, sub }: { name: string; sub?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col [&>span]:max-w-full">
      <Tooltip label={name} side="top" className="text-sm font-normal">
        <span className="min-w-0 truncate text-ink">{name}</span>
      </Tooltip>
      {sub && <span className="truncate text-sm text-tertiary">{sub}</span>}
    </div>
  );
}

/** A score with its level: dot plus the word, then the number right aligned in Geist Mono. */
export function LevelScore({ value, level, digits = 0 }: { value: number | null | undefined; level: Level | null | undefined; digits?: number }) {
  if (typeof value !== "number") return <span className="text-tertiary">–</span>;
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {level && (
        <>
          <Dot fill={LEVEL_STYLE[level].fill} />
          <span className="w-[3.25rem] text-left text-ink">{level}</span>
        </>
      )}
      <Num className="w-7 text-right text-ink">{value.toFixed(digits)}</Num>
    </span>
  );
}

/**
 * The per-row pin: always visible, outlined when off and filled when on. `reason` explains a disabled pin in the tooltip.
 */
export function PinToggle({ on, onToggle, label, disabled, reason }: { on: boolean; onToggle: () => void; label: string; disabled?: boolean; reason?: string }) {
  const tip = disabled && reason ? reason : label;
  return (
    <Tooltip label={tip} side="left" className="text-sm font-normal">
      <IconButton
        aria-label={tip}
        aria-pressed={on}
        size="sm"
        variant="ghost"
        disabled={disabled}
        className={cn(on ? "text-ink" : "text-subtext hover:text-ink", "disabled:opacity-40")}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <Bookmark className={cn(on && "fill-current")} />
      </IconButton>
    </Tooltip>
  );
}

/** "Show more" as a real button under a table. */
export function ShowMore({ onClick, count, className }: { onClick: () => void; count?: number; className?: string }) {
  return (
    <Button size="sm" variant="secondary" leading={<ChevronDown />} onClick={onClick} className={cn("mt-3", className)}>
      {count ? `Show ${count} more` : "Show more"}
    </Button>
  );
}
