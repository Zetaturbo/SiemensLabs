"use client";
import { useCallback, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { conditionKey, conditionLabel } from "@/components/ui-blocks/condition-label";
import { setHardRequirements } from "@/lib/cases/actions";
import type { SourcingCase } from "@/lib/cases/types";
import type { FilterCondition } from "@/lib/data-api/types";
import { CURRENT_USER } from "./ui-store";

/** Fades and lifts a chip in once, unless the user prefers reduced motion. */
function useEnter(animate: boolean) {
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el || !animate || typeof el.animate !== "function") return;
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      el.animate(
        [
          { opacity: 0, transform: "translateY(4px) scale(0.96)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 260, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
    },
    [animate],
  );
}

function Chip({ condition, animate, onRemove, large }: { condition: FilterCondition; animate: boolean; onRemove: () => void; large?: boolean }) {
  const ref = useEnter(animate);
  const label = conditionLabel(condition);
  return (
    <span ref={ref} data-filter-chip className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-sunken pl-3 pr-1 text-ink ${large ? "text-sm" : "text-xs"}`}>
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="flex size-5 items-center justify-center rounded-full text-tertiary transition-colors hover:bg-hover hover:text-ink"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

/**
 * One row of chips for the case's hard requirements. Chips that were not there when the screen
 * opened animate in, so a chat turn that adds filters is visible. `layout="inline"` is the board's form:
 * left aligned, wrapping, with `children` (the "Edit filters" control) after the chips, shown even without chips.
 */
export function FilterChips({ c, layout = "bar", children }: { c: SourcingCase; layout?: "bar" | "inline"; children?: ReactNode }) {
  const conditions = c.hardRequirements as FilterCondition[];
  const [seen] = useState(() => new Set(conditions.map(conditionKey)));

  const remove = (key: string, label: string) =>
    setHardRequirements(
      c.id,
      conditions.filter((x) => conditionKey(x) !== key),
      CURRENT_USER.name,
      `removed ${label}`,
    );

  const chips = conditions.map((x) => {
    const key = conditionKey(x);
    return <Chip key={key} condition={x} animate={!seen.has(key)} large={layout === "inline"} onRemove={() => remove(key, conditionLabel(x))} />;
  });
  if (layout === "inline") {
    return (
      <div data-filter-bar aria-label="Filters" className="flex flex-wrap items-center gap-1.5">
        {chips}
        {conditions.length === 0 && <span className="text-sm text-tertiary">No filters</span>}
        {children}
      </div>
    );
  }
  // No chips, no row: the opening message says there are no filters yet.
  if (conditions.length === 0) return null;
  return (
    <div data-filter-bar aria-label="Filters" className="flex items-center justify-center gap-1.5 overflow-x-auto px-4 py-2.5">
      {chips}
    </div>
  );
}
